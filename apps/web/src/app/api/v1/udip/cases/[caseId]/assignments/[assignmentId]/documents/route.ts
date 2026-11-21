import { udipCaseIdSchema, udipEmailReplySchema, udipReplyRequestSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { addUdipReply } from "@/server/udip/documents";
import { udipProblem, withUdipCase } from "@/server/udip/http";
import { readUdipMultipart } from "@/server/udip/upload";

async function readReply(request: Request) {
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? ""))
    return readUdipJson(request, udipEmailReplySchema);
  const parsed = await readUdipMultipart(request, udipReplyRequestSchema);
  return parsed.status === "ok" ? { status: "ok" as const, input: { ...parsed.upload.metadata, file: parsed.upload.file } } : parsed;
}

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string; assignmentId: string }> }) {
  const { caseId, assignmentId } = await params;
  return withUdipCase(request, caseId, async (actor, id) => {
    if (!udipCaseIdSchema.safeParse(assignmentId).success) return udipProblem("missing");
    const input = await readReply(request);
    if (input.status !== "ok") return udipProblem(input.status);
    const result = await addUdipReply(actor, id, assignmentId, input.input);
    if (result.status === "missing" || result.status === "conflict") return udipProblem(result.status);
    return jsonNoStore({ document: result.document }, result.status === "created" ? 201 : 200);
  });
}
