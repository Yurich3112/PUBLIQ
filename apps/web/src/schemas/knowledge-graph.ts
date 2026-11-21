import { z } from "zod";

export const kbNodeTypeSchema = z.enum([
  "CASE",
  "LEGAL_ACT",
  "DEPARTMENT",
  "EXTERNAL_AUTHORITY",
]);
export type KbNodeTypeCode = z.infer<typeof kbNodeTypeSchema>;

export const kbMatchRequestSchema = z.object({
  title: z.string().trim().max(255).optional(),
  summary: z.string().trim().min(3).max(50000),
  tags: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  limit: z.number().int().min(1).max(20).optional(),
});
export type KbMatchRequestPayload = z.infer<typeof kbMatchRequestSchema>;

export const kbIngestRequestSchema = z.object({
  nodeType: kbNodeTypeSchema.default("CASE"),
  externalKey: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(255),
  summary: z.string().trim().min(5).max(50000),
  tags: z.array(z.string().trim().min(1).max(80)).max(25).optional(),
  routedTo: z.array(z.string().trim().min(1).max(200)).max(15).optional(),
  isExternalAuthority: z.boolean().optional(),
  externalAuthority: z.string().trim().max(255).nullable().optional(),
  outcomeType: z.string().trim().max(80).optional(),
  legalBasis: z.array(z.string().trim().min(1).max(160)).max(15).optional(),
  templateFile: z.string().trim().max(255).nullable().optional(),
  year: z.number().int().min(2000).max(2100).nullable().optional(),
  preferredClusterSlug: z.string().trim().max(80).nullable().optional(),
  sourceCaseUuid: z.uuid().nullable().optional(),
});
export type KbIngestRequestPayload = z.infer<typeof kbIngestRequestSchema>;
