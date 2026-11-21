import { z } from "zod";

export const MAX_OCR_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_OCR_RESPONSE_BYTES = 24 * 1024 * 1024;

export const ocrZoneSchema = z.enum(["handwriting", "stamp", "printed"]);
export const ocrSourceModeSchema = z.enum(["digital_text", "handwritten_ocr", "printed_ocr"]);
export const ocrAlignedBySchema = z.enum(["exact", "merged_box", "split_box", "digital_native"]);
export const ocrLegibilityStatusSchema = z.enum(["legible", "illegible_review_required"]);

export const ocrBboxSchema = z.tuple([
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(1),
  z.number().int().min(1),
]);

export const ocrEngineInfoSchema = z.object({
  detector: z.string().min(1).max(120),
  recognizer: z.string().min(1).max(160),
}).strict();

export const ocrWordSchema = z.object({
  id: z.string().min(1).max(64),
  line_id: z.string().min(1).max(64),
  text: z.string().max(256),
  bbox: ocrBboxSchema,
  confidence: z.number().min(0).max(1),
  zone: ocrZoneSchema,
  aligned_by: ocrAlignedBySchema,
}).strict();

export const ocrLineSchema = z.object({
  line_id: z.string().min(1).max(64),
  zone: ocrZoneSchema,
  bbox: ocrBboxSchema,
  text: z.string().max(4096),
  word_ids: z.array(z.string().min(1).max(64)),
}).strict();

export const ocrPageSchema = z.object({
  page_index: z.number().int().min(0).max(100),
  width: z.number().int().min(1).max(20_000),
  height: z.number().int().min(1).max(20_000),
  source_mode: ocrSourceModeSchema,
  grid_removed: z.boolean(),
  preview_image_data_url: z.string().startsWith("data:image/").nullable().optional(),
  lines: z.array(ocrLineSchema),
  words: z.array(ocrWordSchema),
}).strict();

export const stampMetadataSchema = z.object({
  received_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  registry_number: z.string().min(1).max(64).nullable(),
  raw_stamp_lines: z.array(z.string()),
}).strict();

export const legibilityReportSchema = z.object({
  status: ocrLegibilityStatusSchema,
  average_confidence: z.number().min(0).max(1),
  low_confidence_ratio: z.number().min(0).max(1),
  recommend_clarification: z.boolean(),
  reason: z.string().max(256).nullable(),
}).strict();

export const ocrAnalysisResponseSchema = z.object({
  status: z.literal("ok"),
  executor: z.literal("pyworker"),
  engine: ocrEngineInfoSchema,
  duration_ms: z.number().int().min(0),
  page_count: z.number().int().min(1).max(25),
  assembled_text: z.string(),
  stamp_metadata: stampMetadataSchema,
  legibility: legibilityReportSchema,
  pages: z.array(ocrPageSchema).min(1),
}).strict();

export const verifiedOcrPayloadSchema = z.object({
  fileName: z.string().min(1).max(255),
  pageCount: z.number().int().min(1).max(25),
  verifiedText: z.string().trim().min(1),
  receivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  registryNumber: z.string().trim().min(1).max(64).nullable(),
  editedWordCount: z.number().int().min(0),
  totalWordCount: z.number().int().min(0),
  averageConfidence: z.number().min(0).max(1),
  verifiedAt: z.string().datetime(),
}).strict();

export const ocrErrorCodeSchema = z.enum([
  "denied",
  "invalid",
  "tooLarge",
  "unsupportedMediaType",
  "invalidDocument",
  "busy",
  "unavailable",
  "timeout",
  "failed",
]);

export type OcrZone = z.infer<typeof ocrZoneSchema>;
export type OcrSourceMode = z.infer<typeof ocrSourceModeSchema>;
export type OcrAlignedBy = z.infer<typeof ocrAlignedBySchema>;
export type OcrWord = z.infer<typeof ocrWordSchema>;
export type OcrLine = z.infer<typeof ocrLineSchema>;
export type OcrPage = z.infer<typeof ocrPageSchema>;
export type StampMetadata = z.infer<typeof stampMetadataSchema>;
export type LegibilityReport = z.infer<typeof legibilityReportSchema>;
export type OcrAnalysisResponse = z.infer<typeof ocrAnalysisResponseSchema>;
export type VerifiedOcrPayload = z.infer<typeof verifiedOcrPayloadSchema>;
export type OcrErrorCode = z.infer<typeof ocrErrorCodeSchema>;

export type OcrFileKind = "pdf" | "png" | "jpeg";

/** Sniff magic bytes to verify PDF, PNG, or JPEG regardless of client-supplied MIME type. */
export function detectOcrFileKind(bytes: Uint8Array): OcrFileKind | null {
  if (bytes.byteLength >= 5
    && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "pdf";
  }
  if (bytes.byteLength >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "png";
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return null;
}
