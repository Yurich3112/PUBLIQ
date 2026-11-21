# Design: Baza Wiedzy Relational Knowledge Graph (`knowledge-graph-db`)

## Context

The 2-Tier Fast Knowledge Graph (`Baza Wiedzy`) must run 100% offline with zero extra database containers, keep local LLM context usage tiny (~200 tokens per case), match twin cases instantaneously (`<10 ms`), and support the Admin Panel's visual graph placement map.

## Decisions

### 1. Relational Graph Tables in PostgreSQL (`kb_cluster`, `kb_node`, `kb_edge`)
- `kb_cluster` groups related `kb_node` records by topic (`slug`, `name`, `color`, `description`).
- `kb_node` stores both structured JSON (`structured_json` JSONB) and indexed `tags` (`TEXT[]`), plus optional 1:1 linkage to `udip_case.uuid` (`source_case_uuid`).
- `kb_edge` stores weighted relationships (`SIMILAR_CASE`, `ROUTED_TO_DEPT`, `REDIRECTED_TO_EXTERNAL`, `CITES_LAW`) with a human-readable `reason` for UI tooltips and Admin graph inspection.

### 2. Pure-TypeScript Hybrid Similarity Engine (`<10 ms`, Offline)
- Scoring combines:
  - **0.40 × Weighted Tag Jaccard** (using normalized Polish stems)
  - **0.40 × TF-IDF Cosine Similarity** over `title + summary + tags`
  - **0.20 × Bydgoszcz Entity Boost** (matching key municipal entities like `szkoły podstawowe`, `cudzoziemcy`, `schronisko`, `bezdomne zwierzęta`, `astoria`, `alkohol`, `zdmiKp`, `zus`, `wkz`, `odpady`)
- Thresholds:
  - `score >= 0.75` ➡️ **Path A (`TWIN_CASE_MATCH`)**: instant recommendation with twin case, verified departments, legal basis, and response template.
  - `score < 0.75` ➡️ **Path B (`AI_FALLBACK_REQUIRED`)**: returns compact `departmentsRegistry` + `externalAuthoritiesRegistry` + heuristic external hints (e.g., ZUS / ZDMiKP / WKZ) for optional local `gemma3`/`gemma4` reasoning in `apps/pyworker`.
  - On ingest: assigns to top matching cluster if `score >= 0.45`, otherwise auto-creates a new `KbCluster`; connects `SIMILAR_CASE` edges for all cases with `score >= 0.55`.

### 3. Strict Clerk vs Admin Role Separation
- `/api/v1/knowledge/match` requires `LOGED` (ordinary clerks get recommendations only).
- `/api/v1/admin/knowledge/graph` and `/api/v1/admin/knowledge/ingest` require `ADMIN` (`withAdminSession` / `ADMIN_ACCESS`) so ordinary clerks cannot access the raw knowledge base or graph map.
