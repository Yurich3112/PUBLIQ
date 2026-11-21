import { udipAssignmentInputSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { registerUdipAssignment } from "@/server/udip/cases";
import { udipProblem, withUdipCase } from "@/server/udip/http";

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  return withUdipCase(request, (await params).caseId, async (actor, caseId) => {
    const parsed = await readUdipJson(request, udipAssignmentInputSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await registerUdipAssignment(actor, caseId, parsed.input);
    if (result.status === "missing" || result.status === "conflict") return udipProblem(result.status);
    return jsonNoStore({ assignment: result.assignment }, result.status === "created" ? 201 : 200);
  });
}
