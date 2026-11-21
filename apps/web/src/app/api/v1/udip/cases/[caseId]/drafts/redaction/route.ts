import { udipRedactionInputSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { readUdipRedaction, saveUdipRedaction } from "@/server/udip/redaction-workflow";

type Context = { params: Promise<{ caseId: string }> };
const target = { kind: "draft" } as const;

export async function GET(request: Request, { params }: Context) {
  return withUdipCase(request, (await params).caseId, async (actor, caseId) => {
    const result = await readUdipRedaction(actor, caseId, target);
    return result.status === "ok" ? jsonNoStore(result.state) : udipProblem(result.status);
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return withUdipCase(request, (await params).caseId, async (actor, caseId) => {
    const parsed = await readUdipJson(request, udipRedactionInputSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await saveUdipRedaction(actor, caseId, target, parsed.input);
    return result.status === "ok" ? jsonNoStore(result.state) : udipProblem(result.status);
  });
}
