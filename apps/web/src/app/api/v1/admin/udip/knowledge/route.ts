import { z } from "zod";
import { udipKnowledgeImportSchema, udipKnowledgeQuerySchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipAdmin } from "@/server/udip/http";
import { importUdipKnowledge, listUdipKnowledge } from "@/server/udip/knowledge";
import { readUdipMultipart } from "@/server/udip/upload";

const metadataSchema = z.object({ metadata: z.string().max(300_000) }).strict();

async function readImport(request: Request) {
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? ""))
    return readUdipJson(request, udipKnowledgeImportSchema, 2 * 1024 * 1024);
  const form = await readUdipMultipart(request, metadataSchema);
  if (form.status !== "ok") return form;
  try {
    const parsed = udipKnowledgeImportSchema.safeParse(JSON.parse(form.upload.metadata.metadata));
    return parsed.success ? { status: "ok" as const, input: parsed.data, file: form.upload.file } : { status: "invalid" } as const;
  } catch { return { status: "invalid" } as const; }
}

export function GET(request: Request) {
  return withUdipAdmin(request, async () => {
    const params = new URL(request.url).searchParams;
    const parsed = udipKnowledgeQuerySchema.safeParse(Object.fromEntries(params));
    if (!parsed.success || params.size !== Object.keys(parsed.data).length) return udipProblem("invalid");
    return jsonNoStore(await listUdipKnowledge(parsed.data.limit, parsed.data.offset));
  });
}

export function POST(request: Request) {
  return withUdipAdmin(request, async actor => {
    const parsed = await readImport(request);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await importUdipKnowledge(actor, parsed.input, "file" in parsed ? parsed.file : undefined);
    return result.status === "ok" ? jsonNoStore({ record: result.record }, 201) : udipProblem(result.status);
  });
}
