import "server-only";
import type { Prisma } from "@modulon-poc/database";
import type { UdipActor } from "./access.ts";

export function caseScope(actor: UdipActor): Prisma.UdipCaseWhereInput {
  return actor.isAdmin ? {} : { OR: [{ ownerUuid: actor.id }, { assignments: { some: { assigneeUuid: actor.id } } }] };
}
