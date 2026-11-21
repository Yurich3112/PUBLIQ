import { z } from "zod";

export const udipProcessStatusSchema = z.enum(["A", "B", "C", "D", "E"]);
export type UdipProcessStatusCode = z.infer<typeof udipProcessStatusSchema>;

export const udipRoutingTypeSchema = z.enum([
  "INTERNAL_DEPARTMENTS",
  "EXTERNAL_AUTHORITY",
  "CLARIFICATION_7D",
]);
export type UdipRoutingTypeCode = z.infer<typeof udipRoutingTypeSchema>;

export const udipTemplateTypeSchema = z.enum([
  "MERIT_RESPONSE",
  "KWERENDA_EXTENSION",
  "CLARIFICATION_CALL",
  "EXTERNAL_REDIRECT",
]);
export type UdipTemplateTypeCode = z.infer<typeof udipTemplateTypeSchema>;

export const udipDeptStatusSchema = z.enum([
  "PENDING",
  "REPLIED",
  "KWERENDA_REQUESTED",
]);
export type UdipDeptStatusCode = z.infer<typeof udipDeptStatusSchema>;

export const udipHealthColorSchema = z.enum(["GREEN", "RED"]);
export type UdipHealthColorCode = z.infer<typeof udipHealthColorSchema>;

export const udipAlertCodeSchema = z.enum([
  "WIELO_WYDZIALOWY",
  "BRAK_DYSPONENTA_ZUS_ZDMIKP",
  "BLIZNIACZA_SPRAWA_W_BAZIE",
  "TERMIN_PILNY",
  "KWERENDA_LUB_DOPRECYZOWANIE",
]);

export const udipCaseQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  processStatus: udipProcessStatusSchema.optional(),
  healthColor: udipHealthColorSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type UdipCaseQuery = z.infer<typeof udipCaseQuerySchema>;

export const createUdipDepartmentQuerySchema = z.object({
  departmentName: z.string().trim().min(1).max(200),
  departmentEmail: z.string().trim().max(200).nullable().optional(),
  status: udipDeptStatusSchema.optional(),
  questionText: z.string().trim().max(4000).nullable().optional(),
  replyText: z.string().trim().max(50000).nullable().optional(),
  replyFileName: z.string().trim().max(255).nullable().optional(),
  replyFileUuid: z.uuid().nullable().optional(),
});

export const createUdipCaseSchema = z.object({
  year: z.number().int().min(2020).max(2100).optional(),
  sequenceNumber: z.number().int().min(1).max(999999).optional(),
  registryNumber: z.string().trim().max(40).nullable().optional(),
  applicantName: z.string().trim().min(1).max(255),
  applicantContact: z.string().trim().max(255).nullable().optional(),
  subject: z.string().trim().min(1).max(10000),
  receivedDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  deadlineDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  deadlineNote: z.string().trim().max(160).nullable().optional(),
  assigneeName: z.string().trim().min(1).max(120).optional(),
  assigneeInitials: z.string().trim().min(1).max(8).optional(),
  assigneeUserUuid: z.uuid().nullable().optional(),
  processStatus: udipProcessStatusSchema.optional(),
  sourceFileUuid: z.uuid().nullable().optional(),
  sourceMode: z.enum(["digital_pdf", "handwritten_scan", "email_text"]).nullable().optional(),
  verifiedRequestText: z.string().max(100000).nullable().optional(),
  ocrConfidence: z.number().min(0).max(1).nullable().optional(),
  matchedCaseNumber: z.string().trim().max(40).nullable().optional(),
  matchSimilarity: z.number().min(0).max(1).nullable().optional(),
  routingType: udipRoutingTypeSchema.optional(),
  externalAuthorityName: z.string().trim().max(255).nullable().optional(),
  letterTemplateType: udipTemplateTypeSchema.nullable().optional(),
  draftResponseText: z.string().max(100000).nullable().optional(),
  departments: z.array(createUdipDepartmentQuerySchema).max(20).optional(),
});
export type CreateUdipCasePayload = z.infer<typeof createUdipCaseSchema>;

export const updateUdipCaseSchema = z.object({
  processStatus: udipProcessStatusSchema.optional(),
  deadlineDate: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  deadlineNote: z.string().trim().max(160).nullable().optional(),
  answeredDate: z.string().datetime({ offset: true }).or(z.string().date()).nullable().optional(),
  assigneeName: z.string().trim().min(1).max(120).optional(),
  assigneeInitials: z.string().trim().min(1).max(8).optional(),
  verifiedRequestText: z.string().max(100000).nullable().optional(),
  draftResponseText: z.string().max(100000).nullable().optional(),
  anonymizedResponseText: z.string().max(100000).nullable().optional(),
  piiRedactionsCount: z.number().int().min(0).max(10000).optional(),
  addedToKnowledgeGraph: z.boolean().optional(),
});
export type UpdateUdipCasePayload = z.infer<typeof updateUdipCaseSchema>;

export const upsertUdipDepartmentReplySchema = z
  .object({
    departmentQueryUuid: z.uuid().optional(),
    departmentName: z.string().trim().min(1).max(200).optional(),
    status: udipDeptStatusSchema.optional(),
    replyText: z.string().max(100000).nullable().optional(),
    replyFileName: z.string().trim().max(255).nullable().optional(),
    replyFileUuid: z.uuid().nullable().optional(),
  })
  .refine(
    data => Boolean(data.departmentQueryUuid || data.departmentName),
    "Either departmentQueryUuid or departmentName must be provided",
  );
export type UpsertUdipDepartmentReplyPayload = z.infer<
  typeof upsertUdipDepartmentReplySchema
>;
