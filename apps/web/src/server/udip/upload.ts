import "server-only";
import type { z } from "zod";
import { readUdipBody } from "./body.ts";
import { udipCaseUploadSchema, udipMaxFileBytes, type UdipCaseUpload } from "../../schemas/udip.ts";

const maxBodyBytes = udipMaxFileBytes + 64 * 1024;
export const wordMediaType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type UdipFile = { fileName: string; mediaType: string; content: Uint8Array<ArrayBuffer> };
export type UdipUpload = { metadata: UdipCaseUpload; file: UdipFile };

function isWordPackage(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Office documents are ZIP packages. Check the directory without decompressing any input.
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65_557); end--) {
    if (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length) continue;
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) return false;
    const count = view.getUint16(end + 10, true);
    const size = view.getUint32(end + 12, true);
    let cursor = view.getUint32(end + 16, true);
    if (cursor + size !== end || count !== view.getUint16(end + 8, true)) return false;
    let hasTypes = false;
    let hasDocument = false;
    for (let index = 0; index < count; index++) {
      if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) return false;
      const nameLength = view.getUint16(cursor + 28, true);
      const nameStart = cursor + 46;
      cursor = nameStart + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
      if (cursor > end) return false;
      if (nameLength === 19 || nameLength === 17) {
        const name = Buffer.from(bytes.subarray(nameStart, nameStart + nameLength)).toString("latin1");
        hasTypes ||= name === "[Content_Types].xml";
        hasDocument ||= name === "word/document.xml";
      }
    }
    return cursor === end && hasTypes && hasDocument;
  }
  return false;
}

export async function readUdipMultipart<T extends z.ZodType>(request: Request, schema: T) {
  const contentType = request.headers.get("content-type");
  if (!contentType || !/^multipart\/form-data\s*;/i.test(contentType)) return { status: "invalid" } as const;
  const body = await readUdipBody(request, maxBodyBytes);
  if (body.status !== "ok") return body;
  let form: FormData;
  try { form = await new Response(body.bytes, { headers: { "Content-Type": contentType } }).formData(); }
  catch { return { status: "invalid" } as const; }
  const fields = Array.from(form.keys());
  if (new Set(fields).size !== fields.length) return { status: "invalid" } as const;
  const { file, ...metadata } = Object.fromEntries(form);
  const parsed = schema.safeParse(metadata);
  if (!parsed.success || !(file instanceof File) || !file.size) return { status: "invalid" } as const;
  if (file.size > udipMaxFileBytes) return { status: "tooLarge" } as const;
  const fileName = file.name.normalize("NFC").trim();
  if (!fileName || fileName.length > 255 || /[\\/\p{Cc}]/u.test(fileName)) return { status: "invalid" } as const;
  const content = new Uint8Array(await file.arrayBuffer());
  const name = fileName.toLowerCase();
  const mediaType = name.endsWith(".pdf") && Buffer.from(content.subarray(0, 5)).toString("latin1") === "%PDF-"
    ? "application/pdf" : name.endsWith(".docx") && isWordPackage(content) ? wordMediaType : null;
  if (!mediaType) return { status: "unsupportedMediaType" } as const;
  return { status: "ok" as const, upload: { metadata: parsed.data, file: { fileName, mediaType, content } } };
}

export function readUdipUpload(request: Request) {
  return readUdipMultipart(request, udipCaseUploadSchema);
}
