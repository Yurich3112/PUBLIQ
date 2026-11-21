-- CreateEnum
CREATE TYPE "UdipProcessStatus" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- CreateEnum
CREATE TYPE "UdipRoutingType" AS ENUM ('INTERNAL_DEPARTMENTS', 'EXTERNAL_AUTHORITY', 'CLARIFICATION_7D');

-- CreateEnum
CREATE TYPE "UdipTemplateType" AS ENUM ('MERIT_RESPONSE', 'KWERENDA_EXTENSION', 'CLARIFICATION_CALL', 'EXTERNAL_REDIRECT');

-- CreateEnum
CREATE TYPE "UdipDeptStatus" AS ENUM ('PENDING', 'REPLIED', 'KWERENDA_REQUESTED');

-- CreateTable
CREATE TABLE "udip_case" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "case_number" VARCHAR(40) NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "registry_number" VARCHAR(40),
    "applicant_name" VARCHAR(255) NOT NULL,
    "applicant_contact" VARCHAR(255),
    "subject" TEXT NOT NULL,
    "received_date" TIMESTAMPTZ(3) NOT NULL,
    "deadline_date" TIMESTAMPTZ(3) NOT NULL,
    "deadline_note" VARCHAR(160),
    "answered_date" TIMESTAMPTZ(3),
    "assignee_name" VARCHAR(120) NOT NULL,
    "assignee_initials" VARCHAR(8) NOT NULL,
    "assignee_user_uuid" UUID,
    "process_status" "UdipProcessStatus" NOT NULL DEFAULT 'A',
    "is_multi_department" BOOLEAN NOT NULL DEFAULT false,
    "source_file_uuid" UUID,
    "source_mode" VARCHAR(24),
    "verified_request_text" TEXT,
    "ocr_confidence" DOUBLE PRECISION,
    "matched_case_number" VARCHAR(40),
    "match_similarity" DOUBLE PRECISION,
    "routing_type" "UdipRoutingType" NOT NULL DEFAULT 'INTERNAL_DEPARTMENTS',
    "external_authority_name" VARCHAR(255),
    "letter_template_type" "UdipTemplateType",
    "draft_response_text" TEXT,
    "anonymized_response_text" TEXT,
    "pii_redactions_count" INTEGER NOT NULL DEFAULT 0,
    "added_to_knowledge_graph" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "udip_case_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "udip_department_query" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "case_uuid" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "department_name" VARCHAR(200) NOT NULL,
    "department_email" VARCHAR(200),
    "status" "UdipDeptStatus" NOT NULL DEFAULT 'PENDING',
    "question_text" TEXT,
    "reply_text" TEXT,
    "reply_file_name" VARCHAR(255),
    "reply_file_uuid" UUID,
    "sent_at" TIMESTAMPTZ(3),
    "replied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "udip_department_query_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "udip_case_case_number_key" ON "udip_case"("case_number");

-- CreateIndex
CREATE UNIQUE INDEX "udip_case_year_sequence_number_key" ON "udip_case"("year", "sequence_number");

-- CreateIndex
CREATE INDEX "udip_case_year_received_date_sequence_number_idx" ON "udip_case"("year", "received_date" ASC, "sequence_number" ASC);

-- CreateIndex
CREATE INDEX "udip_case_process_status_deadline_date_idx" ON "udip_case"("process_status", "deadline_date");

-- CreateIndex
CREATE INDEX "udip_case_assignee_user_uuid_idx" ON "udip_case"("assignee_user_uuid");

-- CreateIndex
CREATE INDEX "udip_case_source_file_uuid_idx" ON "udip_case"("source_file_uuid");

-- CreateIndex
CREATE INDEX "udip_case_created_by_idx" ON "udip_case"("created_by");

-- CreateIndex
CREATE INDEX "udip_case_updated_by_idx" ON "udip_case"("updated_by");

-- CreateIndex
CREATE INDEX "udip_department_query_case_uuid_sort_order_idx" ON "udip_department_query"("case_uuid", "sort_order");

-- CreateIndex
CREATE INDEX "udip_department_query_reply_file_uuid_idx" ON "udip_department_query"("reply_file_uuid");

-- AddForeignKey
ALTER TABLE "udip_case" ADD CONSTRAINT "udip_case_assignee_user_uuid_fkey" FOREIGN KEY ("assignee_user_uuid") REFERENCES "user"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "udip_case" ADD CONSTRAINT "udip_case_source_file_uuid_fkey" FOREIGN KEY ("source_file_uuid") REFERENCES "file"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "udip_case" ADD CONSTRAINT "udip_case_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "udip_case" ADD CONSTRAINT "udip_case_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "udip_department_query" ADD CONSTRAINT "udip_department_query_case_uuid_fkey" FOREIGN KEY ("case_uuid") REFERENCES "udip_case"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "udip_department_query" ADD CONSTRAINT "udip_department_query_reply_file_uuid_fkey" FOREIGN KEY ("reply_file_uuid") REFERENCES "file"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
