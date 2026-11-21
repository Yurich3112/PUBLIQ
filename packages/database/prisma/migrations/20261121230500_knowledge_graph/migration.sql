-- CreateEnum
CREATE TYPE "KbNodeType" AS ENUM ('CASE', 'LEGAL_ACT', 'DEPARTMENT', 'EXTERNAL_AUTHORITY');

-- CreateEnum
CREATE TYPE "KbEdgeRelation" AS ENUM ('SIMILAR_CASE', 'ROUTED_TO_DEPT', 'REDIRECTED_TO_EXTERNAL', 'CITES_LAW');

-- CreateTable
CREATE TABLE "kb_cluster" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#2563EB',
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kb_cluster_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "kb_node" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "node_type" "KbNodeType" NOT NULL,
    "external_key" VARCHAR(80) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "summary" TEXT NOT NULL,
    "structured_json" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cluster_uuid" UUID NOT NULL,
    "source_case_uuid" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kb_node_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "kb_edge" (
    "uuid" UUID NOT NULL DEFAULT uuidv7(),
    "source_node_uuid" UUID NOT NULL,
    "target_node_uuid" UUID NOT NULL,
    "relation_type" "KbEdgeRelation" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kb_edge_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "kb_cluster_slug_key" ON "kb_cluster"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "kb_node_external_key_key" ON "kb_node"("external_key");

-- CreateIndex
CREATE UNIQUE INDEX "kb_node_source_case_uuid_key" ON "kb_node"("source_case_uuid");

-- CreateIndex
CREATE INDEX "kb_node_node_type_cluster_uuid_idx" ON "kb_node"("node_type", "cluster_uuid");

-- CreateIndex
CREATE INDEX "kb_node_cluster_uuid_idx" ON "kb_node"("cluster_uuid");

-- CreateIndex
CREATE INDEX "kb_node_created_by_idx" ON "kb_node"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "kb_edge_source_node_uuid_target_node_uuid_relation_type_key" ON "kb_edge"("source_node_uuid", "target_node_uuid", "relation_type");

-- CreateIndex
CREATE INDEX "kb_edge_source_node_uuid_idx" ON "kb_edge"("source_node_uuid");

-- CreateIndex
CREATE INDEX "kb_edge_target_node_uuid_idx" ON "kb_edge"("target_node_uuid");

-- CreateIndex
CREATE INDEX "kb_edge_relation_type_weight_idx" ON "kb_edge"("relation_type", "weight" DESC);

-- AddForeignKey
ALTER TABLE "kb_node" ADD CONSTRAINT "kb_node_cluster_uuid_fkey" FOREIGN KEY ("cluster_uuid") REFERENCES "kb_cluster"("uuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_node" ADD CONSTRAINT "kb_node_source_case_uuid_fkey" FOREIGN KEY ("source_case_uuid") REFERENCES "udip_case"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_node" ADD CONSTRAINT "kb_node_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_edge" ADD CONSTRAINT "kb_edge_source_node_uuid_fkey" FOREIGN KEY ("source_node_uuid") REFERENCES "kb_node"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kb_edge" ADD CONSTRAINT "kb_edge_target_node_uuid_fkey" FOREIGN KEY ("target_node_uuid") REFERENCES "kb_node"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;
