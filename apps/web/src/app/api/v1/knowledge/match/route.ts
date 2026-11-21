import { LOGGED_ACCESS } from "@/schemas/access";
import { kbMatchRequestSchema } from "@/schemas/knowledge-graph";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { matchAgainstKnowledgeGraph } from "@/server/knowledge-graph";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) {
    return jsonNoStore({ status: "denied" }, 403);
  }
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed") return jsonNoStore({ status: "denied" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ status: "invalid" }, 400);
  }

  const parsed = kbMatchRequestSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ status: "invalid" }, 400);

  try {
    const result = await matchAgainstKnowledgeGraph(parsed.data);
    return jsonNoStore({ status: "ok", ...result });
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}
