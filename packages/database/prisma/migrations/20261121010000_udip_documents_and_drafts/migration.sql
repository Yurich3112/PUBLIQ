ALTER TABLE "udip_document"
    ALTER COLUMN "content" DROP NOT NULL,
    ADD COLUMN "file_version_uuid" UUID,
    ADD COLUMN "client_request_id" UUID,
    ADD COLUMN "request_hash" CHAR(64),
    ADD CONSTRAINT "udip_document_file_version_uuid_fkey"
        FOREIGN KEY ("file_version_uuid") REFERENCES "file_version"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "udip_document_file_version_uuid_key" ON "udip_document"("file_version_uuid");
CREATE UNIQUE INDEX "udip_document_reply_request_key" ON "udip_document"("case_uuid", "uploaded_by_uuid", "client_request_id");

ALTER TABLE "udip_draft_version" ADD COLUMN "points" JSONB;
