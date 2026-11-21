-- CreateEnum
CREATE TYPE "InstitutionKind" AS ENUM ('OUR_BKS_OFFICE', 'INTERNAL_DEPARTMENT', 'EXTERNAL_INSTITUTION');

-- CreateTable
CREATE TABLE "institution_registry" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "code" VARCHAR(40) NOT NULL,
    "kind" "InstitutionKind" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "short_description" VARCHAR(500) NOT NULL,
    "competencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" VARCHAR(200),
    "address" VARCHAR(255),
    "phone" VARCHAR(80),
    "legal_basis" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "institution_registry_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "response_template_archive" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "case_number" VARCHAR(40) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
    "template_type" "UdipTemplateType" NOT NULL DEFAULT 'MERIT_RESPONSE',
    "summary" VARCHAR(500) NOT NULL,
    "extracted_body_text" TEXT NOT NULL,
    "file_uuid" UUID,
    "kb_node_uuid" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "response_template_archive_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_registry_code_key" ON "institution_registry"("code");

-- CreateIndex
CREATE INDEX "institution_registry_kind_is_active_idx" ON "institution_registry"("kind", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "response_template_archive_case_number_key" ON "response_template_archive"("case_number");

-- CreateIndex
CREATE INDEX "response_template_archive_template_type_idx" ON "response_template_archive"("template_type");

-- CreateIndex
CREATE INDEX "response_template_archive_kb_node_uuid_idx" ON "response_template_archive"("kb_node_uuid");

-- CreateIndex
CREATE INDEX "response_template_archive_file_uuid_idx" ON "response_template_archive"("file_uuid");

-- AddForeignKey
ALTER TABLE "response_template_archive" ADD CONSTRAINT "response_template_archive_file_uuid_fkey" FOREIGN KEY ("file_uuid") REFERENCES "file"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_template_archive" ADD CONSTRAINT "response_template_archive_kb_node_uuid_fkey" FOREIGN KEY ("kb_node_uuid") REFERENCES "kb_node"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
