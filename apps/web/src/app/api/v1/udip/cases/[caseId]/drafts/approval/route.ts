import { udipApprovalInputSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { approveUdipDraft } from "@/server/udip/redaction-workflow";

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  return withUdipCase(request, (await params).caseId, async (actor, caseId) => {
    const parsed = await readUdipJson(request, udipApprovalInputSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await approveUdipDraft(actor, caseId, parsed.input.revision);
    return result.status === "ok" ? jsonNoStore(result.state) : udipProblem(result.status);
  });
}
