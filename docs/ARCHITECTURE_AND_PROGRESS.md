---
brief: Complete Mermaid architecture diagram, 4-database PostgreSQL map, 4-case routing flow, and live team progress tracker for HackNation 2026 (UM Bydgoszcz UDIP Assistant).
tags: [hacknation, udip, architecture, mermaid, progress, database, knowledge-graph]
---

# Inteligentny Asystent Urzędnika (UM Bydgoszcz) — Complete Architecture & Progress Map

> **Legend:**
> - `✅ DONE` — Implemented, tested, and merged into `main`
> - `🚧 IN PROGRESS` — Actively being built by team
> - `⬜ TODO` — Next to implement / wire together

---

## 1. End-to-End System Architecture (Unpacking the "Urzędnik + AI" Circle)

```mermaid
flowchart TD
    %% ========================
    %% 1. INTAKE & OCR PIPELINE
    %% ========================
    subgraph Intake["1. Intake & OCR Verification (apps/web + apps/pyworker)"]
        Wniosek["📥 Wniosek UDIP\n(PDF / DOCX / Skan na kartce w kratkę / Tekst)"]
        OCR["✅ Split-Screen OCR Verifier (/pl/ocr)\n- OpenCV Grid Eraser + RapidOCR + gemma3/4\n- 1:1 Aligned Word Verification\n- Kancelaria Stamp (Data + Nr wpływu)\n- Fallback: Wezwanie do uzupełnienia (7 dni)"]
        Wniosek --> OCR
    end

    %% ========================
    %% 2. SEPARATE POSTGRESQL DATABASES
    %% ========================
    subgraph Postgres["2. PostgreSQL Database Layer (packages/database — 4 Dedicated Domains)"]
        SprawyDB[("✅ SPRAWY DB\n(udip_case + udip_department_query)\n10 Seeded Cases: 5 Green / 5 Red\nStatusy A-E, terminy, wydziały")]
        BazaWiedzy[("✅ BAZA WIEDZY Graph\n(kb_cluster, kb_node, kb_edge)\n~200-token JSON entries + similarity edges\n<10ms Polish TF-IDF + Tag Jaccard")]
        InstDB[("✅ InstitutionRegistry\n(institution_registry)\n11 units: BKS, 7 Wydziałów, ZUS/ZDMiKP/WKZ\nCompact JSON export for local LLM")]
        TemplatesDB[("✅ ResponseTemplateArchive\n(response_template_archive)\n7 anonymized reference PDFs + body texts")]
    end

    %% ========================
    %% 3. UNPACKED "URZĘDNIK + AI" WEB SYSTEM
    %% ========================
    subgraph ClerkApp["3. Widok Urzędnika — Unpacked 'Urzędnik + AI' Web Workspace (apps/web)"]
        Classifier["✅ 4-Case Classifier Engine (/api/v1/knowledge/match)\nCompares new JSON against Baza Wiedzy + InstitutionRegistry"]

        Case1["⬜ Case 1: OUR_OFFICE_NEW\n(Do nas, brak w bazie)\nPracownik analizuje z pomocą lokalnego AI"]
        Case2["⬜ Case 2: OUR_OFFICE_SIMILAR_FOUND\n(Do nas, podobne już było)\nAI pobiera PDF z ResponseTemplateArchive\ni generuje draft do walidacji"]
        Case3["⬜ Case 3: EXTERNAL_INSTITUTION\n(Inna instytucja: ZUS / ZDMiKP / WKZ)\nSugestia gdzie wysłać (Art. 4 ust. 3 UDIP)\n+ 1-click auto-email / pismo przekierowujące"]
        Case4["🚧 Case 4: OTHER_INTERNAL_DEPARTMENT\n(Inny dział UM Bydgoszcz)\nSugestia wydziałów + wysyłka zapytań\nWskaźniki: 🔴 Oczekuje / 🟢 Otrzymano odp."]

        CalendarUI["🚧 Kalendarz i Tabela Wniosków\n- 5 Zielonych / 5 Czerwonych + Alerty\n- Rozwijane wiersze Wydziałów\n- Wklejanie maila / PDF od Wydziału\n- Kwerenda (+X dni) / Doprecyzowanie"]

        DraftCompare["⬜ Generator Odpowiedzi i Porównanie\nLewa: Odpowiedzi Wydziałów / Szablon z 2025\nPrawa: Projekt pisma BKS (Ad 1, Ad 2...)"]

        Anonymizer["⬜ Reusable Anonimizator PII-Tracer (pyworker)\n1. Szare pola sugerowane przez AI (28 kat. BKS)\n2. Ochrona funkcjonariuszy (Art. 5 ust. 2 UDIP)\n3. Urzędnik klika -> Czarne zakreślenie (bez Ctrl+Z)\n4. Walidacja końcowa -> Eksport .docx / .txt"]

        Dispatch["⬜ Odpowiedź do Wnioskodawcy\n(Wysłana — Status E)"]
    end

    %% ========================
    %% 4. ADMIN PANEL (ROLE-SEPARATED)
    %% ========================
    subgraph AdminPanel["4. Panel Admina (Role: ADMIN Only)"]
        AdminUpload["⬜ +Docs do Bazy Wiedzy\n(/api/v1/admin/knowledge/ingest)\nWgrywanie ustaw, zarządzeń, archiwum"]
        AdminGraph["⬜ Wizualizacja Bazy Wiedzy\n(/api/v1/admin/knowledge/graph)\nGraph Analysis + gdzie wylądował nowy dokument"]
    end

    %% ========================
    %% DATA FLOW CONNECTIONS
    %% ========================
    OCR -- "Verified Text + Stamp" --> Classifier
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
    Case3 -- "1-click Redirect" --> Anonymizer
    Case4 -- "Zapisz sprawę + wydziały" --> CalendarUI

    CalendarUI <--> SprawyDB
    CalendarUI -- "🟢 Wszystkie wydziały odpowiedziały" --> DraftCompare
    DraftCompare --> Anonymizer
    Anonymizer --> Dispatch

    Dispatch -- "Self-Learning Loop (Scrubbed JSON)" --> BazaWiedzy
    Dispatch -- "Status E + Data odpowiedzi" --> SprawyDB
    AdminUpload --> BazaWiedzy
    BazaWiedzy --> AdminGraph
```

---

## 2. Team Progress Tracker (Codebase Ground Truth)

| Layer / Module | Owner | Branch | Status | Implemented Files & Endpoints |
| :--- | :--- | :--- | :---: | :--- |
| **1. Split-Screen Handwritten OCR** | OCR / DB Dev | `main` (merged) | ✅ **DONE** | `/pl/ocr`, `POST /api/v1/ocr/analyze`, OpenCV Grid Eraser, RapidOCR + `gemma3:4b`/`gemma4:12b`, 1:1 aligned reproduction, arrow-key nav |
| **2. `SPRAWY DB` + REST API** | OCR / DB Dev | `main` (merged) | ✅ **DONE** | `UdipCase`, `UdipDepartmentQuery`, 10-case Bydgoszcz seed (`5 Green / 5 Red`), `GET/POST /api/v1/cases`, `PATCH /api/v1/cases/[uuid]`, `POST .../departments` |
| **3. `BAZA WIEDZY` + 2 Separate Tables** | OCR / DB Dev | `main` (merged) | ✅ **DONE** | `KbCluster`, `KbNode`, `KbEdge`, `InstitutionRegistry` (11 units JSON), `ResponseTemplateArchive` (7 PDFs), `<10ms` 4-case matcher, Clerk & Admin APIs |
| **4. Frontend Calendar & Table UI** | Frontend Dev | *(branch off `main`)* | 🚧 **IN PROGRESS** | Consumes `/api/v1/cases` (`5 Green / 5 Red`, expandable per-department 🔴/🟢 rows, paste email / upload PDF inline, Kwerenda / Doprecyzowanie) |
| **5. Local LLM Fallback & Draft Generator** | Backend / AI Dev | `feature/backend` | 🚧 **IN PROGRESS** | Calls `gemma3`/`gemma4` with `institutionsForLlm` JSON (Case 1, 3, 4) or `referenceTemplate` (Case 2) to generate official BKS letter (`Ad 1, Ad 2...`) |
| **6. `PII-Tracer` Anonymizer (Grey ➡️ Black)** | Backend / Frontend | *(pending)* | ⬜ **TODO** | `perplexity-ai/PII-Tracer` (~600M) + 28 BKS categories + Public Official Guard + irreversible export (`.docx` / `.txt`, no `Ctrl+Z`) |
| **7. Admin Panel Graph Visualizer** | Frontend / Admin | *(pending)* | ⬜ **TODO** | Admin-only UI consuming `/api/v1/admin/knowledge/graph` & `/ingest` to upload docs and highlight where the new node landed |

---

## 3. Architectural Notes

1. **Reusable `Anonimizator (PII-Tracer)` Placement:**
   - **Primary Gate (Always On):** Right before exporting/sending the final BKS response to the applicant (`Grey` suggestions ➡️ clerk approves ➡️ `Black` irreversible redaction, no `Ctrl+Z`) to catch any unredacted PII inside department replies.
   - **Optional 1-Click Scrub on Intake / Archival:** When saving a finished case into `Baza Wiedzy` (or if an incoming *wniosek* was not pre-redacted), `PII-Tracer` can scrub PII before archival; if already redacted, it reports `0` spans found and passes through in 1 click.
2. **Supervisor Validation Step:**
   - Maps cleanly onto existing `UdipProcessStatus`: **`D` (`PRZYGOTOWANA_ODPOWIEDZ`)** = ready for final validation/anonymization, **`E` (`ODPOWIEDZ_WYSLANA`)** = validated & sent.
3. **Teammate Database Sync Commands (after `git pull origin main`):**
   ```bash
   pnpm --filter @modulon-poc/database run build
   pnpm --filter @modulon-poc/database run db:deploy
   pnpm --filter @modulon-poc/database run db:seed:prepared
   ```
