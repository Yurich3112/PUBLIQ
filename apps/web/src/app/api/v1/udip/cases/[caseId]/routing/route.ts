import { udipConfirmRouteSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { confirmUdipRoute, listUdipRouting } from "@/server/udip/routing";

type Context = { params: Promise<{ caseId: string }> };

export async function GET(request: Request, { params }: Context) {
  return withUdipCase(request, (await params).caseId, async (actor, id) => {
    const result = await listUdipRouting(actor, id);
    return result ? jsonNoStore(result) : udipProblem("missing");
  });
}

export async function POST(request: Request, { params }: Context) {
  return withUdipCase(request, (await params).caseId, async (actor, id) => {
    const parsed = await readUdipJson(request, udipConfirmRouteSchema);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await confirmUdipRoute(actor, id, parsed.input);
    if (result.status === "conflict") return udipProblem(result.status, result.currentVersion);
    return result.status === "ok" ? jsonNoStore({ route: result.route }) : udipProblem(result.status);
  });
}
