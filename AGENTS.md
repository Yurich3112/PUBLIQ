# AGENTS.md — Inteligentny Asystent Urzędnika (UM Bydgoszcz)

> **Repository:** `asystent_hacknation2026_FFF` (built on the `modulon-poc` core)  
> **Challenge:** HackNation 2026 — *Inteligentny asystent urzędnika: Generator odpowiedzi na UDIP z kalendarzem (organizerem) wniosków* (Urząd Miasta Bydgoszczy / Biuro Komunikacji Społecznej)  
> **Methodology:** Spec-Driven Development (**OpenSpec**) + **Skillpack** (`bos-8/skillpack`)

---

## 1. Mission & Product Summary

We are building a **browser-based (non-EXE) intranet web application** for **Biuro Komunikacji Społecznej (BKS) Urzędu Miasta Bydgoszczy** (acting as *Administrator Informacji Publicznej — AIP* under *Zarządzenie nr 535/2024 Prezydenta Miasta Bydgoszczy*, signed by our mentor **Łukasz Okoński**).

The City Hall processes **~800 UDIP (Ustawa o dostępie do informacji publicznej) requests per year**. Our system cuts processing time from days to minutes while staying **100% ready for air-gapped / local offline execution** on lightweight open-weight models.

For the complete domain blueprint, user flows, and mentor notes, read:
- **[docs/UDIP_COMPLETE_IDEA.md](docs/UDIP_COMPLETE_IDEA.md)** — Full product specification, whiteboard decisions, and architecture.
- **[.ai/router.md](.ai/router.md)** — Modulon PoC repository memory router.

---

## 2. Core Functional Pillars (Mentor-Validated Requirements)

1. **Kalendarz i Tabela Wniosków (Main Clerk Dashboard — `10 cases: 5 Green / 5 Red`):**
   - Sorted oldest-to-newest with year filter (`2025` / `2026`), official signature **`BKS.IV.1431.<nr>.<rok>`**, applicant, subject, dates, assignee initials, and live countdown (`Pozostało dni`).
   - **Visual Status Split & Alerts:** 5 cases in **Green** (on track / completed), 5 in **Red** (deadline today, tomorrow, or overdue), plus explicit **Multi-Department Alert Badges** (`⚠️ Wielo-wydziałowy`) and system notifications (`Alerty`).
   - **Expandable Per-Department Statuses Inline:** Clicking a case row expands its sub-table of queried departments (*Wydziały / Biura UMB*), showing individual reply statuses (`🟢 Odpowiedź otrzymana`, `🔴 Oczekuje na odpowiedź`) and allowing the clerk to **attach documents or paste raw email replies directly inside the calendar row**.
   - **Process Statuses (A–E):**
     - `A` — Brak działań
     - `B` — Zapytania wysłane do wydziałów
     - `C` — Kwerenda (+ dodatkowa ilość dni, Art. 13 ust. 2 UDIP) / Wezwanie do doprecyzowania
     - `D` — Przygotowana odpowiedź
     - `E` — Odpowiedź wysłana do wnioskodawcy

2. **Split-Screen Handwritten & Scanned OCR Verifier (`Porównanie dokumentów — Skan vs Transkrypcja`):**
   - When a clerk uploads a scanned or handwritten request (e.g., `BKS.IV.1431.16.2026` on graph paper / *kartka w kratkę*), the UI opens a **Split-Screen View**:
     - **Left Pane:** Original document scan with interactive word-level bounding boxes (`[x, y, w, h]`) and Kancelaria stamp metadata (`Data wpływu`, `Nr wpływu`).
     - **Right Pane:** Transcribed text where every word corresponds 1:1 to a highlighted box on the scan. Low-confidence handwritten words glow amber/red for quick clerk editing.
   - **Illegible Scan Fallback:** If the handwriting is too illegible to understand (*nie wiadomo o co chodzi*), a 1-click button generates an official **Wezwanie do uzupełnienia / doprecyzowania wniosku (7 dni)**.

3. **Anonymized Knowledge Base and Local Routing (`Baza Wiedzy`):**
   - After the clerk confirms the intake redactions, local PLLuM produces a JSON summary with topic, tags, questions and periods. Next.js validates it, ranks approved anonymized PostgreSQL `jsonb` precedents per question in TypeScript and supplies only selected excerpts to PLLuM for drafting or advice.
   - The clerk confirms the suggested route. The application tracks each confirmed department's reply independently and prepares a message draft for an external institution. The clerk sends it outside the application.
   - Persist case state, draft versions and anonymized precedent links in PostgreSQL through Prisma. Administrators manage source versions and approve publication to matching.

4. **Document Comparison, Draft Generation & Irreversible `PII-Tracer` Anonymization (No `Ctrl+Z`):**
   - **Department Input Flexibility:** Accepts department replies both as **PDF/DOCX attachments** and as **plain text pasted from an email**.
   - **Side-by-Side Comparison (`Porównanie dokumentów`):** Compare raw department replies / archival templates on the left with the generated official UM Bydgoszcz BKS letter (`Ad 1, Ad 2...`) on the right.
   - **Permanent PII Cleanup (`perplexity-ai/PII-Tracer` + 28 BKS Categories):**
     - The local Python worker proposes PII ranges after OCR. The clerk edits the grey ranges and applies black redactions to a sanitized revision.
     - Draft from the current case replies, using archived responses for form. Surface gaps and conflicting evidence. After the last edit, scan the entire letter and have the clerk review the suggested ranges.
     - A supervisor approves the exact letter and redaction version before TXT export. Generate a fresh TXT with the confirmed values removed. Changes require fresh approval. The clerk records the actual dispatch date separately.
     - Includes a **Public Official Guard (Art. 5 ust. 2 UDIP)** so public figures (e.g., *Prezydent Rafał Bruski*, *Dyrektor Wydziału*) are not erroneously redacted.

5. **Separate Admin Panel (`Panel Admina`) & Knowledge Base Placement Visualizer:**
   - **Strict Role Separation:** Ordinary clerks (`Urzędnik`) only see the Calendar/Table, Case Assistant, and AI recommendations.
   - **Admin Only (`Panel Admina`):** Only Administrators can view the full Knowledge Base database, upload new legal acts (*Ustawy, Zarządzenie 535/2024*) or archival cases, and inspect the **Knowledge Graph Visualization** showing **where a newly uploaded document lands** among existing topic clusters, departments, and cases.

---

## 3. Lightweight Open-Weight Local Model Stack (Air-Gapped Ready)

To satisfy Requirement #1 & #8 (*"sprawdzić jaki realnie będzie potrzebny model, nie za duży, działający lokalnie bez dostępu do Internetu"*):

| Task | Model / Tool | Footprint | Why it fits UM Bydgoszcz |
| :--- | :--- | :--- | :--- |
| **OCR, JSON Summaries & Drafts (Primary)** | **`Gemma 4 E4B` (`gemma4:e4b` via Ollama · Apache 2.0)** | **~6.6–9.5 GB download** | Single unified multimodal open-weight model (vision + text) for handwriting OCR refinement, JSON summaries, and official BKS letter/email drafts — 100% air-gapped. |
| **Lightweight CPU Fallback** | **`Gemma 4 E2B` (`gemma4:e2b` via Ollama · Apache 2.0)** | **~4.6–7.5 GB download** | Smaller model from the same Gemma 4 family (Apache 2.0) for 16 GB RAM or CPU-only municipal workstations. |
| **Grid Eraser, Word Boxes & PII Guard** | **OpenCV Grid-Line Eraser** + **RapidOCR (ONNX)** + **`perplexity-ai/PII-Tracer`** (~600M) + Polish Legal Regex (28 BKS categories) | **~1.2 GB RAM (CPU)** | Removes graph-paper lines (*kartka w kratkę*) in 5ms, extracts exact `[x, y, w, h]` word bounding boxes for 1:1 split-screen UI, and performs BIOES PII detection with Art. 5 ust. 2 UDIP guard. |

If a local model is unavailable, keep manual transcription, structured summaries, template drafting and manual redaction available. Final supervisor approval continues to apply.

---

## 4. Monorepo Architecture & Team Ownership (`Team of 2`)

This project runs inside the `modulon-poc` monorepo:

```text
hacknation_2026/
├── apps/
│   ├── web/                  # Next.js and TypeScript API, permissions, workflow, matching and documents
│   └── pyworker/             # 🐍 FastAPI + Uvicorn Python Worker (Port 8010)
│                             # Local OCR and PII-Tracer detection
├── packages/
│   ├── database/             # 🗄️ Prisma 7.10.1 + PostgreSQL schema & migrations
│   ├── queue/                # 🔄 pg-boss durable background job queue
│   └── monitoring/           # 📊 Health & deadline monitoring
├── openspec/                 # 📋 OpenSpec Spec-Driven Development artifacts (specs/ & changes/)
├── docs/                     # 📚 Architecture docs, UDIP_COMPLETE_IDEA.md & hackathon sample files
└── .ai/                      # 🧠 Repo-local AI memory router (.ai/router.md)
```

---

## 5. Spec-Driven Development (SDD) with OpenSpec

All non-trivial features MUST follow the **OpenSpec** workflow located in `openspec/` and `.agents/skills/openspec-*`:

1. **Explore (`/openspec-explore`):** Clarify requirements, inspect code boundaries, and compare approaches before writing specs.
2. **Propose (`/openspec-propose`):** Create a new change folder under `openspec/changes/<change-name>/` containing:
   - `proposal.md` (Why & what is in/out of scope)
   - `design.md` (Technical architecture, API contracts between `apps/web` and `apps/pyworker`, data models)
   - `specs/<capability>/spec.md` (Delta specifications with clear scenarios)
   - `tasks.md` (Actionable, ordered implementation checklist)
3. **Apply (`/openspec-apply-change`):** Implement the tasks from `tasks.md` step-by-step, checking off items as they are verified.
4. **Update / Sync / Archive (`/openspec-update-change`, `/openspec-sync-specs`, `/openspec-archive-change`):** Keep specs aligned if design decisions evolve during coding, and archive completed changes into `openspec/specs/`.

---

## 6. Skillpack (`bos-8/skillpack`) Routing Guide for Agents

Agents working in this repository have access to **Skillpack** skills. Always load and follow the relevant `SKILL.md` based on the task domain:

| Domain / Task | Skillpack Skill to Activate | When to Use |
| :--- | :--- | :--- |
| **Autonomous Orchestration** | `automaton` | Multi-step repository execution and automatic skill routing. |
| **Architecture & Contracts** | `architect` | Service boundaries between `apps/web` and `apps/pyworker`, JSON Graph schema, API contracts. |
| **UI / UX & Split-Screen Views** | `ui-ux-designer` | Designing the Clerk Calendar Table, Expandable Dept Rows, Split-Screen OCR Verifier, Grey-to-Black Anonymizer, and Admin Graph Visualizer. |
| **Next.js App Router & Components** | `frameworker` | Implementing routes, layouts, server actions, and API endpoints in `apps/web`. |
| **Python Worker, OCR & AI Logic** | `code-engineer` | Implementing PII-Tracer and OCR in `apps/pyworker`, and integrating local PLLuM from the TypeScript backend. |
| **Web ↔ Pyworker Integration** | `service-integrator` | HTTP contracts, timeouts, streaming, and payload validation between Next.js and FastAPI. |
| **Prisma & PostgreSQL** | `databaser` | Schema changes, migrations, and seed data in `packages/database`. |
| **Security, PII & Role Guards** | `authkeeper` | Enforcing Clerk vs Admin access (`Panel Admina` guard), irreversible PII redaction, and secret protection. |
| **Testing & Auto-Validation** | `tester` / `autotester` | Writing unit/integration tests and running `pnpm check`, `pnpm test:web`, `pnpm test:pyworker`. |
| **Independent Code Review** | `overseer` | Reviewing completed changes against OpenSpec specs and hackathon rubric criteria. |
| **Repo Memory & Docs** | `repo-memory` / `scribe` / `briefer` | Updating `.ai/router.md`, `docs/`, and preparing concise handoff briefs or presentation slides. |
| **Code Reconnaissance & Impact** | `scout` / `blast-radar` | Fast read-only exploration and dependency impact checks before modifying shared packages. |
| **Git & Branch Hygiene** | `git-master` | Clean domain-prefixed commits, `.gitignore` safety, and pre-push secret checks. |
