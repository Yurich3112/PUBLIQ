import { udipCaseIdSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { udipProblem, withUdipAdmin } from "@/server/udip/http";
import { approveUdipKnowledge } from "@/server/udip/knowledge";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUdipAdmin(request, async actor => {
    if (!udipCaseIdSchema.safeParse(id).success) return udipProblem("missing");
    const result = await approveUdipKnowledge(actor, id);
    return result.status === "ok" ? jsonNoStore({ record: result.record }) : udipProblem(result.status);
  });
}
