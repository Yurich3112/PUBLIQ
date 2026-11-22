import { ADMIN_ACCESS, LOGGED_ACCESS } from "@/schemas/access";
import { updateUdipCaseSchema } from "@/schemas/udip-case";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { deleteUdipCaseById, loadUdipCaseById, patchUdipCase } from "@/server/udip-cases";

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed") return jsonNoStore({ status: "denied" }, 401);

  const { uuid } = await context.params;
  try {
    const found = await loadUdipCaseById(uuid);
    if (!found) return jsonNoStore({ status: "notFound" }, 404);
    return jsonNoStore({ status: "ok", case: found });
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
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

  const parsed = updateUdipCaseSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ status: "invalid" }, 400);

  const { uuid } = await context.params;
  try {
    const updated = await patchUdipCase(uuid, parsed.data, access.context.actorUuid);
    if (!updated) return jsonNoStore({ status: "notFound" }, 404);
    return jsonNoStore({ status: "ok", case: updated });
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) {
    return jsonNoStore({ status: "denied" }, 403);
  }
  const access = await getAccess(ADMIN_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed") {
    return jsonNoStore({ status: "denied" }, access.status === "unauthenticated" ? 401 : 403);
  }

  const { uuid } = await context.params;
  try {
    const deleted = await deleteUdipCaseById(uuid);
    if (!deleted) return jsonNoStore({ status: "notFound" }, 404);
    return jsonNoStore({ status: "ok" });
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}
