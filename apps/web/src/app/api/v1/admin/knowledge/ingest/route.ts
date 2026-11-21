import { kbIngestRequestSchema } from "@/schemas/knowledge-graph";
import { withAdminSession } from "@/server/auth/admin-action";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { ingestAdminKnowledgeNode } from "@/server/knowledge-graph";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) {
    return jsonNoStore({ status: "denied" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ status: "invalid" }, 400);
  }

  const parsed = kbIngestRequestSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ status: "invalid" }, 400);

  const result = await withAdminSession(async actorUuid => {
    try {
      const ingested = await ingestAdminKnowledgeNode(parsed.data, actorUuid);
      return { status: "ok" as const, ingested };
    } catch {
      return { status: "failed" as const };
    }
  });

  if (result.status === "denied") return jsonNoStore({ status: "denied" }, 403);
  if (result.status === "failed") return jsonNoStore({ status: "failed" }, 503);
  return jsonNoStore({ status: "ok", ...result.ingested }, 201);
}
