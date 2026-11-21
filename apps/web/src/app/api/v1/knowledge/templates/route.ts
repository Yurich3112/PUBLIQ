import { LOGGED_ACCESS } from "@/schemas/access";
import { getAccess } from "@/server/auth/access";
import { jsonNoStore } from "@/server/http";
import { loadResponseTemplates } from "@/server/knowledge-graph";

export async function GET() {
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed") return jsonNoStore({ status: "denied" }, 401);

  try {
    const templates = await loadResponseTemplates();
    return jsonNoStore({ status: "ok", total: templates.length, templates });
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}
