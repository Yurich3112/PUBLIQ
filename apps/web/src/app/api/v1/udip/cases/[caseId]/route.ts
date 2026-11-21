import { udipCaseIdSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { getUdipActor } from "@/server/udip/access";
import { readUdipCase } from "@/server/udip/cases";
import { udipProblem } from "@/server/udip/http";

export async function GET(_request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const access = await getUdipActor();
  if (access.status !== "ok") return udipProblem(access.status);
  const id = udipCaseIdSchema.safeParse((await params).caseId);
  if (!id.success) return udipProblem("missing");
  try {
    const detail = await readUdipCase(access.actor, id.data);
    return detail ? jsonNoStore(detail) : udipProblem("missing");
  } catch {
    return udipProblem("unavailable");
  }
}
