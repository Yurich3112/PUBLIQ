import { udipCaseIdSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { retryUdipScan } from "@/server/udip/documents";
import { udipProblem, withUdipCase } from "@/server/udip/http";

type Context = { params: Promise<{ caseId: string; documentId: string }> };

export async function POST(request: Request, { params }: Context) {
  const { caseId, documentId } = await params;
  return withUdipCase(request, caseId, async (actor, id) => {
    if (!udipCaseIdSchema.safeParse(documentId).success) return udipProblem("missing");
    const result = await retryUdipScan(actor, id, documentId);
    return result.status === "ok" ? jsonNoStore({ document: result.document }) : udipProblem(result.status);
  });
}
