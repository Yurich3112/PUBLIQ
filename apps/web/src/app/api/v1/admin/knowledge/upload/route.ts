import { withAdminSession } from "@/server/auth/admin-action";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { processAdminKnowledgeUpload } from "@/server/knowledge-upload";

const MAX_KB_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) {
    return jsonNoStore({ status: "denied" }, 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonNoStore({ status: "invalid" }, 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return jsonNoStore({ status: "invalid" }, 400);
  }
  if (file.size > MAX_KB_UPLOAD_BYTES) {
    return jsonNoStore({ status: "tooLarge" }, 413);
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf") && !lowerName.endsWith(".docx") && !lowerName.endsWith(".txt")) {
    return jsonNoStore({ status: "unsupportedMediaType" }, 415);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await withAdminSession(async actorUuid => {
    try {
      const uploaded = await processAdminKnowledgeUpload({
        fileName: file.name,
        mediaType: file.type || "application/pdf",
        bytes,
        actorUuid,
      });
      return { status: "ok" as const, uploaded };
    } catch {
      return { status: "failed" as const };
    }
  });

  if (result.status === "denied") return jsonNoStore({ status: "denied" }, 403);
  if (result.status === "failed") return jsonNoStore({ status: "failed" }, 422);
  return jsonNoStore({ status: "ok", ...result.uploaded }, 201);
}
