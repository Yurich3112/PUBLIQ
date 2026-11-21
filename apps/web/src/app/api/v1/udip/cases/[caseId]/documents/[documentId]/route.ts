import { udipCaseIdSchema, udipTranscriptionSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { readUdipDocument, saveUdipTranscription } from "@/server/udip/documents";
import { udipProblem, withUdipCase } from "@/server/udip/http";

type Context = { params: Promise<{ caseId: string; documentId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { caseId, documentId } = await params;
  return withUdipCase(request, caseId, async (actor, id) => {
    if (!udipCaseIdSchema.safeParse(documentId).success) return udipProblem("missing");
    const document = await readUdipDocument(actor, id, documentId);
    return document ? jsonNoStore({ document }) : udipProblem("missing");
  });
}

export async function PATCH(request: Request, { params }: Context) {
  const { caseId, documentId } = await params;
  return withUdipCase(request, caseId, async (actor, id) => {
    if (!udipCaseIdSchema.safeParse(documentId).success) return udipProblem("missing");
    const parsed = await readUdipJson(request, udipTranscriptionSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await saveUdipTranscription(actor, id, documentId, parsed.input);
    if (result.status === "conflict") return udipProblem(result.status, result.currentVersion);
    return result.status === "ok" ? jsonNoStore({ document: result.document }) : udipProblem("missing");
  });
}
