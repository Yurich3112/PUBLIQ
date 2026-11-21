import { udipDraftEditSchema, udipDraftGenerateSchema } from "@/schemas/udip";
import { jsonNoStore } from "@/server/http";
import { readUdipJson } from "@/server/udip/body";
import { readUdipDraft, saveUdipDraft } from "@/server/udip/drafts";
import { udipProblem, withUdipCase } from "@/server/udip/http";

type Context = { params: Promise<{ caseId: string }> };

export async function GET(request: Request, { params }: Context) {
  return withUdipCase(request, (await params).caseId, async (actor, id) => {
    const query = new URL(request.url).searchParams;
    const raw = query.get("version");
    const version = raw === null ? undefined : Number(raw);
    if (query.size > (raw === null ? 0 : 1) ||
        (version !== undefined && (!/^[1-9]\d*$/.test(raw ?? "") || version > 2_147_483_647))) return udipProblem("invalid");
    const draft = await readUdipDraft(actor, id, version);
    return draft ? jsonNoStore({ draft }) : udipProblem("missing");
  });
}

async function writeDraft(request: Request, { params }: Context, schema: typeof udipDraftGenerateSchema | typeof udipDraftEditSchema) {
  return withUdipCase(request, (await params).caseId, async (actor, id) => {
    const parsed = await readUdipJson(request, schema, 2 * 1024 * 1024);
    if (parsed.status !== "ok") return udipProblem(parsed.status);
    const result = await saveUdipDraft(actor, id, parsed.input);
    if (result.status === "conflict") return udipProblem("conflict", result.currentVersion);
    if (result.status !== "created") return udipProblem(result.status);
    return jsonNoStore({ draft: result.draft }, 201);
  });
}

export function POST(request: Request, context: Context) { return writeDraft(request, context, udipDraftGenerateSchema); }
export function PUT(request: Request, context: Context) { return writeDraft(request, context, udipDraftEditSchema); }
