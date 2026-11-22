import { LOGGED_ACCESS } from "@/schemas/access";
import {
  detectOcrFileKind,
  MAX_OCR_UPLOAD_BYTES,
  type OcrAnalysisResponse,
  type OcrErrorCode,
  type OcrLine,
  type OcrWord,
} from "@/schemas/ocr";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { analyzeDocumentWithPyworker, OcrWorkerError } from "@/server/ocr";
import { extractUdipText } from "@/server/udip/extraction";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isDocxUpload(name: string, bytes: Uint8Array): boolean {
  if (!name.toLowerCase().endsWith(".docx")) return false;
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function buildWordAnalysisResponse(text: string, durationMs: number): OcrAnalysisResponse {
  const pageW = 1240;
  const pageH = 1754;
  const marginX = 120;
  const maxCharsPerLine = 74;
  const lineHeight = 32;
  const words: OcrWord[] = [];
  const lines: OcrLine[] = [];

  const paragraphs = text.split(/\r?\n/);
  const visualLines: string[] = [];
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      visualLines.push("");
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    let current = "";
    for (const token of tokens) {
      if (current && current.length + 1 + token.length > maxCharsPerLine) {
        visualLines.push(current);
        current = token;
      } else {
        current = current ? `${current} ${token}` : token;
      }
    }
    if (current) visualLines.push(current);
  }

  let y = 130;
  let wordCounter = 0;
  let lineCounter = 0;
  for (const lineText of visualLines) {
    if (y > pageH - 120) break;
    if (!lineText) {
      y += Math.round(lineHeight * 0.65);
      continue;
    }
    const lineId = `docx_l_${lineCounter++}`;
    const tokens = lineText.split(/\s+/).filter(Boolean);
    const wordIds: string[] = [];
    let x = marginX;
    for (const token of tokens) {
      const cleanToken = token.slice(0, 256);
      const w = Math.max(12, Math.round(cleanToken.length * 12));
      const wordId = `docx_w_${wordCounter++}`;
      wordIds.push(wordId);
      words.push({
        id: wordId,
        line_id: lineId,
        text: cleanToken,
        bbox: [x, y, Math.min(w, pageW - x - 40), 22],
        angle_deg: 0,
        confidence: 1,
        zone: "printed",
        aligned_by: "digital_native",
      });
      x = Math.min(pageW - 80, x + w + 8);
    }
    lines.push({
      line_id: lineId,
      zone: "printed",
      bbox: [marginX, y, Math.max(40, x - marginX), 24],
      angle_deg: 0,
      text: lineText.slice(0, 4096),
      word_ids: wordIds,
    });
    y += lineHeight;
  }

  return {
    status: "ok",
    executor: "pyworker",
    engine: {
      detector: "docx-xml",
      recognizer: "word-text-fastpath",
    },
    duration_ms: Math.max(1, Math.round(durationMs)),
    page_count: 1,
    assembled_text: text,
    stamp_metadata: {
      received_date: null,
      registry_number: null,
      raw_stamp_lines: [],
    },
    legibility: {
      status: "legible",
      average_confidence: 1,
      low_confidence_ratio: 0,
      recommend_clarification: false,
      reason: null,
    },
    pages: [
      {
        page_index: 0,
        width: pageW,
        height: pageH,
        source_mode: "digital_text",
        grid_removed: false,
        preview_image_data_url: null,
        lines,
        words,
      },
    ],
  };
}

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

    if (isDocxUpload(name, bytes)) {
      const started = performance.now();
      const extracted = await extractUdipText({
        fileName: name,
        mediaType: DOCX_MIME,
        content: bytes,
      });
      if (!extracted) return fail("invalid", 422);
      return jsonNoStore(buildWordAnalysisResponse(extracted, performance.now() - started), 200);
    }

    if (detectOcrFileKind(bytes) !== "pdf") return fail("unsupportedMediaType", 415);

    const result = await analyzeDocumentWithPyworker(bytes, {
      fileName: name,
      signal: request.signal,
    });
    return jsonNoStore(result, 200);
  } catch (error) {
    if (error instanceof OcrWorkerError) return fail(error.code, error.httpStatus);
    return fail("failed", 500);
  } finally {
    activeOwners.delete(owner);
  }
}
