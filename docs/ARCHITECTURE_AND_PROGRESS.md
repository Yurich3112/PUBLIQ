---
brief: Complete unified Mermaid architecture diagram, 4-database PostgreSQL map, two-stage PII-Tracer & PLLuM 4B workflow, and live team progress tracker on main for HackNation 2026 (UM Bydgoszcz UDIP Assistant).
tags: [hacknation, udip, architecture, mermaid, progress, database, knowledge-graph, pllum, pii-tracer]
---

# Inteligentny Asystent Urzędnika (UM Bydgoszcz) — Unified Architecture & Progress Map (`main`)

> **Legend:**
> - `✅ DONE` — Implemented, tested, and merged into `main`
> - `🚧 IN PROGRESS` — Actively being built (Frontend UI wiring)
> - `⬜ TODO` — Final UI polish / demo integration

---

## 1. End-to-End Unified System Architecture (Aligned with UMB Competition Brief)

```mermaid
flowchart TD
    %% ========================
    %% 1. INTAKE, OCR & STAGE-1 PII SCRUB
    %% ========================
    subgraph Intake["1. Intake, OCR & Stage-1 Anonymization (apps/web + apps/pyworker)"]
        Wniosek["📥 Wniosek UDIP\n(PDF / DOCX / Skan na kartce w kratkę / Tekst)"]
        OCR["✅ Split-Screen Handwritten OCR (/pl/ocr + /v1/tasks/udip/ocr)\n- OpenCV Grid Eraser + RapidOCR + gemma3/4 (or PaddleOCR)\n- 1:1 Aligned Word Verification + Kancelaria Stamp\n- Fallback: Manual edit or Wezwanie do doprecyzowania (7 dni)"]
        PiiStage1["✅ Stage 1: Anonimizator Kopii dla AI (PII-Tracer 0.6B)\n- Grey suggestions -> Clerk confirms -> Scrubbed copy for PLLuM\n- Original preserved in SPRAWY DB for authorized clerks\n- Editing transcription invalidates scrubbed copy"]
        Wniosek --> OCR --> PiiStage1
    end

    %% ========================
    %% 2. POSTGRESQL DATABASE LAYER
    %% ========================
    subgraph Postgres["2. PostgreSQL Database Layer (packages/database — Prisma 7.10.1)"]
        SprawyDB[("✅ SPRAWY & WORKFLOW DB\n(udip_case + udip_workflow_case + documents + drafts + assignments)\n10 Demo Cases: 5 Green / 5 Red, Statusy A-E")]
        BazaWiedzy[("✅ BAZA WIEDZY Graph & Records\n(kb_cluster, kb_node, kb_edge + udip_knowledge_record)\n~200-token JSONB + per-question matching <10ms")]
        InstDB[("✅ InstitutionRegistry\n(institution_registry)\n11 units: BKS, 7 Wydziałów, ZUS/ZDMiKP/WKZ\nCompact JSON export for local LLM")]
        TemplatesDB[("✅ ResponseTemplateArchive\n(response_template_archive)\n7 anonymized reference PDFs + body texts")]
    end

    %% ========================
    %% 3. UNPACKED "URZĘDNIK + AI" WEB WORKSPACE
    %% ========================
    subgraph ClerkApp["3. Widok Urzędnika — Unpacked 'Urzędnik + AI' Web System (apps/web)"]
        Summary["✅ Streszczenie JSON (PLLuM 4B)\n(/api/v1/udip/cases/{id}/summary/suggest)\nTopic, tags + per-question items (data_type, period)"]
        Classifier["✅ 4-Case Per-Question Matcher\n(/api/v1/knowledge/match + /api/v1/udip/cases/{id}/recommendations)"]

        Case1["✅ Case 1: OUR_OFFICE_NEW\n(Do nas, brak w bazie)\nPracownik analizuje z pomocą PLLuM 4B"]
        Case2["✅ Case 2: OUR_OFFICE_SIMILAR_FOUND\n(Do nas, podobne już było)\nWzór z ResponseTemplateArchive + różnice okresów"]
        Case3["✅ Case 3: EXTERNAL_INSTITUTION\n(Inna instytucja: ZUS / ZDMiKP / WKZ)\nSugestia adresata (Art. 4 ust. 3 UDIP)\n+ Projekt pisma/maila (wysyłka poza aplikacją)"]
        Case4["✅ Case 4: OTHER_INTERNAL_DEPARTMENT\n(Inny dział UM Bydgoszcz)\nGotowe projekty zapytań do wydziałów\nWskaźniki: 🔴 Oczekujemy / 🟢 Odpowiedź (np. 1 z 2)"]

        CalendarUI["🚧 Kalendarz i Tabela Wniosków (Frontend Dev)\n- 5 Zielonych / 5 Czerwonych + Alerty wielo-wydziałowe\n- Rozwijane wiersze Wydziałów + wklejanie maila / PDF\n- Kwerenda (+X dni) / Doprecyzowanie"]

        DraftCompare["✅ Projekt Odpowiedzi i Porównanie\n(/api/v1/udip/cases/{id}/drafts/suggest)\nPunkt po punkcie ze źródłami (bieżące dane, wzór z archiwum)"]

        PiiStage2["✅ Stage 2: Końcowa Anonimizacja + Akceptacja Przełożonego\n- PII-Tracer skanuje całość (w tym odp. wydziałów)\n- Przełożony zatwierdza wersję (edycja unieważnia akceptację)\n- Eksport czystego TXT (trwale usunięte wartości, bez Ctrl+Z)"]

        Dispatch["✅ Zakończenie Sprawy (Status E)\n(/api/v1/udip/cases/{id}/dispatch)\nWpisanie rzeczywistej daty wysyłki poza aplikacją"]
    end

    %% ========================
    %% 4. ADMIN PANEL (ROLE-SEPARATED)
    %% ========================
    subgraph AdminPanel["4. Panel Admina (Role: ADMIN Only)"]
        AdminUpload["✅ +Docs do Bazy Wiedzy (API Ready, UI Pending)\n(/api/v1/admin/knowledge/ingest + /api/v1/admin/udip/knowledge)\nImport aktów, zarządzeń, katalogu jednostek i archiwum"]
        AdminGraph["🚧 Wizualizacja Bazy Wiedzy (API Ready, UI Pending)\n(/api/v1/admin/knowledge/graph)\nGraph Analysis + gdzie wylądował nowy dokument"]
    end

    %% ========================
    %% DATA FLOW CONNECTIONS
    %% ========================
    PiiStage1 -- "Scrubbed Copy" --> Summary --> Classifier
    BazaWiedzy -. "Porównanie <10ms" .-> Classifier
    InstDB -. "Compact JSON for LLM" .-> Classifier
    TemplatesDB -. "Past PDF Body" .-> Case2
    TemplatesDB -. "Redirect Template" .-> Case3

    Classifier --> Case1
    Classifier --> Case2
    Classifier --> Case3
    Classifier --> Case4

    Case1 --> DraftCompare
    Case2 --> DraftCompare
    Case3 -- "Draft Redirect (No Auto-Send)" --> PiiStage2
    Case4 -- "Zapisz sprawę + wydziały" --> CalendarUI

    CalendarUI <--> SprawyDB
    CalendarUI -- "Odpowiedzi wydziałów (po przeglądzie PII)" --> DraftCompare
    DraftCompare --> PiiStage2
    PiiStage2 --> Dispatch

    Dispatch -- "Self-Learning Loop (Approved JSON)" --> BazaWiedzy
    Dispatch -- "Status E + Data wysyłki" --> SprawyDB
    AdminUpload --> BazaWiedzy
    BazaWiedzy --> AdminGraph
```

---

## 2. Live Team Progress Tracker on `main`

| Layer / Module | Owner | Status on `main` | Key Implemented Endpoints & Files |
| :--- | :--- | :---: | :--- |
| **1. Split-Screen Handwritten OCR** | OCR / DB Dev | ✅ **DONE** | `/pl/ocr`, `POST /api/v1/ocr/analyze`, OpenCV Grid Eraser + RapidOCR + `gemma3:4b`/`gemma4:12b`, wired as automatic fallback in `/v1/tasks/udip/ocr` |
| **2. `SPRAWY DB` & Full UDIP Workflow Backend** | Backend + DB Devs | ✅ **DONE** | 28 Prisma migrations deployed, `/api/v1/cases` + `/api/v1/udip/cases/*` (intake, documents, assignments, routing, drafts, dispatch) |
| **3. Two-Stage `PII-Tracer` + `PLLuM 4B` Engine** | Backend Dev | ✅ **DONE** | `apps/pyworker/src/pyworker/tasks/udip.py`, `apps/web/src/server/udip/pllum.ts`, `redaction-workflow.ts`, supervisor approval invalidation, clean TXT export |
| **4. `BAZA WIEDZY` + `InstitutionRegistry` + `ResponseTemplateArchive`** | DB + Backend Devs | ✅ **DONE** | `kb_cluster`, `kb_node`, `kb_edge`, `institution_registry` (11 units JSON), `response_template_archive` (7 PDFs), `/api/v1/knowledge/*`, `/api/v1/admin/knowledge/*` |
| **5. Frontend Calendar & Table UI (`5 Green / 5 Red`)** | Frontend Dev | 🚧 **IN PROGRESS** | Consumes `/api/v1/cases` & `/api/v1/udip/cases`, expandable per-department 🔴/🟢 rows (`1 z 2 odpowiedzi`), inline email paste / PDF upload |
| **6. Case Workspace & Anonymizer Review UI** | Frontend Dev | 🚧 **IN PROGRESS** | Base pages started at `/[locale]/udip/cases/[caseId]` + `transcription-review.tsx`; wire Grey ➡️ Black `PII-Tracer` review & side-by-side draft comparison |
| **7. Admin Panel Graph Visualizer UI** | OCR / DB Dev | ✅ **DONE** | Admin-only `/pl/admin/knowledge` (`requireAdminAccess`) calling `/api/v1/admin/knowledge/graph` & `/ingest` with pulsing placement highlight & 3 jury demo presets |

---

## 3. Compliance Checklist Against UMB Competition Brief

- ✅ **Browser-only (zero `.exe`), 100% local offline capable** (`gemma3:4b`/`gemma4:12b` for Vision OCR, `PLLuM 4B` for Polish JSON/drafting, `PII-Tracer 0.6B` for anonymization, with full manual fallback when models are offline).
- ✅ **No automatic email sending** — app prepares email/letter drafts; clerk confirms recipient and sends outside the app, then records actual send date to close (`Status E`).
- ✅ **Two-stage `PII-Tracer`** — Stage 1 scrubs copy before `PLLuM` (keeping original for authorized clerks); Stage 2 scrubs full final letter before supervisor approval & irreversible `.txt` export (no `Ctrl+Z` recovery).
- ✅ **Strict Clerk vs Admin API boundaries** — enforced server-side on all `/api/v1/admin/*` routes.
