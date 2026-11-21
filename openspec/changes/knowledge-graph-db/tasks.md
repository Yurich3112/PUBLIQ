# Tasks: Baza Wiedzy Relational Knowledge Graph (`knowledge-graph-db`)

## 1. Prisma Schema & SQL Migration (`packages/database`)

- [x] 1.1 Add `KbNodeType`, `KbEdgeRelation`, `KbCluster`, `KbNode`, and `KbEdge` models to `packages/database/prisma/schema.prisma`.
- [x] 1.2 Create SQL migration `packages/database/prisma/migrations/20261121230500_knowledge_graph/migration.sql` and build `@modulon-poc/database`.
- [x] 1.3 Implement `packages/database/src/knowledge-graph.ts` (Polish TF-IDF + Tag Jaccard + Entity Boost scorer, `matchKnowledgeGraph`, `ingestKnowledgeNode`, `getKnowledgeGraphSnapshot`, and idempotent `seedKnowledgeGraph`) and wire into `packages/database/src/seed.ts` and `packages/database/src/index.ts`.

## 2. Role-Separated Next.js Contracts & API Endpoints (`apps/web`)

- [x] 2.1 Add Knowledge Graph routes to `apps/web/src/config/api-routes.ts` and create Zod schemas in `apps/web/src/schemas/knowledge-graph.ts` and server helpers in `apps/web/src/server/knowledge-graph.ts`.
- [x] 2.2 Implement `POST /api/v1/knowledge/match` (Clerk `LOGED`), `GET /api/v1/admin/knowledge/graph` (`ADMIN` only), and `POST /api/v1/admin/knowledge/ingest` (`ADMIN` only).

## 3. Verification & Live PostgreSQL Seeding

- [x] 3.1 Deploy migration and seed live PostgreSQL (`db:deploy`, `db:seed:prepared`), add unit tests in `tests/web/knowledge-graph.test.mjs`, and verify `typecheck`, `lint`, `test`, and `openspec validate knowledge-graph-db --strict`.
