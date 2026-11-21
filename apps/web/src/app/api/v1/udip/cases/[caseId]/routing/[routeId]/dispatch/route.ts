import { udipCaseIdSchema, udipExternalDispatchSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { recordUdipExternalDispatch } from "@/server/udip/routing";

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string; routeId: string }> }) {
  const { caseId, routeId } = await params;
  return withUdipCase(request, caseId, async (actor, id) => {
    if (!udipCaseIdSchema.safeParse(routeId).success) return udipProblem("missing");
    const parsed = await readUdipJson(request, udipExternalDispatchSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await recordUdipExternalDispatch(actor, id, routeId, parsed.input.sentDate);
    return result.status === "ok" ? jsonNoStore({ route: result.route }) : udipProblem(result.status);
  });
}
