import { udipSummarySuggestionSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { suggestUdipSummary } from "@/server/udip/ai";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipCase } from "@/server/udip/http";

type Context = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, { params }: Context) {
  return withUdipCase(request, (await params).caseId, async (actor, id) => {
    const parsed = await readUdipJson(request, udipSummarySuggestionSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await suggestUdipSummary(actor, id, parsed.input);
    if (result.status !== "ok") return udipProblem(result.status);
    return jsonNoStore({ expectedVersion: result.expectedVersion, summary: result.summary });
  });
}
