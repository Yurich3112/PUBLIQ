import "server-only";
import { ROLE_LEVELS } from "../../schemas/access.ts";
import { getAccess } from "../auth/access.ts";

export type UdipActor = { id: string; isAdmin: boolean };

export async function getUdipActor() {
  const access = await getAccess({ requireLogin: true, minRoleLevel: ROLE_LEVELS.USER });
  if (access.status === "unavailable") return { status: "unavailable" } as const;
  if (access.status === "unauthenticated") return { status: "unauthenticated" } as const;
  if (access.status !== "allowed" || !access.context.actorUuid) return { status: "denied" } as const;
  const actor: UdipActor = { id: access.context.actorUuid, isAdmin: (access.context.roleLevel ?? 0) >= ROLE_LEVELS.ADMIN };
  return { status: "ok" as const, actor };
}
