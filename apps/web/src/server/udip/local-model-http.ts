import "server-only";
import type { z } from "zod";
import { readUdipBody } from "./body.ts";

export function localModelUrl(value: string | undefined, privateHost?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const allowedHosts = [
      "127.0.0.1",
      "localhost",
      "[::1]",
      privateHost,
      process.env.PYWORKER_ALLOW_PRIVATE_NETWORK === "true" ? "host.docker.internal" : undefined,
    ];
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/"
      || url.search || url.hash || !allowedHosts.includes(url.hostname)) return null;
    return url;
  } catch { return null; }
}

export async function postLocalModel<T extends z.ZodType>(url: URL, body: unknown, schema: T,
  { timeout, maxBytes, token }: { timeout: number; maxBytes: number; token?: string }): Promise<z.output<T> | null> {
  try {
    const response = await fetch(url, { method: "POST", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const read = await readUdipBody(response, maxBytes);
    if (read.status !== "ok") return null;
    const parsed = schema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(read.bytes)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
