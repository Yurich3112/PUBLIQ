ALTER TABLE "udip_document" ADD COLUMN "text_revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "udip_redaction_revision" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "document_uuid" UUID,
    "draft_uuid" UUID,
    "version" INTEGER NOT NULL,
    "source_revision" INTEGER,
    "ranges" JSONB NOT NULL,
    "sanitized_text" TEXT NOT NULL,
    "created_by_uuid" UUID NOT NULL,
    "approved_by_uuid" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "udip_redaction_revision_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "udip_redaction_revision_version_check" CHECK ("version" > 0),
    CONSTRAINT "udip_redaction_revision_target_check" CHECK (
        ("document_uuid" IS NOT NULL AND "draft_uuid" IS NULL AND "source_revision" IS NOT NULL AND "source_revision" >= 0)
        OR ("document_uuid" IS NULL AND "draft_uuid" IS NOT NULL AND "source_revision" IS NULL)
    ),
    CONSTRAINT "udip_redaction_revision_approval_check" CHECK (
        ("approved_by_uuid" IS NULL AND "approved_at" IS NULL)
        OR ("draft_uuid" IS NOT NULL AND "approved_by_uuid" IS NOT NULL AND "approved_at" IS NOT NULL AND "approved_by_uuid" <> "created_by_uuid")
    ),
    CONSTRAINT "udip_redaction_revision_document_uuid_fkey" FOREIGN KEY ("document_uuid") REFERENCES "udip_document"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_redaction_revision_draft_uuid_fkey" FOREIGN KEY ("draft_uuid") REFERENCES "udip_draft_version"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_redaction_revision_created_by_uuid_fkey" FOREIGN KEY ("created_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_redaction_revision_approved_by_uuid_fkey" FOREIGN KEY ("approved_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "udip_redaction_revision_document_uuid_version_key" ON "udip_redaction_revision"("document_uuid", "version");
CREATE UNIQUE INDEX "udip_redaction_revision_draft_uuid_version_key" ON "udip_redaction_revision"("draft_uuid", "version");

ALTER TABLE "udip_case"
    ADD COLUMN "sent_date" DATE,
    ADD COLUMN "sent_by_uuid" UUID,
    ADD COLUMN "sent_redaction_uuid" UUID,
    ADD CONSTRAINT "udip_case_sent_by_uuid_fkey" FOREIGN KEY ("sent_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "udip_case_sent_redaction_uuid_fkey" FOREIGN KEY ("sent_redaction_uuid") REFERENCES "udip_redaction_revision"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "udip_case_sent_redaction_uuid_key" ON "udip_case"("sent_redaction_uuid");
