# Specification: Baza Wiedzy Relational Knowledge Graph (`knowledge-graph-db`)

## ADDED Requirements

### Requirement: Relational Graph Schema for Knowledge Base Nodes, Clusters, and Edges
The system SHALL persist Knowledge Base entries in PostgreSQL tables `kb_cluster`, `kb_node` (storing compact ~200-token `structured_json` JSONB and normalized `tags`), and `kb_edge` (storing weighted relational links with explainable reasons).

#### Scenario: Seeding the Bydgoszcz Knowledge Graph
- **WHEN** `seedDatabase()` runs on PostgreSQL
- **THEN** 6 topic clusters, UM Bydgoszcz department nodes, external authority nodes (`ZUS`, `ZDMiKP`, `WKZ`), legal act nodes (`Zarządzenie 535/2024`, `UDIP`), and archival case nodes (`293.2025`, `307.2025`, `15.2026`, `16.2026`, `17.2026`) with their relational edges are created idempotently.

### Requirement: Fast `<10 ms` Similarity Matching (Path A vs Path B)
The system SHALL compare an incoming structured JSON entry or text query against `CASE` nodes using Polish-normalized TF-IDF cosine, tag Jaccard, and entity boost scoring, returning Path A (`TWIN_CASE_MATCH`) when `score >= 0.75` and Path B (`AI_FALLBACK_REQUIRED`) with a compact department/external-authority registry when `score < 0.75`.

#### Scenario: Matching a twin school-statistics request (`599.2026` ↔ `307.2025`)
- **WHEN** a new request about `liczba uczniów oraz uczniów cudzoziemców w szkołach podstawowych w Bydgoszczy` is matched against the seeded graph
- **THEN** the engine returns `path: "TWIN_CASE_MATCH"`, `topMatch.externalKey === "BKS.IV.1431.307.2025"` with `score >= 0.75`, and recommends `Wydział Edukacji i Sportu`.

#### Scenario: Detecting a brand-new external ZUS inquiry
- **WHEN** a new request about `składki emerytalne i rentowe w ZUS` is matched against the seeded graph
- **THEN** the engine returns `path: "AI_FALLBACK_REQUIRED"`, includes the compact registry of UM Bydgoszcz departments and external authorities, and surfaces a heuristic external-authority hint for `ZUS`.

### Requirement: Self-Learning Ingestion with Automatic Cluster Placement & Role Guards
Admin-only endpoints SHALL allow ingesting new cases or legal acts into `Baza Wiedzy`, automatically placing them into the best matching `KbCluster` (or creating a new cluster when `maxScore < 0.45`) and creating weighted `KbEdge` links, while blocking non-admin clerks from `/api/v1/admin/knowledge/*`.

#### Scenario: Ingesting a new case into an existing cluster
- **WHEN** an Administrator ingests `BKS.IV.1431.599.2026` (school statistics) via `ingestKnowledgeNode()`
- **THEN** the new `KbNode` is placed into cluster `edukacja_i_szkolnictwo`, linked with a `SIMILAR_CASE` edge to `BKS.IV.1431.307.2025`, and linked with a `ROUTED_TO_DEPT` edge to `Wydział Edukacji i Sportu`.
