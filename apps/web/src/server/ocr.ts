import "server-only";
import {
  MAX_OCR_RESPONSE_BYTES,
  ocrAnalysisResponseSchema,
  type OcrAnalysisResponse,
  type OcrErrorCode,
} from "../schemas/ocr.ts";

export class OcrWorkerError extends Error {
  readonly code: OcrErrorCode;
  readonly httpStatus: number;

  constructor(code: OcrErrorCode, httpStatus: number) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function resolvePyworkerOcrEndpoint(env: NodeJS.ProcessEnv = process.env) {
  let base: URL;
  try {
    base = new URL(env.PYWORKER_URL || "");
  } catch {
    throw new OcrWorkerError("unavailable", 503);
  }
  const privateWorker = env.PYWORKER_ALLOW_PRIVATE_NETWORK === "true" && base.hostname === "pyworker";
  const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
  if (
    !["http:", "https:"].includes(base.protocol)
    || base.username
    || base.password
    || base.pathname !== "/"
    || base.search
    || base.hash
    || (base.protocol === "http:" && !isLoopback && !privateWorker)
  ) {
    throw new OcrWorkerError("unavailable", 503);
  }
  const token = env.PYWORKER_API_TOKEN || "";
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(token) || token.includes("CHANGE_ME")) {
    throw new OcrWorkerError("unavailable", 503);
  }
  return { url: new URL("/v1/tasks/ocr", base), token };
}

export async function analyzeDocumentWithPyworker(
  bytes: Uint8Array,
  {
    fileName,
    maxPages = 10,
    includePreviewImages = true,
    timeoutMs = 70_000,
    env = process.env,
    fetchImpl = globalThis.fetch,
  }: {
    fileName: string;
    maxPages?: number;
    includePreviewImages?: boolean;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof globalThis.fetch;
  },
): Promise<OcrAnalysisResponse> {
  const { url, token } = resolvePyworkerOcrEndpoint(env);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "X-File-Name": encodeURIComponent(fileName),
        "X-OCR-Options": JSON.stringify({
          max_pages: maxPages,
          include_preview_images: includePreviewImages,
        }),
      },
      body: Buffer.from(bytes),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new OcrWorkerError("timeout", 504);
    }
    throw new OcrWorkerError("unavailable", 503);
  }

  try {
    if (response.status === 413) throw new OcrWorkerError("tooLarge", 413);
    if (response.status === 415) throw new OcrWorkerError("unsupportedMediaType", 415);
    if (response.status === 422) throw new OcrWorkerError("invalidDocument", 422);
    if (response.status === 503) throw new OcrWorkerError("unavailable", 503);
    if (response.status === 504 || response.status === 408) throw new OcrWorkerError("timeout", 504);
    if (response.status !== 200) throw new OcrWorkerError("failed", 502);

    const reader = response.body?.getReader();
    if (!reader) throw new OcrWorkerError("failed", 502);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_OCR_RESPONSE_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new OcrWorkerError("failed", 502);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const decoded = new TextDecoder().decode(Buffer.concat(chunks, size));
    const parsed = ocrAnalysisResponseSchema.safeParse(JSON.parse(decoded));
    if (!parsed.success) throw new OcrWorkerError("failed", 502);
    return parsed.data;
  } catch (error) {
    if (error instanceof OcrWorkerError) throw error;
    throw new OcrWorkerError("failed", 502);
  } finally {
    await response.body?.cancel().catch(() => undefined);
  }
}
