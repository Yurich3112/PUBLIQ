import "server-only";
import type { UdipError } from "../../schemas/udip.ts";
import { jsonNoStore } from "../http.ts";

const errorCodes: Record<UdipError, number> = {
  invalid: 400, unauthenticated: 401, denied: 403, missing: 404, conflict: 409,
  tooLarge: 413, unsupportedMediaType: 415, timeout: 408, unavailable: 503,
};

export function udipProblem(status: UdipError) {
  return jsonNoStore({ status }, errorCodes[status]);
}
