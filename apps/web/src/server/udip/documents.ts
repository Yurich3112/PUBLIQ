import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@modulon-poc/database";
import { udipMaxFileBytes, type UdipDocumentSummary } from "../../schemas/udip.ts";
import { getDatabase } from "../database.ts";
import { getFileStore } from "../files.ts";
import type { UdipActor } from "./access.ts";
import { extractUdipText } from "./extraction.ts";
import { caseScope, lockUdipCase } from "./scope.ts";
import type { UdipFile } from "./upload.ts";

export const documentFields = {
  uuid: true, fileName: true, mediaType: true, size: true, kind: true, status: true, assignmentUuid: true,
} as const;

export function documentSummary(row: Prisma.UdipDocumentGetPayload<{ select: typeof documentFields }>): UdipDocumentSummary {
  return { id: row.uuid, fileName: row.fileName, mediaType: row.mediaType, size: row.size,
    kind: row.kind, status: row.status, assignmentId: row.assignmentUuid };
}

/** Keep the exact catalog revision and the UDIP reference in the same transaction. */
export async function storeUdipFile<T>(actorId: string, file: UdipFile,
  save: (tx: Prisma.TransactionClient, fileVersionUuid: string) => Promise<T>): Promise<T> {
  const db = getDatabase();
  const storage = getFileStore();
  const key = randomUUID();
  let attempted = false;
  let saved: { value: T } | undefined;
  try {
    return await db.$transaction(async tx => {
      const catalog = await tx.file.create({
        data: { name: file.fileName, createdByUuid: actorId, updatedByUuid: actorId, versions: { create: {
          version: 1, size: BigInt(file.content.byteLength), seaweedUuid: key, fileName: file.fileName, createdByUuid: actorId,
        } } },
        select: { versions: { select: { uuid: true } } },
      });
      const value = await save(tx, catalog.versions[0].uuid);
      saved = { value };
      attempted = true;
      await storage.put(key, file.content);
      return value;
    }, { timeout: 25_000 });
  } catch (error) {
    if (attempted) {
      try {
        const committed = await db.fileVersion.findUnique({ where: { seaweedUuid: key }, select: { uuid: true } });
        if (committed && saved) return saved.value;
        if (!committed) await storage.remove(key);
      } catch { console.error("UDIP file recovery could not confirm catalog state or cleanup"); }
    }
    throw error;
  }
}

export async function finishUdipExtraction(document: UdipDocumentSummary, file: UdipFile): Promise<UdipDocumentSummary> {
  if (document.status !== "pending") return document;
  const extractedText = await extractUdipText(file);
  const db = getDatabase();
  const [updated] = await db.udipDocument.updateManyAndReturn({
    where: { uuid: document.id, status: "pending" },
    data: { extractedText, textRevision: { increment: 1 }, status: extractedText ? "ready" : "failed" }, select: documentFields,
  });
  const current = updated ?? await db.udipDocument.findUnique({ where: { uuid: document.id }, select: documentFields });
  return current ? documentSummary(current) : document;
}

type Reply = { clientRequestId: string } & ({ file: UdipFile } | { text: string });
class MissingAssignment extends Error {}

function assignmentScope(actor: UdipActor, caseUuid: string, assignmentUuid: string): Prisma.UdipDepartmentAssignmentWhereInput {
  return { uuid: assignmentUuid, caseUuid, ...(actor.isAdmin ? {} : {
    OR: [{ assigneeUuid: actor.id }, { case: { ownerUuid: actor.id } }],
  }) };
}

export async function addUdipReply(actor: UdipActor, caseUuid: string, assignmentUuid: string, input: Reply) {
  const db = getDatabase();
  const scope = assignmentScope(actor, caseUuid, assignmentUuid);
  if (!await db.udipDepartmentAssignment.findFirst({ where: scope, select: { uuid: true } })) return { status: "missing" } as const;
  const file = "file" in input ? input.file : undefined;
  const text = "text" in input ? input.text : null;
  const hash = createHash("sha256").update(JSON.stringify([assignmentUuid, file?.fileName, file?.mediaType]))
    .update(file?.content ?? text ?? "").digest("hex");
  const request = { caseUuid, uploadedByUuid: actor.id, clientRequestId: input.clientRequestId };
  const readReplay = () => db.udipDocument.findUnique({ where: { caseUuid_uploadedByUuid_clientRequestId: request },
    select: { ...documentFields, requestHash: true } });
  const resolveReplay = async (row: NonNullable<Awaited<ReturnType<typeof readReplay>>>) => {
    if (row.requestHash !== hash) return { status: "conflict" } as const;
    const document = documentSummary(row);
    return { status: "replayed" as const, document: file ? await finishUdipExtraction(document, file) : document };
  };
  const existing = await readReplay();
  if (existing) return resolveReplay(existing);

  const save = async (tx: Prisma.TransactionClient, versionUuid?: string) => {
    if (!await tx.udipDepartmentAssignment.findFirst({ where: scope, select: { uuid: true } })) throw new MissingAssignment();
    const row = await tx.udipDocument.create({ data: {
      ...request, requestHash: hash, assignmentUuid, kind: "departmentReply", fileVersionUuid: versionUuid,
      fileName: file?.fileName, mediaType: file?.mediaType ?? "text/plain", size: file?.content.byteLength ?? Buffer.byteLength(text ?? ""),
      extractedText: text, status: file ? "pending" : "ready",
    }, select: documentFields });
    await tx.udipDepartmentAssignment.updateMany({ where: { uuid: assignmentUuid, respondedAt: null }, data: { respondedAt: new Date() } });
    return documentSummary(row);
  };
  try {
    const document = file ? await storeUdipFile(actor.id, file, save) : await db.$transaction(tx => save(tx));
    return { status: "created" as const, document: file ? await finishUdipExtraction(document, file) : document };
  } catch (error) {
    if (error instanceof MissingAssignment) return { status: "missing" } as const;
    if ((error as { code?: string }).code === "P2002") {
      const replay = await readReplay();
      if (replay) return resolveReplay(replay);
    }
    throw error;
  }
}

function scopedDocument(actor: UdipActor, caseUuid: string, uuid: string): Prisma.UdipDocumentWhereInput {
  return { uuid, caseUuid, case: caseScope(actor) };
}

const documentDetailFields = { ...documentFields, extractedText: true } as const;

export async function readUdipDocument(actor: UdipActor, caseUuid: string, uuid: string) {
  const row = await getDatabase().udipDocument.findFirst({ where: scopedDocument(actor, caseUuid, uuid), select: documentDetailFields });
  if (!row) return null;
  const { extractedText, ...fields } = row;
  return { ...documentSummary(fields), extractedText };
}

export async function saveUdipTranscription(actor: UdipActor, caseUuid: string, uuid: string, extractedText: string) {
  const row = await getDatabase().$transaction(async tx => {
    if (!await lockUdipCase(tx, actor, caseUuid)) return null;
    const [saved] = await tx.udipDocument.updateManyAndReturn({
      where: { uuid, caseUuid }, data: { extractedText, textRevision: { increment: 1 }, status: "ready" }, select: documentDetailFields,
    });
    return saved;
  });
  if (!row) return null;
  const { extractedText: text, ...fields } = row;
  return { ...documentSummary(fields), extractedText: text };
}

export async function readUdipOriginal(actor: UdipActor, caseUuid: string, uuid: string) {
  const row = await getDatabase().udipDocument.findFirst({ where: scopedDocument(actor, caseUuid, uuid), select: {
    fileName: true, size: true, content: true, fileVersion: { select: { seaweedUuid: true } },
  } });
  if (!row?.fileName || (!row.fileVersion && !row.content)) return null;
  if (row.size > udipMaxFileBytes) throw new Error("UDIP original exceeds the read limit");
  const content = row.fileVersion ? await getFileStore().get(row.fileVersion.seaweedUuid, udipMaxFileBytes) : row.content;
  if (!content || content.byteLength !== row.size) throw new Error("UDIP original does not match its registered size");
  return { fileName: row.fileName, content };
}
