import { udipRevisionSchema } from "@/schemas/udip";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { exportUdipDraft } from "@/server/udip/redaction-workflow";

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  return withUdipCase(request, (await params).caseId, async (actor, caseId) => {
    const query = new URL(request.url).searchParams;
    const revision = udipRevisionSchema.safeParse(query.get("revision"));
    if (!revision.success || query.size !== 1) return udipProblem("invalid");
    const result = await exportUdipDraft(actor, caseId, revision.data);
    if (result.status !== "ok") return udipProblem(result.status);
    return new Response(result.text, { headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  });
}
