import "server-only";
import type { z } from "zod";
import { udipDraftPointSchema, type udipDraftEditSchema, type udipDraftGenerateSchema, type UdipDraftPoint, type UdipDraftVersion } from "../../schemas/udip.ts";
import { getDatabase } from "../database.ts";
import type { UdipActor } from "./access.ts";
import { caseScope, lockUdipCase } from "./scope.ts";

type DraftInput = z.infer<typeof udipDraftGenerateSchema> | z.infer<typeof udipDraftEditSchema>;
const draftFields = { uuid: true, version: true, text: true, points: true, createdAt: true } as const;
const storedPoints = udipDraftPointSchema.array().nullable();
const noMaterial = "Brak materia\u0142u";
const maxPointText = 8000;

function asDraft(row: { uuid: string; version: number; text: string; points: unknown; createdAt: Date }): UdipDraftVersion {
  return { id: row.uuid, version: row.version, text: row.text, points: storedPoints.parse(row.points), createdAt: row.createdAt.toISOString() };
}

export async function readUdipDraft(actor: UdipActor, caseUuid: string, version?: number) {
  const db = getDatabase();
  const row = await db.udipDraftVersion.findFirst({
    where: { caseUuid, case: caseScope(actor), ...(version === undefined ? {} : { version }) },
    orderBy: { version: "desc" }, select: draftFields,
  });
  return row ? asDraft(row) : null;
}

export async function saveUdipDraft(actor: UdipActor, caseUuid: string, input: DraftInput) {
  const db = getDatabase();
  try {
    return await db.$transaction(async tx => {
      const record = await lockUdipCase(tx, actor, caseUuid);
      if (!record) return { status: "missing" as const };
      const latest = await tx.udipDraftVersion.findFirst({ where: { caseUuid }, orderBy: { version: "desc" }, select: { version: true } });
      const currentVersion = latest?.version ?? 0;
      if (currentVersion !== input.expectedVersion) return { status: "conflict" as const, currentVersion };

      const requestedIds = [...new Set(input.points.flatMap(point => point.sourceDocumentIds))];
      const rows = requestedIds.length ? await tx.udipDocument.findMany({
        where: { uuid: { in: requestedIds }, caseUuid, kind: "departmentReply" },
        select: { uuid: true, status: true, extractedText: true },
      }) : [];
      if (rows.length !== requestedIds.length) return { status: "invalid" as const };
      const sources = new Map(rows.map(row => [row.uuid, row]));
      const points = input.points.map(point => {
        const usable = [...new Set(point.sourceDocumentIds)].flatMap(id => {
          const source = sources.get(id);
          return source?.status === "ready" && source.extractedText?.trim() ? [{ id, text: source.extractedText }] : [];
        });
        if (!usable.length) return { question: point.question, text: noMaterial, status: "missing", sourceDocumentIds: [] } satisfies UdipDraftPoint;
        const excerpts = usable.map(source => source.text.slice(0, Math.floor(maxPointText / usable.length) - 2));
        const text = "text" in point && typeof point.text === "string" ? point.text : excerpts.join("\n\n");
        return { question: point.question, text, status: "supported", sourceDocumentIds: usable.map(source => source.id) } satisfies UdipDraftPoint;
      });
      const body = points.map((point, index) => [
        `Ad ${index + 1}. ${point.question}`, point.text,
        ...(point.sourceDocumentIds.length ? [`\u0179r\u00f3d\u0142a: ${point.sourceDocumentIds.join(", ")}`] : []),
      ].join("\n"));
      const text = [`Sygnatura: ${record.signature}`, `Dotyczy: ${record.subject ?? "Wniosek o udost\u0119pnienie informacji publicznej"}`,
        "Projekt odpowiedzi", ...body].join("\n\n");
      const saved = await tx.udipDraftVersion.create({ data: {
        caseUuid, createdByUuid: actor.id, version: currentVersion + 1, text, points,
      }, select: draftFields });
      return { status: "created" as const, draft: asDraft(saved) };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const latest = await readUdipDraft(actor, caseUuid);
      if (latest) return { status: "conflict" as const, currentVersion: latest.version };
    }
    throw error;
  }
}
