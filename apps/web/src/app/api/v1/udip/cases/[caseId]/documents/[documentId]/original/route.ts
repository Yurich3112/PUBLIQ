import { udipCaseIdSchema } from "@/schemas/udip";
import { readUdipOriginal } from "@/server/udip/documents";
import { udipProblem, withUdipCase } from "@/server/udip/http";

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string; documentId: string }> }) {
  const { caseId, documentId } = await params;
  return withUdipCase(request, caseId, async (actor, id) => {
    if (!udipCaseIdSchema.safeParse(documentId).success) return udipProblem("missing");
    const original = await readUdipOriginal(actor, id, documentId);
    if (!original) return udipProblem("missing");
    const name = encodeURIComponent(original.fileName).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(new Uint8Array(original.content), { headers: {
      "Content-Type": "application/octet-stream", "Content-Length": String(original.content.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store", "Cross-Origin-Resource-Policy": "same-origin", "X-Content-Type-Options": "nosniff",
    } });
  });
}
