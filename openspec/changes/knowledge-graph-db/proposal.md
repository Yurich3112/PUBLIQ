# Proposal: Baza Wiedzy Relational Knowledge Graph (`knowledge-graph-db`)

## Why

Urząd Miasta Bydgoszczy processes ~800 UDIP requests per year on air-gapped / lightweight local models where feeding hundreds of full PDFs into an LLM prompt is slow and overflows the context window. We need a **Relational Knowledge Graph (`Baza Wiedzy`)** inside PostgreSQL that stores archival cases, legal acts, UM Bydgoszcz departments, and external authorities as compact (~200-token) structured JSON entries, automatically groups them into topic clusters by similarity, matches incoming requests in `<10 ms` (Path A: Twin Case), and prepares a compact registry payload for local LLM fallback (`gemma3` / `gemma4`) when a brand-new topic arrives (Path B).

## What Changes

- **PostgreSQL & Prisma Schema (`packages/database/prisma/schema.prisma`):**
  - Add enums `KbNodeType` (`CASE`, `LEGAL_ACT`, `DEPARTMENT`, `EXTERNAL_AUTHORITY`) and `KbEdgeRelation` (`SIMILAR_CASE`, `ROUTED_TO_DEPT`, `REDIRECTED_TO_EXTERNAL`, `CITES_LAW`).
  - Add relational graph tables `KbCluster` (`kb_cluster`), `KbNode` (`kb_node`, storing `structuredJson` JSONB + `tags` + optional `sourceCaseUuid` link to `UdipCase`), and `KbEdge` (`kb_edge`, storing weighted directed/undirected relationships with explainable `reason`).
  - Add SQL migration `20261121230500_knowledge_graph`.
- **Pure-TypeScript `<10 ms` Similarity & Graph Engine (`packages/database/src/knowledge-graph.ts`):**
  - Implement Polish diacritic normalization, suffix stemming, TF-IDF cosine similarity, weighted tag Jaccard similarity, and Bydgoszcz entity/authority boosting.
  - Implement `matchKnowledgeGraph()` (Path A `score >= 0.75` vs Path B `AI_FALLBACK_REQUIRED` with compact department/external-authority registry).
  - Implement `ingestKnowledgeNode()` (self-learning node insertion, automatic cluster placement or new-cluster creation, and top-K `SIMILAR_CASE` / `ROUTED_TO_DEPT` / `REDIRECTED_TO_EXTERNAL` / `CITES_LAW` edge creation).
  - Implement `getKnowledgeGraphSnapshot()` and idempotent `seedKnowledgeGraph()` (6 Bydgoszcz clusters, 7 departments, 3 external authorities, 3 legal acts, and 5 archival cases with edges), wired into `seedDatabase()`.
- **Role-Separated Next.js API Endpoints (`apps/web`):**
  - Clerk (`LOGED`): `POST /api/v1/knowledge/match` (returns Path A twin match or Path B fallback payload; never exposes raw KB or Admin graph).
  - Admin (`ADMIN` only): `GET /api/v1/admin/knowledge/graph` (full graph snapshot for Panel Admina visualization) and `POST /api/v1/admin/knowledge/ingest` (ingests a new case/law and returns placement cluster + new edges).

## Capabilities

### New Capabilities

- `knowledge-graph-db`: Relational Knowledge Graph schema in PostgreSQL, pure-TypeScript Polish TF-IDF/tag similarity matching & auto-clustering engine, Bydgoszcz seed graph, and role-separated `/api/v1/knowledge/*` & `/api/v1/admin/knowledge/*` endpoints.

### Modified Capabilities

- None.

## Impact

- `packages/database/prisma/schema.prisma`, `packages/database/prisma/migrations/20261121230500_knowledge_graph/migration.sql`
- `packages/database/src/knowledge-graph.ts`, `packages/database/src/seed.ts`, `packages/database/src/index.ts`, `packages/database/prisma/seed.ts`
- `apps/web/src/config/api-routes.ts`, `apps/web/src/schemas/knowledge-graph.ts`, `apps/web/src/server/knowledge-graph.ts`
- `apps/web/src/app/api/v1/knowledge/match/route.ts`, `apps/web/src/app/api/v1/admin/knowledge/graph/route.ts`, `apps/web/src/app/api/v1/admin/knowledge/ingest/route.ts`
- `tests/web/knowledge-graph.test.mjs`, `apps/web/package.json`
