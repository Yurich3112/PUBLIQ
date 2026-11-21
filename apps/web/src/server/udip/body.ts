import "server-only";
import type { z } from "zod";
import { udipMaxTextChars } from "../../schemas/udip.ts";

export async function readUdipBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get("content-length")) > maxBytes) return { status: "tooLarge" } as const;
  const reader = request.body?.getReader();
  if (!reader) return { status: "invalid" } as const;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 30_000);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { status: "tooLarge" } as const;
      }
      chunks.push(value);
    }
    if (timedOut) return { status: "timeout" } as const;
    return { status: "ok" as const, bytes: new Uint8Array(Buffer.concat(chunks, length)) };
  } catch {
    return { status: timedOut ? "timeout" : "invalid" } as const;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function readUdipJson<T extends z.ZodType>(request: Request, schema: T, maxBytes = udipMaxTextChars * 6 + 64 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
    return { status: "unsupportedMediaType" } as const;
  const body = await readUdipBody(request, maxBytes);
  if (body.status !== "ok") return body;
  try {
    const parsed = schema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.bytes)));
    return parsed.success ? { status: "ok" as const, input: parsed.data } : { status: "invalid" as const };
  } catch { return { status: "invalid" } as const; }
}
