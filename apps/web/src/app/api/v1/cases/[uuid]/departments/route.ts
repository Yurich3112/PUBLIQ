import { LOGGED_ACCESS } from "@/schemas/access";
import { upsertUdipDepartmentReplySchema } from "@/schemas/udip-case";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { attachUdipDepartmentReply } from "@/server/udip-cases";

export async function POST(
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

  const parsed = upsertUdipDepartmentReplySchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ status: "invalid" }, 400);

  const { uuid } = await context.params;
  try {
    const updated = await attachUdipDepartmentReply(uuid, parsed.data, access.context.actorUuid);
    if (!updated) return jsonNoStore({ status: "notFound" }, 404);
    return jsonNoStore({ status: "ok", case: updated });
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}
