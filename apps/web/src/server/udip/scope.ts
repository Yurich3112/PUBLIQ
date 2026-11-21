import "server-only";
import type { Prisma } from "@modulon-poc/database";
import type { UdipActor } from "./access.ts";

export function caseScope(actor: UdipActor): Prisma.UdipCaseWhereInput {
  return actor.isAdmin ? {} : { OR: [{ ownerUuid: actor.id }, { assignments: { some: { assigneeUuid: actor.id } } }] };
}

/** Serialize changes to the current draft, redactions, approval and dispatch. */
export async function lockUdipCase(tx: Prisma.TransactionClient, actor: UdipActor, uuid: string) {
  const [row] = await tx.$queryRaw<{ signature: string; subject: string | null }[]>`
    SELECT c.signature, c.subject FROM udip_case c
    WHERE c.uuid = ${uuid}::uuid AND (
      ${actor.isAdmin}::boolean OR c.owner_uuid = ${actor.id}::uuid OR EXISTS (
        SELECT 1 FROM udip_department_assignment a WHERE a.case_uuid = c.uuid AND a.assignee_uuid = ${actor.id}::uuid
      )
    ) FOR UPDATE OF c
  `;
  return row ?? null;
}
