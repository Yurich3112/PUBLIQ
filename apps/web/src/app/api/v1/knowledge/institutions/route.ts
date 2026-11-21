import { LOGGED_ACCESS } from "@/schemas/access";
import { getAccess } from "@/server/auth/access";
import { jsonNoStore } from "@/server/http";
import { loadInstitutionsForLlm } from "@/server/knowledge-graph";

export async function GET() {
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed") return jsonNoStore({ status: "denied" }, 401);

  try {
    const institutions = await loadInstitutionsForLlm();
    return jsonNoStore({ status: "ok", total: institutions.length, institutions });
  } catch {
    return jsonNoStore({ status: "failed" }, 503);
  }
}
