import { z } from "zod";

export const udipMaxFileBytes = 10 * 1024 * 1024;
export const udipCaseIdSchema = z.uuid();
export const udipCaseStatusSchema = z.enum(["A", "B", "C", "D", "E"]);
const documentStatusSchema = z.enum(["pending", "ready", "failed"]);
const calendarDate = z.iso.date().refine(date => date >= "1000-01-01");
const optionalText = (max: number) => z.string().trim().normalize().max(max).optional();
const paginationNumber = (min: number, max: number) =>
  z.string().regex(/^\d+$/).transform(Number).pipe(z.int().min(min).max(max));

export const udipCaseUploadSchema = z.object({
  clientRequestId: z.uuid().transform(uuid => uuid.toLowerCase()),
  receivedDate: calendarDate,
  dueDate: calendarDate,
  applicantName: optionalText(255),
  subject: optionalText(500),
}).strict().refine(input => input.dueDate >= input.receivedDate, { path: ["dueDate"] });

export const udipCaseListQuerySchema = z.object({
  year: z.string().regex(/^[1-9]\d{3}$/).transform(Number).optional(),
  limit: paginationNumber(1, 100).optional(),
  offset: paginationNumber(0, 1_000_000).optional(),
}).strict();

export const udipCaseSummarySchema = z.object({
  id: udipCaseIdSchema,
  signature: z.string().regex(/^BKS\.IV\.1431\.[1-9]\d*\.[1-9]\d{3}$/),
  applicantName: z.string().nullable(),
  subject: z.string().nullable(),
  receivedDate: calendarDate,
  dueDate: calendarDate,
  daysRemaining: z.int(),
  processStatus: udipCaseStatusSchema,
  sentDate: calendarDate.nullable(),
  urgency: z.enum(["green", "red"]),
  departmentResponses: z.object({ total: z.int().nonnegative(), received: z.int().nonnegative(), multiDepartment: z.boolean() }),
});

export const udipDocumentSummarySchema = z.object({
  id: z.uuid(),
  fileName: z.string().nullable(),
  mediaType: z.string(),
  size: z.int().positive(),
  kind: z.enum(["request", "departmentReply"]),
  status: documentStatusSchema,
  assignmentId: z.uuid().nullable(),
});

export const udipAssignmentSummarySchema = z.object({
  id: z.uuid(),
  departmentCode: z.string(),
  departmentName: z.string(),
  respondedAt: z.iso.datetime().nullable(),
  responseStatus: z.enum(["pending", "received"]),
});

export const udipCaseCreatedSchema = z.object({
  case: udipCaseSummarySchema,
  document: udipDocumentSummarySchema,
});

export const udipCaseListSchema = z.object({
  items: z.array(udipCaseSummarySchema),
  nextOffset: z.int().nonnegative().nullable(),
});

export const udipCaseDetailSchema = z.object({
  case: udipCaseSummarySchema,
  documents: z.array(udipDocumentSummarySchema),
  assignments: z.array(udipAssignmentSummarySchema),
});

export const udipText = (max: number) => z.string().trim().min(1).max(max).refine(text => !text.includes("\0"));
export const udipMaxTextChars = 100_000;
export const udipReplyRequestSchema = z.object({ clientRequestId: z.uuid().transform(id => id.toLowerCase()) }).strict();
export const udipEmailReplySchema = udipReplyRequestSchema.extend({ text: udipText(udipMaxTextChars) });
export const udipTranscriptionSchema = z.object({ text: udipText(udipMaxTextChars) }).strict();
export const udipAssignmentInputSchema = z.object({
  departmentCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9._-]{0,79}$/),
  departmentName: udipText(255),
}).strict();

const periodSchema = z.object({ from: calendarDate, to: calendarDate }).strict().refine(period => period.from <= period.to);
const keywordList = z.array(udipText(160)).max(30);
const questionSchema = z.object({
  id: z.uuid().transform(id => id.toLowerCase()), text: udipText(1500), dataSought: keywordList.default([]),
  period: periodSchema.nullable().default(null),
}).strict();
export const udipStructuredSummarySchema = z.object({
  topic: udipText(500), tags: keywordList, dataSought: keywordList, period: periodSchema.nullable(),
  questions: z.array(questionSchema).min(1).max(25).refine(items => new Set(items.map(item => item.id)).size === items.length),
}).strict();
const currentVersion = z.int().min(0).max(2_147_483_646);
export const udipManualSummaryInputSchema = z.object({ expectedVersion: currentVersion, summary: udipStructuredSummarySchema }).strict();

export const udipUnitSchema = udipAssignmentInputSchema.extend({
  kind: z.enum(["department", "external"]), email: z.email().max(254).optional(),
}).strict();
export const udipKnowledgeDataSchema = z.object({
  summary: udipStructuredSummarySchema,
  units: z.array(udipUnitSchema).max(20),
  questionUnits: z.array(z.object({ questionId: z.uuid().transform(id => id.toLowerCase()), units: z.array(udipUnitSchema).max(20) }).strict()).max(25).default([]),
  caseSignature: z.string().regex(/^BKS\.IV\.1431\.[1-9]\d*\.[1-9]\d{3}$/).optional(),
}).strict().refine(data => {
  const ids = new Set(data.summary.questions.map(question => question.id));
  return new Set(data.questionUnits.map(item => item.questionId)).size === data.questionUnits.length
    && data.questionUnits.every(item => ids.has(item.questionId));
});
export const udipKnowledgeImportSchema = z.object({
  groupId: z.uuid().transform(id => id.toLowerCase()).optional(),
  kind: z.enum(["legalAct", "ordinance", "archivedReply"]), title: udipText(255), sourceName: udipText(255),
  sourceText: udipText(udipMaxTextChars).optional(), data: udipKnowledgeDataSchema,
}).strict();
export const udipKnowledgeQuerySchema = z.object({
  limit: paginationNumber(1, 100).optional(), offset: paginationNumber(0, 1_000_000).optional(),
}).strict();
export const udipConfirmRouteSchema = z.object({
  summaryVersion: z.int().positive(), questionId: z.uuid().transform(id => id.toLowerCase()), unit: udipUnitSchema,
}).strict();
export const udipExternalDispatchSchema = z.object({ sentDate: calendarDate }).strict();
export const udipDocumentDetailSchema = udipDocumentSummarySchema.extend({ extractedText: z.string().nullable() });

const draftPointInput = z.object({
  question: udipText(1500), sourceDocumentIds: z.array(z.uuid().transform(id => id.toLowerCase())).max(8),
}).strict();
const expectedDraftVersion = z.int().min(0).max(2_147_483_646);
export const udipDraftGenerateSchema = z.object({
  expectedVersion: expectedDraftVersion, points: z.array(draftPointInput).min(1).max(25),
}).strict();
export const udipDraftEditSchema = z.object({
  expectedVersion: expectedDraftVersion,
  points: z.array(draftPointInput.extend({ text: udipText(8000).nullable() })).min(1).max(25),
}).strict();
export const udipDraftPointSchema = draftPointInput.extend({
  text: z.string(), status: z.enum(["supported", "missing"]),
});
export const udipDraftVersionSchema = z.object({
  id: z.uuid(), version: z.int().positive(), text: z.string(),
  points: z.array(udipDraftPointSchema).nullable(), createdAt: z.iso.datetime(),
});

export const udipRevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const redactionOffset = z.int().nonnegative();
export const udipRedactionRangeSchema = z.tuple([redactionOffset, redactionOffset]).refine(([start, end]) => start < end);
export const udipRedactionRangesSchema = z.array(udipRedactionRangeSchema).max(2000);
export const udipRedactionInputSchema = z.object({ revision: udipRevisionSchema, ranges: udipRedactionRangesSchema }).strict();
export const udipApprovalInputSchema = z.object({ revision: udipRevisionSchema }).strict();
export const udipDispatchInputSchema = udipApprovalInputSchema.extend({ sentDate: calendarDate });
export const udipRedactionStateSchema = z.object({
  revision: udipRevisionSchema,
  text: z.string(),
  suggestions: z.array(z.object({ kind: z.enum(["pesel", "email", "phone"]), range: udipRedactionRangeSchema })),
  ranges: udipRedactionRangesSchema.nullable(),
  sanitizedText: z.string().nullable(),
  approvedAt: z.iso.datetime().nullable(),
});

export const udipErrorSchema = z.object({ status: z.enum([
  "invalid", "unauthenticated", "denied", "missing", "conflict", "tooLarge", "unsupportedMediaType", "timeout", "unavailable",
]), currentVersion: z.int().nonnegative().optional() });

export type UdipCaseUpload = z.infer<typeof udipCaseUploadSchema>;
export type UdipCaseListQuery = z.infer<typeof udipCaseListQuerySchema>;
export type UdipCaseSummary = z.infer<typeof udipCaseSummarySchema>;
export type UdipCaseCreated = z.infer<typeof udipCaseCreatedSchema>;
export type UdipCaseList = z.infer<typeof udipCaseListSchema>;
export type UdipCaseDetail = z.infer<typeof udipCaseDetailSchema>;
export type UdipDocumentSummary = z.infer<typeof udipDocumentSummarySchema>;
export type UdipDraftPoint = z.infer<typeof udipDraftPointSchema>;
export type UdipDraftVersion = z.infer<typeof udipDraftVersionSchema>;
export type UdipRedactionRange = z.infer<typeof udipRedactionRangeSchema>;
export type UdipRedactionState = z.infer<typeof udipRedactionStateSchema>;
export type UdipError = z.infer<typeof udipErrorSchema>["status"];
