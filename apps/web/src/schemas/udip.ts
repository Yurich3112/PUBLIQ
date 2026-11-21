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
});

const udipDocumentSummarySchema = z.object({
  id: z.uuid(),
  fileName: z.string().nullable(),
  mediaType: z.string(),
  size: z.int().positive(),
  kind: z.enum(["request", "departmentReply"]),
  status: documentStatusSchema,
  assignmentId: z.uuid().nullable(),
});

const udipAssignmentSummarySchema = z.object({
  id: z.uuid(),
  departmentCode: z.string(),
  departmentName: z.string(),
  respondedAt: z.iso.datetime().nullable(),
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

export const udipErrorSchema = z.object({ status: z.enum([
  "invalid", "unauthenticated", "denied", "missing", "conflict", "tooLarge", "unsupportedMediaType", "timeout", "unavailable",
]) });

export type UdipCaseUpload = z.infer<typeof udipCaseUploadSchema>;
export type UdipCaseListQuery = z.infer<typeof udipCaseListQuerySchema>;
export type UdipCaseSummary = z.infer<typeof udipCaseSummarySchema>;
export type UdipCaseCreated = z.infer<typeof udipCaseCreatedSchema>;
export type UdipCaseList = z.infer<typeof udipCaseListSchema>;
export type UdipCaseDetail = z.infer<typeof udipCaseDetailSchema>;
export type UdipError = z.infer<typeof udipErrorSchema>["status"];
