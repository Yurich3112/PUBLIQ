import { LOGGED_ACCESS } from "@/schemas/access";
import { createUdipCaseSchema, udipCaseQuerySchema } from "@/schemas/udip-case";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { createNewUdipCase, loadUdipCases } from "@/server/udip-cases";

export async function GET(request: Request) {
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed") return jsonNoStore({ status: "denied" }, 401);

  const url = new URL(request.url);
  const parsed = udipCaseQuerySchema.safeParse({
    year: url.searchParams.get("year") ?? undefined,
    processStatus: url.searchParams.get("processStatus") ?? undefined,
    healthColor: url.searchParams.get("healthColor") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  if (!parsed.success) return jsonNoStore({ status: "invalid" }, 400);

  try {
    const data = await loadUdipCases(parsed.data);
    return jsonNoStore({ status: "ok", ...data });
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) {
    return jsonNoStore({ status: "denied" }, 403);
  }
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed" || !access.context.actorUuid) {
    return jsonNoStore({ status: "denied" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ status: "invalid" }, 400);
  }

  const parsed = createUdipCaseSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ status: "invalid" }, 400);

  try {
    const created = await createNewUdipCase(parsed.data, access.context.actorUuid);
    return jsonNoStore({ status: "ok", case: created }, 201);
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}
