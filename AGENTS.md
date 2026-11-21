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

3. **2-Tier Fast Knowledge Graph (`Baza Wiedzy`) ➡️ Local AI Fallback + Auto-Email/Redirect:**
   - **Tier 1 — Lightweight JSON Summary Graph (`knowledge_graph.json`):** Stores compact (~200-token) nodes of all archival cases (`800+/year`), laws, and department responsibilities so we **never overflow the context window of a small local model**.
   - **Path A (Twin Case Found in Graph):** When a clerk uploads a new request similar to an archival one (e.g., `599.2026` ↔ `307.2025` schools/foreigners; `543.2026` ↔ `293.2025` animal shelter), the graph instantaneously recommends the twin case, the verified department(s), and last year's response template.
   - **Path B (New Topic / External Authority like ZUS, ZDMiKP, WKZ):** When no close graph match exists, the local AI analyzes the request against the department/institution registry:
     - If the request belongs to an external institution (e.g., **ZUS**, **ZDMiKP**, **Wojewódzki Konserwator Zabytków**), the system alerts: *"UM Bydgoszcz nie jest dysponentem danych (Art. 4 ust. 3 UDIP)"* and offers **1-click automatic dispatch / generation of the redirection letter or email** instead of manual typing.
     - If internal, it suggests the exact UM Bydgoszcz department(s) and can auto-send or pre-fill the internal inquiry mail.
   - **Self-Learning Loop:** Completing a case (or an Admin uploading a document) appends a new summary node to `knowledge_graph.json`.

4. **Document Comparison, Draft Generation & Irreversible `PII-Tracer` Anonymization (No `Ctrl+Z`):**
   - **Department Input Flexibility:** Accepts department replies both as **PDF/DOCX attachments** and as **plain text pasted from an email**.
   - **Side-by-Side Comparison (`Porównanie dokumentów`):** Compare raw department replies / archival templates on the left with the generated official UM Bydgoszcz BKS letter (`Ad 1, Ad 2...`) on the right.
   - **Permanent PII Cleanup (`perplexity-ai/PII-Tracer` + 28 BKS Categories):**
     - Scans the draft for any unredacted personal data left behind by institutions/departments.
     - Highlights suggested PII in **Grey**; once accepted by the clerk, turns **Black** and is **permanently stripped/redacted** on export (`.docx` / `.txt`) with **no `Ctrl+Z` undo leak**.
     - Includes a **Public Official Guard (Art. 5 ust. 2 UDIP)** so public figures (e.g., *Prezydent Rafał Bruski*, *Dyrektor Wydziału*) are not erroneously redacted.

5. **Separate Admin Panel (`Panel Admina`) & Knowledge Base Placement Visualizer:**
   - **Strict Role Separation:** Ordinary clerks (`Urzędnik`) only see the Calendar/Table, Case Assistant, and AI recommendations.
   - **Admin Only (`Panel Admina`):** Only Administrators can view the full Knowledge Base database, upload new legal acts (*Ustawy, Zarządzenie 535/2024*) or archival cases, and inspect the **Knowledge Graph Visualization** showing **where a newly uploaded document lands** among existing topic clusters, departments, and cases.

---

## 3. Lightweight Open-Weight Local Model Stack (Air-Gapped Ready)

To satisfy Requirement #1 & #8 (*"sprawdzić jaki realnie będzie potrzebny model, nie za duży, działający lokalnie bez dostępu do Internetu"*):

| Task | Model / Tool | Footprint | Why it fits UM Bydgoszcz |
| :--- | :--- | :--- | :--- |
| **PII & Anonymization** | **`perplexity-ai/PII-Tracer`** (`pplx-embed-v1-0.6b` Qwen3 bidirectional encoder) + Polish Legal Regex (28 BKS categories) | **~600M params** (~1.2 GB RAM/VRAM, runs on CPU) | Purpose-built BIOES token classifier (`private_person`, `private_address`, `private_email`, `private_phone`, `account_number`, `other_pii`) with 4096-token window. |
| **Handwritten & Scan OCR** | **OpenCV Grid-Line Eraser** + **EasyOCR Word Detector** (`craft`) + **`Qwen2.5-VL-3B-Instruct` (Q4)** / **`TrOCR`** | **~110 MB – 2.2 GB** | Removes graph-paper lines (*kartka w kratkę*) in 5ms, extracts exact `[x, y, w, h]` word bounding boxes for the 1:1 split-screen UI, and transcribes Polish handwriting. |
| **Draft Generation & Routing** | **`Bielik-11B-v2.3-Instruct` (Q4_K_M)** or **`Qwen2.5-7B-Instruct` (Q4_K_M)** (with OpenAI API allowed during HackNation dev) | **~4.5 – 6.5 GB VRAM** | Polish administrative/legal specialization; paired with our lightweight `knowledge_graph.json` (~200 tokens/node), it runs with minimal context and sub-second latency. |

---

## 4. Monorepo Architecture & Team Ownership (`Team of 2`)

This project runs inside the `modulon-poc` monorepo:

```text
hacknation_2026/
├── apps/
│   ├── web/                  # ⚛️ Next.js 16 + React 19 + Tailwind CSS v4 (Port 3000)
│   │                         #    OWNER: Frontend & Split-Screen OCR Dev
│   └── pyworker/             # 🐍 FastAPI + Uvicorn Python Worker (Port 8010)
│                             #    OWNER: Backend, AI Models (PII-Tracer / OCR / LLM) & JSON Graph Dev
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
| **Python Worker, OCR & AI Logic** | `code-engineer` | Implementing `PII-Tracer`, OpenCV/OCR word bounding boxes, `.docx` generation, and `knowledge_graph.json` matching in `apps/pyworker`. |
| **Web ↔ Pyworker Integration** | `service-integrator` | HTTP contracts, timeouts, streaming, and payload validation between Next.js and FastAPI. |
| **Prisma & PostgreSQL** | `databaser` | Schema changes, migrations, and seed data in `packages/database`. |
| **Security, PII & Role Guards** | `authkeeper` | Enforcing Clerk vs Admin access (`Panel Admina` guard), irreversible PII redaction, and secret protection. |
| **Testing & Auto-Validation** | `tester` / `autotester` | Writing unit/integration tests and running `pnpm check`, `pnpm test:web`, `pnpm test:pyworker`. |
| **Independent Code Review** | `overseer` | Reviewing completed changes against OpenSpec specs and hackathon rubric criteria. |
| **Repo Memory & Docs** | `repo-memory` / `scribe` / `briefer` | Updating `.ai/router.md`, `docs/`, and preparing concise handoff briefs or presentation slides. |
| **Code Reconnaissance & Impact** | `scout` / `blast-radar` | Fast read-only exploration and dependency impact checks before modifying shared packages. |
| **Git & Branch Hygiene** | `git-master` | Clean domain-prefixed commits, `.gitignore` safety, and pre-push secret checks. |
