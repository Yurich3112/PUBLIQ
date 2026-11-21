import { withAdminSession } from "@/server/auth/admin-action";
import { jsonNoStore } from "@/server/http";
import { loadAdminKnowledgeGraph } from "@/server/knowledge-graph";

export async function GET() {
  const result = await withAdminSession(async () => {
    try {
      const snapshot = await loadAdminKnowledgeGraph();
      return { status: "ok" as const, snapshot };
    } catch {
      return { status: "failed" as const };
    }
  });

  if (result.status === "denied") return jsonNoStore({ status: "denied" }, 403);
  if (result.status === "failed") return jsonNoStore({ status: "failed" }, 503);
  return jsonNoStore({ status: "ok", ...result.snapshot });
}
