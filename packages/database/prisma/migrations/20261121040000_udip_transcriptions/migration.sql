CREATE TYPE "UdipTranscriptionSource" AS ENUM ('digital', 'manual', 'ocr', 'legacy');

CREATE TABLE "udip_transcription" (
    "document_uuid" UUID NOT NULL,
    "revision" INTEGER NOT NULL CHECK ("revision" >= 0),
    "text" TEXT NOT NULL,
    "source" "UdipTranscriptionSource" NOT NULL,
    "pages" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "udip_transcription_pkey" PRIMARY KEY ("document_uuid", "revision"),
    CONSTRAINT "udip_transcription_document_uuid_fkey" FOREIGN KEY ("document_uuid")
        REFERENCES "udip_document"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "udip_transcription" ("document_uuid", "revision", "text", "source", "created_at")
SELECT "uuid", "text_revision", "extracted_text", 'legacy', "created_at"
FROM "udip_document" WHERE "extracted_text" IS NOT NULL;
