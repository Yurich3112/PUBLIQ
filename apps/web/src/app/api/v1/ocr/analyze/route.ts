import { LOGGED_ACCESS } from "@/schemas/access";
import {
  detectOcrFileKind,
  MAX_OCR_UPLOAD_BYTES,
  type OcrErrorCode,
} from "@/schemas/ocr";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { analyzeDocumentWithPyworker, OcrWorkerError } from "@/server/ocr";

const activeOwners = new Set<string>();
const MAX_MULTIPART_BYTES = MAX_OCR_UPLOAD_BYTES + 64 * 1024;

function fail(status: OcrErrorCode, httpStatus: number) {
  return jsonNoStore({ status }, httpStatus);
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return fail("denied", 403);
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return fail("unavailable", 503);
  if (access.status !== "allowed" || !access.context.actorUuid) return fail("denied", 401);

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    return fail("tooLarge", 413);
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    return fail("invalid", 400);
  }

  const owner = access.context.actorUuid;
  if (activeOwners.has(owner)) return fail("busy", 429);
  activeOwners.add(owner);

  try {
    const reader = request.body?.getReader();
    if (!reader) return fail("invalid", 400);

    const chunks: Uint8Array[] = [];
    let length = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void reader.cancel().catch(() => undefined);
    }, 30_000);

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_MULTIPART_BYTES) {
          await reader.cancel().catch(() => undefined);
          return fail("tooLarge", 413);
        }
        chunks.push(value);
      }
    } catch {
      return fail(timedOut ? "timeout" : "invalid", timedOut ? 408 : 400);
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }

    if (timedOut) return fail("timeout", 408);

    let form: FormData;
    try {
      form = await new Response(new Uint8Array(Buffer.concat(chunks, length)), {
        headers: { "Content-Type": contentType },
      }).formData();
    } catch {
      return fail("invalid", 400);
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return fail("invalid", 400);
    if (file.size > MAX_OCR_UPLOAD_BYTES) return fail("tooLarge", 413);

    const name = file.name.normalize("NFC").trim();
    if (!name || name.length > 255 || name === "." || name === ".." || /[\\/\p{Cc}]/u.test(name)) {
      return fail("invalid", 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!detectOcrFileKind(bytes)) return fail("unsupportedMediaType", 415);

    const result = await analyzeDocumentWithPyworker(bytes, { fileName: name });
    return jsonNoStore(result, 200);
  } catch (error) {
    if (error instanceof OcrWorkerError) return fail(error.code, error.httpStatus);
    return fail("failed", 500);
  } finally {
    activeOwners.delete(owner);
  }
}
