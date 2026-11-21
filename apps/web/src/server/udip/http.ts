import "server-only";
import { udipCaseIdSchema, type UdipError } from "../../schemas/udip.ts";
import { getAuthConfig } from "../auth/config.ts";
import { jsonNoStore } from "../http.ts";
import { getUdipActor, type UdipActor } from "./access.ts";

const errorCodes: Record<UdipError, number> = {
  invalid: 400, unauthenticated: 401, denied: 403, missing: 404, conflict: 409,
  tooLarge: 413, unsupportedMediaType: 415, timeout: 408, unavailable: 503,
};

export function udipProblem(status: UdipError, currentVersion?: number) {
  return jsonNoStore({ status, ...(currentVersion === undefined ? {} : { currentVersion }) }, errorCodes[status]);
}

export async function withUdipCase(request: Request, caseId: string, action: (actor: UdipActor, id: string) => Promise<Response>) {
  if (request.method !== "GET" && request.method !== "HEAD" && request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return udipProblem("denied");
  const access = await getUdipActor();
  if (access.status !== "ok") return udipProblem(access.status);
  const parsed = udipCaseIdSchema.safeParse(caseId);
  if (!parsed.success) return udipProblem("missing");
  try { return await action(access.actor, parsed.data); }
  catch { return udipProblem("unavailable"); }
}
