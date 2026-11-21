CREATE TYPE "UdipKnowledgeKind" AS ENUM ('legalAct', 'ordinance', 'archivedReply');

CREATE TABLE "udip_case_manual_summary" (
    "case_uuid" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "updated_by_uuid" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "udip_case_manual_summary_pkey" PRIMARY KEY ("case_uuid"),
    CONSTRAINT "udip_case_manual_summary_version_check" CHECK ("version" > 0),
    CONSTRAINT "udip_case_manual_summary_case_uuid_fkey" FOREIGN KEY ("case_uuid") REFERENCES "udip_case"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_case_manual_summary_updated_by_uuid_fkey" FOREIGN KEY ("updated_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "udip_knowledge_record" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "group_uuid" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "UdipKnowledgeKind" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "source_name" VARCHAR(255) NOT NULL,
    "source_text" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "cluster" VARCHAR(120) NOT NULL,
    "file_version_uuid" UUID,
    "created_by_uuid" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by_uuid" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "superseded_at" TIMESTAMPTZ(3),
    CONSTRAINT "udip_knowledge_record_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "udip_knowledge_record_version_check" CHECK ("version" > 0),
    CONSTRAINT "udip_knowledge_record_approval_check" CHECK (("approved_by_uuid" IS NULL AND "approved_at" IS NULL AND "superseded_at" IS NULL) OR ("approved_by_uuid" IS NOT NULL AND "approved_at" IS NOT NULL)),
    CONSTRAINT "udip_knowledge_record_file_version_uuid_fkey" FOREIGN KEY ("file_version_uuid") REFERENCES "file_version"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_knowledge_record_created_by_uuid_fkey" FOREIGN KEY ("created_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_knowledge_record_approved_by_uuid_fkey" FOREIGN KEY ("approved_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "udip_knowledge_record_file_version_uuid_key" ON "udip_knowledge_record"("file_version_uuid");
CREATE UNIQUE INDEX "udip_knowledge_record_group_uuid_version_key" ON "udip_knowledge_record"("group_uuid", "version");
CREATE INDEX "udip_knowledge_record_approved_at_superseded_at_uuid_idx" ON "udip_knowledge_record"("approved_at", "superseded_at", "uuid");
CREATE UNIQUE INDEX "udip_knowledge_record_one_published_version_key" ON "udip_knowledge_record"("group_uuid") WHERE "approved_at" IS NOT NULL AND "superseded_at" IS NULL;

CREATE TABLE "udip_question_route" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "case_uuid" UUID NOT NULL,
    "summary_version" INTEGER NOT NULL,
    "question_uuid" UUID NOT NULL,
    "unit" JSONB NOT NULL,
    "draft" TEXT,
    "confirmed_by_uuid" UUID NOT NULL,
    "sent_date" DATE,
    "sent_by_uuid" UUID,
    CONSTRAINT "udip_question_route_pkey" PRIMARY KEY ("uuid"),
    CONSTRAINT "udip_question_route_version_check" CHECK ("summary_version" > 0),
    CONSTRAINT "udip_question_route_dispatch_check" CHECK (("sent_date" IS NULL AND "sent_by_uuid" IS NULL) OR ("sent_date" IS NOT NULL AND "sent_by_uuid" IS NOT NULL AND "draft" IS NOT NULL)),
    CONSTRAINT "udip_question_route_case_uuid_fkey" FOREIGN KEY ("case_uuid") REFERENCES "udip_case"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_question_route_confirmed_by_uuid_fkey" FOREIGN KEY ("confirmed_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "udip_question_route_sent_by_uuid_fkey" FOREIGN KEY ("sent_by_uuid") REFERENCES "user"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "udip_question_route_case_uuid_summary_version_question_uuid_key" ON "udip_question_route"("case_uuid", "summary_version", "question_uuid");
