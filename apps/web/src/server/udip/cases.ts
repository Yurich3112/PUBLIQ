import "server-only";
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@modulon-poc/database";
import type { UdipCaseCreated, UdipCaseDetail, UdipCaseList, UdipCaseListQuery, UdipCaseSummary } from "../../schemas/udip.ts";
import { getDatabase } from "../database.ts";
import type { UdipActor } from "./access.ts";
import { documentFields, documentSummary, finishUdipExtraction, storeUdipFile } from "./documents.ts";
import { caseScope } from "./scope.ts";
import type { UdipUpload } from "./upload.ts";

const caseFields = {
  uuid: true, signature: true, applicantName: true, subject: true, receivedDate: true, dueDate: true, status: true, sentDate: true,
  assignments: { select: { respondedAt: true } },
} as const;
const assignmentFields = { uuid: true, departmentCode: true, departmentName: true, respondedAt: true } as const;
const registeredCaseFields = {
  ...caseFields,
  requestHash: true,
  documents: { where: { kind: "request" }, orderBy: { uuid: "asc" }, take: 1, select: documentFields },
} as const;
const dateInWarsaw = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit",
});
const dayMs = 86_400_000;

function warsawCalendarDate(now: Date) {
  const parts = dateInWarsaw.formatToParts(now);
  const part = (type: string) => parts.find(entry => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function caseSummary(row: Prisma.UdipCaseGetPayload<{ select: typeof caseFields }>, today: string): UdipCaseSummary {
  const daysRemaining = (row.dueDate.getTime() - Date.parse(today)) / dayMs;
  const total = row.assignments.length;
  return {
    id: row.uuid, signature: row.signature, applicantName: row.applicantName, subject: row.subject,
    receivedDate: row.receivedDate.toISOString().slice(0, 10), dueDate: row.dueDate.toISOString().slice(0, 10),
    daysRemaining, processStatus: row.status,
    sentDate: row.sentDate?.toISOString().slice(0, 10) ?? null,
    urgency: row.status === "E" || daysRemaining > 1 ? "green" : "red",
    departmentResponses: { total, received: row.assignments.filter(item => item.respondedAt !== null).length, multiDepartment: total > 1 },
  };
}

function assignmentSummary({ uuid: id, respondedAt, ...assignment }: Prisma.UdipDepartmentAssignmentGetPayload<{ select: typeof assignmentFields }>) {
  return { ...assignment, id, respondedAt: respondedAt?.toISOString() ?? null, responseStatus: respondedAt ? "received" as const : "pending" as const };
}

export async function listUdipCases(actor: UdipActor, query: UdipCaseListQuery): Promise<UdipCaseList> {
  const today = warsawCalendarDate(new Date());
  const year = query.year ?? Number(today.slice(0, 4));
  const limit = query.limit ?? 25;
  const offset = query.offset ?? 0;
  const rows = await getDatabase().udipCase.findMany({
    where: { ...caseScope(actor), year }, orderBy: [{ receivedDate: "asc" }, { uuid: "asc" }],
    skip: offset, take: limit + 1, select: caseFields,
  });
  return { items: rows.slice(0, limit).map(row => caseSummary(row, today)), nextOffset: rows.length > limit ? offset + limit : null };
}

export async function readUdipCase(actor: UdipActor, uuid: string): Promise<UdipCaseDetail | null> {
  const row = await getDatabase().udipCase.findFirst({
    where: { ...caseScope(actor), uuid },
    select: {
      ...caseFields,
      documents: { orderBy: [{ createdAt: "asc" }, { uuid: "asc" }], select: documentFields },
      assignments: { orderBy: { departmentCode: "asc" }, select: assignmentFields },
    },
  });
  if (!row) return null;
  return {
    case: caseSummary(row, warsawCalendarDate(new Date())),
    documents: row.documents.map(documentSummary),
    assignments: row.assignments.map(assignmentSummary),
  };
}

function registeredResponse(row: Prisma.UdipCaseGetPayload<{ select: typeof registeredCaseFields }>): UdipCaseCreated {
  const document = row.documents[0];
  if (!document) throw new Error("Registered UDIP case has no intake document");
  return { case: caseSummary(row, warsawCalendarDate(new Date())), document: documentSummary(document) };
}

function readRegisteredCase(db: PrismaClient, ownerUuid: string, clientRequestId: string) {
  return db.udipCase.findUnique({
    where: { ownerUuid_clientRequestId: { ownerUuid, clientRequestId } }, select: registeredCaseFields,
  });
}

export async function registerUdipCase(actor: UdipActor, { metadata, file }: UdipUpload) {
  const db = getDatabase();
  const { clientRequestId, receivedDate, dueDate } = metadata;
  const applicantName = metadata.applicantName || null;
  const subject = metadata.subject || null;
  const requestHash = createHash("sha256")
    .update(JSON.stringify([receivedDate, dueDate, applicantName, subject, file.fileName, file.mediaType]))
    .update(file.content).digest("hex");
  const complete = async (row: NonNullable<Awaited<ReturnType<typeof readRegisteredCase>>>) => {
    const body = registeredResponse(row);
    return { ...body, document: await finishUdipExtraction(body.document, file) };
  };
  const resolveReplay = async (row: NonNullable<Awaited<ReturnType<typeof readRegisteredCase>>>) => row.requestHash === requestHash
    ? { status: "replayed" as const, body: await complete(row) } : { status: "conflict" as const };
  const existing = await readRegisteredCase(db, actor.id, clientRequestId);
  if (existing) return resolveReplay(existing);

  const year = Number(receivedDate.slice(0, 4));
  try {
    const row = await storeUdipFile(actor.id, file, async (tx, fileVersionUuid) => {
      const [counter] = await tx.$queryRaw<{ last_number: number }[]>`
        INSERT INTO udip_case_counter (year, last_number) VALUES (${year}::integer, 1)
        ON CONFLICT (year) DO UPDATE SET last_number = udip_case_counter.last_number + 1
        RETURNING last_number
      `;
      return tx.udipCase.create({
        data: {
          ownerUuid: actor.id, clientRequestId, requestHash, signature: `BKS.IV.1431.${counter.last_number}.${year}`,
          year, applicantName, subject, receivedDate: new Date(receivedDate), dueDate: new Date(dueDate),
          documents: { create: { fileName: file.fileName, mediaType: file.mediaType, fileVersionUuid,
            kind: "request", size: file.content.byteLength, uploadedByUuid: actor.id } },
        },
        select: registeredCaseFields,
      });
    });
    return { status: "created" as const, body: await complete(row) };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const replay = await readRegisteredCase(db, actor.id, clientRequestId);
      if (replay) return resolveReplay(replay);
    }
    throw error;
  }
}

export async function registerUdipAssignment(actor: UdipActor, caseUuid: string, input: { departmentCode: string; departmentName: string }) {
  const db = getDatabase();
  if (!await db.udipCase.findFirst({ where: { uuid: caseUuid, ...(actor.isAdmin ? {} : { ownerUuid: actor.id }) },
    select: { uuid: true } })) return { status: "missing" } as const;
  const where = { caseUuid_departmentCode: { caseUuid, departmentCode: input.departmentCode } };
  const select = assignmentFields;
  const readExisting = () => db.udipDepartmentAssignment.findUnique({ where, select });
  const reply = (row: NonNullable<Awaited<ReturnType<typeof readExisting>>>) => row.departmentName === input.departmentName
    ? { status: "replayed" as const, assignment: assignmentSummary(row) } : { status: "conflict" as const };
  const existing = await readExisting();
  if (existing) return reply(existing);
  try {
    const row = await db.udipDepartmentAssignment.create({ data: { ...input, caseUuid }, select });
    return { status: "created" as const, assignment: assignmentSummary(row) };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const replay = await readExisting();
      if (replay) return reply(replay);
    }
    throw error;
  }
}
