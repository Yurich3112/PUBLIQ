import { udipManualSummaryInputSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { readUdipManualSummary, saveUdipManualSummary } from "@/server/udip/recommendations";

type Context = { params: Promise<{ caseId: string }> };

export async function GET(request: Request, { params }: Context) {
  return withUdipCase(request, (await params).caseId, async (actor, id) => {
    const result = await readUdipManualSummary(actor, id);
    return result.status === "ok" ? jsonNoStore({ version: result.version, summary: result.summary }) : udipProblem(result.status);
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return withUdipCase(request, (await params).caseId, async (actor, id) => {
    const parsed = await readUdipJson(request, udipManualSummaryInputSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await saveUdipManualSummary(actor, id, parsed.input);
    if (result.status === "conflict") return udipProblem(result.status, result.currentVersion);
    return result.status === "ok" ? jsonNoStore({ version: result.version, summary: result.summary }) : udipProblem(result.status);
  });
}
