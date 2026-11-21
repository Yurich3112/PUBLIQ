import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@modulon-poc/database";
import type { z } from "zod";
import { udipKnowledgeDataSchema, type udipKnowledgeImportSchema } from "../../schemas/udip.ts";
import { getDatabase } from "../database.ts";
import type { UdipActor } from "./access.ts";
import { storeUdipFile } from "./documents.ts";
import { extractUdipText } from "./extraction.ts";
import { listPublishedUdipKnowledge, rankUdipPrecedents, udipWords } from "./recommendations.ts";
import type { UdipFile } from "./upload.ts";

const knowledgeFields = {
  uuid: true, groupUuid: true, version: true, title: true, sourceName: true, kind: true, cluster: true,
  createdAt: true, approvedAt: true, supersededAt: true, data: true,
} as const;

function knowledgeSummary(row: Prisma.UdipKnowledgeRecordGetPayload<{ select: typeof knowledgeFields }>) {
  const { uuid, groupUuid, data: raw, approvedAt, supersededAt, createdAt, ...summary } = row;
  const data = udipKnowledgeDataSchema.parse(raw);
  const units = new Map([...data.units, ...data.questionUnits.flatMap(question => question.units)]
    .map(unit => [`${unit.kind}:${unit.departmentCode}`, unit]));
  return { ...summary, id: uuid, groupId: groupUuid, units: [...units.values()],
    caseSignature: data.caseSignature ?? null, createdAt: createdAt.toISOString(), approvedAt: approvedAt?.toISOString() ?? null,
    status: supersededAt ? "superseded" : approvedAt ? "approved" : "pending" };
}

export async function listUdipKnowledge(limit = 25, offset = 0) {
  const rows = await getDatabase().udipKnowledgeRecord.findMany({
    orderBy: [{ createdAt: "desc" }, { uuid: "desc" }], skip: offset, take: limit + 1, select: knowledgeFields,
  });
  return { items: rows.slice(0, limit).map(knowledgeSummary), nextOffset: rows.length > limit ? offset + limit : null };
}

export async function readUdipKnowledge(id: string) {
  const record = await getDatabase().udipKnowledgeRecord.findUnique({ where: { uuid: id }, select: {
    ...knowledgeFields, sourceText: true, fileVersionUuid: true,
  } });
  if (!record) return null;
  const data = udipKnowledgeDataSchema.parse(record.data);
  const related = rankUdipPrecedents(data.summary, await listPublishedUdipKnowledge(record.groupUuid)).flatMap(item => item.similarCases);
  related.sort((a, b) => b.score - a.score);
  const similarCases = related.filter((item, index) => related.findIndex(other => other.source.id === item.source.id) === index).slice(0, 8);
  return { ...knowledgeSummary(record), data, sourceText: record.sourceText, hasOriginal: record.fileVersionUuid !== null, similarCases };
}

async function lockKnowledgeGroup(tx: Prisma.TransactionClient, groupId: string) {
  const [root] = await tx.$queryRaw<{ kind: string }[]>`
    SELECT kind FROM udip_knowledge_record WHERE group_uuid = ${groupId}::uuid AND version = 1 FOR UPDATE
  `;
  return root;
}

class KnowledgeVersionError extends Error {
  readonly status: "missing" | "conflict";

  constructor(status: "missing" | "conflict") {
    super(status);
    this.status = status;
  }
}

export async function importUdipKnowledge(actor: UdipActor, input: z.infer<typeof udipKnowledgeImportSchema>, file?: UdipFile) {
  if (!actor.isAdmin) return { status: "denied" } as const;
  const sourceText = input.sourceText ?? (file ? await extractUdipText(file) : null);
  if (!sourceText) return { status: "invalid" } as const;
  const cluster = [...udipWords(input.data.summary.tags[0] ?? input.data.summary.topic)].join("-").slice(0, 120) || "inne";
  const groupUuid = input.groupId ?? randomUUID();
  const save = async (tx: Prisma.TransactionClient, fileVersionUuid?: string) => {
    let version = 1;
    if (input.groupId) {
      const root = await lockKnowledgeGroup(tx, groupUuid);
      if (!root) throw new KnowledgeVersionError("missing");
      if (root.kind !== input.kind) throw new KnowledgeVersionError("conflict");
      const latest = await tx.udipKnowledgeRecord.findFirstOrThrow({ where: { groupUuid }, orderBy: { version: "desc" }, select: { version: true } });
      version = latest.version + 1;
    }
    const record = await tx.udipKnowledgeRecord.create({ data: {
      groupUuid, version, kind: input.kind, title: input.title, sourceName: input.sourceName, sourceText,
      data: input.data, cluster, createdByUuid: actor.id, fileVersionUuid,
    }, select: knowledgeFields });
    return knowledgeSummary(record);
  };
  try {
    const record = file ? await storeUdipFile(actor.id, file, save) : await getDatabase().$transaction(tx => save(tx));
    return { status: "ok" as const, record };
  } catch (error) {
    if (error instanceof KnowledgeVersionError) return { status: error.status } as const;
    throw error;
  }
}

export function approveUdipKnowledge(actor: UdipActor, id: string) {
  if (!actor.isAdmin) return Promise.resolve({ status: "denied" } as const);
  return getDatabase().$transaction(async tx => {
    const target = await tx.udipKnowledgeRecord.findUnique({ where: { uuid: id }, select: { groupUuid: true } });
    if (!target) return { status: "missing" } as const;
    await lockKnowledgeGroup(tx, target.groupUuid);
    const record = await tx.udipKnowledgeRecord.findUniqueOrThrow({ where: { uuid: id }, select: knowledgeFields });
    if (record.supersededAt) return { status: "conflict" } as const;
    if (record.approvedAt) return { status: "ok" as const, record: knowledgeSummary(record) };
    const newer = await tx.udipKnowledgeRecord.findFirst({ where: { groupUuid: record.groupUuid, version: { gt: record.version },
      approvedAt: { not: null } }, select: { uuid: true } });
    if (newer) return { status: "conflict" } as const;
    const now = new Date();
    await tx.udipKnowledgeRecord.updateMany({ where: { groupUuid: record.groupUuid, version: { lt: record.version },
      approvedAt: { not: null }, supersededAt: null }, data: { supersededAt: now } });
    const published = await tx.udipKnowledgeRecord.update({ where: { uuid: id }, data: { approvedAt: now,
      approvedByUuid: actor.id }, select: knowledgeFields });
    return { status: "ok" as const, record: knowledgeSummary(published) };
  });
}
