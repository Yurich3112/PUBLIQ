import { udipCaseListQuerySchema } from "@/schemas/udip";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { getUdipActor } from "@/server/udip/access";
import { listUdipCases, registerUdipCase } from "@/server/udip/cases";
import { udipProblem } from "@/server/udip/http";
import { readUdipUpload } from "@/server/udip/upload";

export async function GET(request: Request) {
  const access = await getUdipActor();
  if (access.status !== "ok") return udipProblem(access.status);
  const params = new URL(request.url).searchParams;
  const query = udipCaseListQuerySchema.safeParse(Object.fromEntries(params));
  if (!query.success || params.size !== Object.keys(query.data).length) return udipProblem("invalid");
  try {
    return jsonNoStore(await listUdipCases(access.actor, query.data));
  } catch {
    return udipProblem("unavailable");
  }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) return udipProblem("denied");
  const access = await getUdipActor();
  if (access.status !== "ok") return udipProblem(access.status);
  try {
    const input = await readUdipUpload(request);
    if (input.status !== "ok") return udipProblem(input.status);
    const result = await registerUdipCase(access.actor, input.upload);
    if (result.status === "conflict") return udipProblem(result.status);
    return jsonNoStore(result.body, result.status === "created" ? 201 : 200);
  } catch {
    return udipProblem("unavailable");
  }
}
