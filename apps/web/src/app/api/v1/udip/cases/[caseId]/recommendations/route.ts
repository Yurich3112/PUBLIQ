import { jsonNoStore } from "@/server/http";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { readUdipRecommendations } from "@/server/udip/recommendations";

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  return withUdipCase(request, (await params).caseId, async (actor, id) => {
    const result = await readUdipRecommendations(actor, id);
    return result.status === "ok" ? jsonNoStore({ summaryVersion: result.summaryVersion, questions: result.questions }) : udipProblem(result.status);
  });
}
