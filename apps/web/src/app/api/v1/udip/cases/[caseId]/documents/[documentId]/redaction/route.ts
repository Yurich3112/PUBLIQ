import { udipCaseIdSchema, udipRedactionInputSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { readUdipRedaction, saveUdipRedaction } from "@/server/udip/redaction-workflow";

type Context = { params: Promise<{ caseId: string; documentId: string }> };

async function handle(request: Request, { params }: Context, save: boolean) {
  const { caseId, documentId } = await params;
  return withUdipCase(request, caseId, async (actor, id) => {
    if (!udipCaseIdSchema.safeParse(documentId).success) return udipProblem("missing");
    const target = { kind: "intake" as const, documentUuid: documentId };
    if (!save) {
      const result = await readUdipRedaction(actor, id, target);
      return result.status === "ok" ? jsonNoStore(result.state) : udipProblem(result.status);
    }
    const parsed = await readUdipJson(request, udipRedactionInputSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await saveUdipRedaction(actor, id, target, parsed.input);
    return result.status === "ok" ? jsonNoStore(result.state) : udipProblem(result.status);
  });
}

export function GET(request: Request, context: Context) { return handle(request, context, false); }
export function PATCH(request: Request, context: Context) { return handle(request, context, true); }
