CREATE TYPE "UdipCaseStatus" AS ENUM ('A', 'B', 'C', 'D', 'E');
CREATE TYPE "UdipDocumentKind" AS ENUM ('request', 'departmentReply');
CREATE TYPE "UdipDocumentStatus" AS ENUM ('pending', 'ready', 'failed');

CREATE TABLE "udip_case_counter" (
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,
    CONSTRAINT "udip_case_counter_pkey" PRIMARY KEY ("year"),
    CONSTRAINT "udip_case_counter_last_number_check" CHECK ("last_number" >= 0)
);

CREATE TABLE "udip_case" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "owner_uuid" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "signature" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL,
    "applicant_name" VARCHAR(255),
    "subject" VARCHAR(500),
    "received_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "UdipCaseStatus" NOT NULL DEFAULT 'A',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "udip_case_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "udip_case_dates_check" CHECK ("due_date" >= "received_date"),
    CONSTRAINT "udip_case_owner_uuid_fkey" FOREIGN KEY ("owner_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "udip_department_assignment" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "case_uuid" UUID NOT NULL,
    "department_code" VARCHAR(80) NOT NULL,
    "department_name" VARCHAR(255) NOT NULL,
    "assignee_uuid" UUID,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "udip_department_assignment_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "udip_department_assignment_case_uuid_fkey" FOREIGN KEY ("case_uuid") REFERENCES "udip_case"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_department_assignment_assignee_uuid_fkey" FOREIGN KEY ("assignee_uuid") REFERENCES "user"("uuid") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "udip_department_assignment_case_uuid_uuid_key" ON "udip_department_assignment"("case_uuid", "uuid");

CREATE TABLE "udip_document" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "case_uuid" UUID NOT NULL,
    "assignment_uuid" UUID,
    "uploaded_by_uuid" UUID NOT NULL,
    "kind" "UdipDocumentKind" NOT NULL,
    "status" "UdipDocumentStatus" NOT NULL DEFAULT 'pending',
    "file_name" VARCHAR(255),
    "media_type" VARCHAR(120) NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "extracted_text" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "udip_document_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "udip_document_size_check" CHECK ("size" > 0),
    CONSTRAINT "udip_document_assignment_check" CHECK (("kind" = 'request' AND "assignment_uuid" IS NULL) OR ("kind" = 'departmentReply' AND "assignment_uuid" IS NOT NULL)),
    CONSTRAINT "udip_document_case_uuid_fkey" FOREIGN KEY ("case_uuid") REFERENCES "udip_case"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_document_case_uuid_assignment_uuid_fkey" FOREIGN KEY ("case_uuid", "assignment_uuid") REFERENCES "udip_department_assignment"("case_uuid", "uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_document_uploaded_by_uuid_fkey" FOREIGN KEY ("uploaded_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "udip_draft_version" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "case_uuid" UUID NOT NULL,
    "created_by_uuid" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "udip_draft_version_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "udip_draft_version_version_check" CHECK ("version" > 0),
    CONSTRAINT "udip_draft_version_case_uuid_fkey" FOREIGN KEY ("case_uuid") REFERENCES "udip_case"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_draft_version_created_by_uuid_fkey" FOREIGN KEY ("created_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "udip_case_signature_key" ON "udip_case"("signature");
CREATE UNIQUE INDEX "udip_case_owner_uuid_client_request_id_key" ON "udip_case"("owner_uuid", "client_request_id");
CREATE INDEX "udip_case_year_received_date_uuid_idx" ON "udip_case"("year", "received_date", "uuid");
CREATE INDEX "udip_case_owner_uuid_year_received_date_uuid_idx" ON "udip_case"("owner_uuid", "year", "received_date", "uuid");
CREATE UNIQUE INDEX "udip_department_assignment_case_uuid_department_code_key" ON "udip_department_assignment"("case_uuid", "department_code");
CREATE INDEX "udip_department_assignment_assignee_uuid_case_uuid_idx" ON "udip_department_assignment"("assignee_uuid", "case_uuid");
CREATE INDEX "udip_document_case_uuid_created_at_uuid_idx" ON "udip_document"("case_uuid", "created_at", "uuid");
CREATE INDEX "udip_document_case_uuid_assignment_uuid_idx" ON "udip_document"("case_uuid", "assignment_uuid");
CREATE UNIQUE INDEX "udip_draft_version_case_uuid_version_key" ON "udip_draft_version"("case_uuid", "version");
