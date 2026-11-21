import { udipCaseIdSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { udipProblem, withUdipAdmin } from "@/server/udip/http";
import { readUdipKnowledge } from "@/server/udip/knowledge";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUdipAdmin(request, async () => {
    if (!udipCaseIdSchema.safeParse(id).success) return udipProblem("missing");
    const record = await readUdipKnowledge(id);
    return record ? jsonNoStore({ record }) : udipProblem("missing");
  });
}
