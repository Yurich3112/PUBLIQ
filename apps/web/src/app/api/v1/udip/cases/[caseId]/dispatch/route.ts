import { udipDispatchInputSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { recordUdipDispatch } from "@/server/udip/redaction-workflow";

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  return withUdipCase(request, (await params).caseId, async (actor, caseId) => {
    const parsed = await readUdipJson(request, udipDispatchInputSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await recordUdipDispatch(actor, caseId, parsed.input);
    return result.status === "ok" ? jsonNoStore({ sentDate: result.sentDate, processStatus: result.processStatus }) : udipProblem(result.status);
  });
}
