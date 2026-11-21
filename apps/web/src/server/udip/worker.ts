import "server-only";
import { z } from "zod";
import { udipMaxTextChars, udipModelSuggestionSchema, udipOcrPagesSchema } from "../../schemas/udip.ts";
import { localModelUrl, postLocalModel } from "./local-model-http.ts";

function worker() {
  const url = localModelUrl(process.env.PYWORKER_URL, process.env.PYWORKER_ALLOW_PRIVATE_NETWORK === "true" ? "pyworker" : undefined);
  const token = process.env.PYWORKER_API_TOKEN;
  return url && token && /^[A-Za-z0-9_-]{32,512}$/.test(token) && !token.includes("CHANGE_ME") ? { url, token } : null;
}

export async function detectUdipPii(text: string) {
  const target = worker();
  if (!target || !text || text.length > 260_000) return [];
  const result = await postLocalModel(new URL("/v1/tasks/udip/pii", target.url), { text },
    z.object({ suggestions: z.array(udipModelSuggestionSchema).max(2000) }),
    { timeout: 92_000, maxBytes: 300_000, token: target.token });
  return result?.suggestions ?? [];
}

export async function readUdipScan(bytes: Uint8Array) {
  const target = worker();
  if (!target) return null;
  return postLocalModel(new URL("/v1/tasks/udip/ocr", target.url), { content_base64: Buffer.from(bytes).toString("base64") },
    z.object({ text: z.string().trim().min(1).max(udipMaxTextChars).refine(text => !text.includes("\0")), pages: udipOcrPagesSchema }),
    { timeout: 92_000, maxBytes: 2_000_000, token: target.token });
}
