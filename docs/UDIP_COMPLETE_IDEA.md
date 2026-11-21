---
brief: Complete product, UX, and technical architecture specification for HackNation 2026 — Inteligentny Asystent Urzędnika (UM Bydgoszcz).
tags: [hacknation, udip, bydgoszcz, architecture, ocr, pii-tracer, knowledge-graph]
---

# Inteligentny Asystent Urzędnika (UM Bydgoszcz) — Complete Idea & Specification

## 1. Problem Context & Mentor Insights (Łukasz Okoński — BKS UM Bydgoszcz)

In **Urząd Miasta Bydgoszczy**, the **Biuro Komunikacji Społecznej (BKS)** coordinates responses to **~800 public information requests (UDIP)** per year under **Zarządzenie Prezydenta Miasta Bydgoszczy nr 535/2024**.

Key operational facts confirmed during our mentor session with **Łukasz Okoński** (Kierownik Referatu Komunikacji Społecznej / AIP):
1. **No `.exe` installers:** City Hall clerks need a zero-install **web application** running in the browser inside their internal network.
2. **High volume (800 requests/year) with official IDs:** Every request receives a sequential signature **`BKS.IV.1431.<nr>.<rok>`** (e.g., `BKS.IV.1431.599.2026`).
3. **Immediate External Redirection (e.g., ZUS / ZDMiKP / Konserwator Zabytków):**
   - Many incoming requests ask for data owned by another institution (e.g., ZUS, Zarząd Dróg Miejskich i Komunikacji Publicznej `17.2026`, Wojewódzki Konserwator Zabytków `15.2026`).
   - Instead of typing redirection letters manually, the system must immediately detect external competence (*brak dysponenta — Art. 4 ust. 3 UDIP*) and **auto-generate or auto-send the redirection response/email**.
4. **Everything Anchored in the Calendar/Table Window:**
   - Clerks need to see **how much time is left** (`Pozostało dni`, 14-day statutory deadline under Art. 13 ust. 1 UDIP) and **process status** at a glance.
   - For the 10 test applications: **5 in Green** (safe/completed) and **5 in Red** (urgent today/tomorrow or overdue), with **Multi-Department Alerts** (`⚠️ Wielo-wydziałowy`).
   - **Expandable Per-Department Statuses:** Clicking a case row in the calendar table expands an inline view showing the status of every queried department (*Wydział 1, Wydział 2...*) and lets the clerk **attach department response files (PDF/DOCX) OR paste plain text from an email directly inside that calendar window**.
5. **Handwritten & Scanned Requests (`Porównanie dokumentów — Split-Screen OCR`):**
   - Real citizens submit handwritten requests on graph paper (*kartka w kratkę*, e.g. `Wniosek - BKS.IV.1431.16.2026.pdf`).
   - When a handwritten/scanned request is uploaded, a **Split-Screen View** shows the original scan on the left and the transcribed text on the right, with **1:1 word-level highlighting** so the clerk can verify and edit any word.
   - If the scan is so illegible that it is unclear what the applicant wants (*"nie wiadomo o co chodzi"*), the clerk clicks one button to send a **Wezwanie do uzupełnienia / doprecyzowania wniosku**.
6. **Permanent Cleanup Anonymization (`perplexity-ai/PII-Tracer`, No `Ctrl+Z`):**
   - Under § 11 ust. 8 of Zarządzenie 535/2024, departments should anonymize their replies, but in practice unredacted PII often slips through in PDF attachments or email text.
   - Our anonymizer acts as a final safety net: it highlights detected PII in **Grey**, and once accepted (**Black**), permanently removes/redacts the data in the final output (no `Ctrl+Z` undo needed or permitted on exported files).
7. **Admin-Only Knowledge Base & Visual Graph Map (`Panel Admina`):**
   - **Ordinary clerks (`Urzędnik`)** do NOT see the raw knowledge database or complex graph; they only receive fast, clear recommendations when they upload a *wniosek*.
   - **Administrators (`Panel Admina`)** have a dedicated panel to upload new laws, regulations, and archival cases, complete with a **Visual Knowledge Map** showing **where a newly uploaded document lands** in the knowledge graph.

---

## 2. End-to-End Architecture & Data Flow

```mermaid
flowchart TD
    subgraph ClerkUI["👤 Widok Urzędnika (apps/web)"]
        Cal["📅 Kalendarz i Tabela Wniosków\n- 10 spraw (5 Zielonych / 5 Czerwonych)\n- Licznik 'Pozostało dni' + Alerty wielo-wydziałowe\n- Rozwijany status każdego Wydziału + dokładanie PDF/maili"]
        Upload["📥 Wgranie Nowego Wniosku\n(PDF / DOCX / Skan pisma ręcznego)"]
        OCR["🔍 Split-Screen Handwritten OCR\nLewa: Skan z boxami [x,y,w,h]\nPrawa: Edytowalny tekst 1:1\nLub: 'Wezwanie do uzupełnienia' gdy nieczytelny"]
        Rec["💡 Karta Rekomendacji\n- Bliźniacze sprawy z archiwum\n- Sugerowane Wydziały UMB lub automat ZUS/ZDMiKP"]
        Comp["⚖️ Porównanie Dokumentów i Generator\nLewa: Odpowiedzi Wydziałów (PDF / tekst maila)\nPrawa: Projekt pisma BKS (Ad 1, Ad 2 / Kwerenda / Doprecyzowanie)"]
        Anon["🕶️ Anonimizacja PII-Tracer (Szary -> Czarny)\nTrwałe czyszczenie danych bez Ctrl+Z -> Eksport .docx / .txt"]
    end

    subgraph AdminUI["🛡️ Panel Admina (apps/web/admin)"]
        KB["📚 Zarządzanie Bazą Wiedzy\nWgrywanie ustaw, zarządzeń i archiwum"]
        GraphViz["🕸️ Wizualizacja Bazy Wiedzy\nPokazuje w jakim klastrze ląduje nowy dokument"]
    end

    subgraph PyWorker["🐍 Silnik AI & OCR (apps/pyworker :8010)"]
        OCREngine["OpenCV Grid Eraser + Word Box Detector\n+ Lekki model VLM/OCR"]
        GraphEngine["⚡ Tier 1: JSON Summary Graph (knowledge_graph.json)\n~200 tokenów/sprawę -> dopasowanie w <10ms bez zapychania kontekstu"]
        LLMEngine["🧠 Tier 2: Lokalny Model AI (Bielik / Qwen / OpenAI dev)\nAnaliza nowych tematów + wykrywanie braku dysponenta (ZUS)"]
        PIITracer["🔒 perplexity-ai/PII-Tracer (~600M)\n+ 28 kategorii BKS + Ochrona funkcjonariuszy publicznych"]
    end

    Upload --> OCREngine --> OCR --> GraphEngine
    GraphEngine -- "Znaleziono podobną (>75%)" --> Rec
    GraphEngine -- "Nowy temat (<75%)" --> LLMEngine --> Rec
    Rec --> Cal --> Comp --> PIITracer --> Anon
    Anon -- "Zakończona sprawa dopisuje węzeł JSON" --> GraphEngine
    KB --> GraphEngine --> GraphViz
```

---

## 3. Detailed Specification of the 6 Core Modules

### Module 1: Two-Tier Knowledge Graph (`knowledge_graph.json`) + AI Fallback
Why a JSON Summary Graph instead of naive full-document RAG?
- Small local models running offline in City Hall have limited RAM/VRAM and context windows. Feeding 800 full PDFs into a prompt is slow and causes hallucinations.
- Each case in `knowledge_graph.json` is stored as a compact ~200-token node:
  ```json
  {
    "case_id": "BKS.IV.1431.307.2025",
    "year": 2025,
    "tags": ["szkoły podstawowe", "liczba uczniów", "obcokrajowcy", "cudzoziemcy", "edukacja"],
    "summary": "Zestawienie liczby uczniów oraz uczniów cudzoziemców w szkołach podstawowych w Bydgoszczy",
    "routed_to": ["Wydział Edukacji i Sportu"],
    "is_external_authority": false,
    "external_authority": null,
    "outcome_type": "UDZIELONO_ODPOWIEDZI",
    "template_file": "Odpowiedź - BKS.IV.1431.307.2025.anonymised.pdf",
    "cluster": "edukacja_i_szkolnictwo"
  }
  ```
- **When a clerk uploads a request:**
  1. **Fast Graph Match (Path A):** Compares extracted tags/keywords against `knowledge_graph.json` in `<10 ms`. Immediately matches pairs like `599.2026` ↔ `307.2025` (schools) and `543.2026` ↔ `293.2025` (animal care).
  2. **AI Fallback (Path B):** If similarity is low (e.g., an inquiry about **ZUS** pensions/contributions), the LLM inspects only the compact list of Bydgoszcz departments & external institutions and recommends:
     - **External Automatic Redirect:** *"Dotyczy ZUS — UM Bydgoszcz nie jest dysponentem danych. [Wyślij / Wygeneruj automatycznie pismo przekierowujące]"*.
     - **Internal Multi-Department Routing:** Suggests the exact UM Bydgoszcz Wydziały and prepares internal inquiry emails.
  3. **Self-Learning Loop:** Finishing a case automatically appends its summary node to `knowledge_graph.json`.

### Module 2: Split-Screen Handwritten OCR & Legibility Gate
Built specifically for scanned/handwritten requests like `Wniosek - BKS.IV.1431.16.2026.pdf` (Jerzy's handwritten note on graph paper asking about alcohol sales permits since Mayor Bruski took office):
1. **Preprocessing (`OpenCV Grid Eraser`):** Removes horizontal and vertical graph-paper grid lines so pen strokes stand out cleanly.
2. **Word-Level Bounding Boxes (`[x, y, width, height]`):** Every word in the handwriting gets an ID (`w1`, `w2`...), coordinates, transcribed text, and confidence score (`0.0–1.0`).
3. **Interactive Split-Screen UI:**
   - **Left:** Original scan with colored bounding boxes (Green = high confidence, Amber/Red = uncertain handwriting, Blue = Kancelaria stamp & barcode `09.01.2026`, `3468/2026`).
   - **Right:** Editable transcription where hovering/clicking any word highlights the corresponding handwritten word on the left scan.
   - **Action Buttons:**
     - `✅ Zatwierdź tekst wniosku` (Proceeds to Graph/AI recommendations)
     - `⚠️ Skan nieczytelny — Wygeneruj wezwanie do uzupełnienia / doprecyzowania` (Drafts a 7-day clarification notice to the applicant).

### Module 3: Calendar & Expandable Table Organizer (`10 Cases: 5 Green / 5 Red`)
Mirrors `WNIOSKI O UDOSTĘPNIANIE INFORMACJI PUBLICZNEJ.xlsx` while adding the mentor's requested enhancements:
- **Columns:** `Lp.`, `Numer sprawy (BKS.IV.1431.X.2026)`, `Wnioskodawca`, `Przedmiot zapytania`, `Data wpływu`, `Termin odpowiedzi`, `Pozostało dni (Deadline badge)`, `Osoba odpowiedzialna (Inicjały)`, `Status (Rozwijany A–E)`.
- **5 Green / 5 Red Visual Split:**
  - 5 cases highlighted in **Green** (comfortable time remaining or answered on time).
  - 5 cases highlighted in **Red** (deadline today/tomorrow, overdue, or awaiting urgent multi-department kwerenda).
- **Multi-Department Alert (`⚠️ Wielo-wydziałowy`):** Appears whenever a case requires input from 2+ units (e.g., `Wydział Zieleni i Gospodarki Komunalnej` + `Schronisko dla Zwierząt` in `543.2026`).
- **Expandable Row Drawer:**
  - Shows each queried department's sub-status.
  - Lets the clerk **add documents directly inside the calendar row** via file upload (`.pdf`, `.docx`) OR **paste raw email text** received from the department.
  - Includes quick actions for **Kwerenda (+X dni, Art. 13 ust. 2 UDIP)** (as in `Kwerenda - BKS.IV.1431.543.2026.pdf`) and **Wezwanie do doprecyzowania** (as in `Doprecyzowanie - BKS.IV.1431.509.2026.pdf`).

### Module 4: Document Comparison & Official BKS Letter Generator
- **Side-by-Side Comparison (`Porównanie dokumentów`):**
  - Left side: Uploaded department replies (PDF preview / pasted email text) + matched archival response from 2025.
  - Right side: Generated official UM Bydgoszcz letter with BKS header (`85-102 Bydgoszcz, ul. Jezuicka 1, bks@um.bydgoszcz.pl`), signature `BKS.IV.1431...`, structured `Ad 1, Ad 2...` paragraphs, and legal citations.
- Supports all **4 official BKS letter templates** found in the hackathon dataset:
  1. **Odpowiedź merytoryczna** (e.g., `16.2026`, `18.2026`, `293.2025`, `307.2025`, `543.2026`, `590.2026`)
  2. **Zawiadomienie o przedłużeniu terminu — Kwerenda (Art. 13 ust. 2 UDIP)** (e.g., `Kwerenda - 543.2026`)
  3. **Wezwanie do doprecyzowania / uzupełnienia zakresu wniosku (7 dni)** (e.g., `Doprecyzowanie - 509.2026` or illegible handwritten scan)
  4. **Informacja o braku dysponowania danymi — Przekierowanie (Art. 4 ust. 3 UDIP)** (e.g., `15.2026` WKZ, `17.2026` ZDMiKP, or automatic **ZUS** redirect)

### Module 5: Irreversible Anonymization with `perplexity-ai/PII-Tracer`
- Powered by **`perplexity-ai/PII-Tracer`** (~600M Qwen3 bidirectional encoder) + deterministic Polish regex rules covering all **28 categories** from `Dane podlegające anonimizacji.txt` (private names, PESEL, dowód, NIP, address, private email/phone, IBAN, KW, nr działki, license plates, trade/tax/medical secrets).
- **Public Official Guard (Art. 5 ust. 2 UDIP):** Names of public officials performing public functions (e.g., *Prezydent Rafał Bruski*) are flagged as public and protected from accidental redaction.
- **Grey ➡️ Black UX (No `Ctrl+Z` needed):**
  - Suggested PII spans left unredacted in department replies are highlighted in **Grey**.
  - Clerk clicks to confirm (**Black**) or highlights any custom span.
  - Exporting to `.docx` or `.txt` permanently strips/redacts the confirmed spans so sensitive text cannot be recovered by `Ctrl+Z` or copy-paste.

#### Download PII-Tracer for local development

Download [PII-Tracer from Hugging Face](https://huggingface.co/perplexity-ai/PII-Tracer/tree/d25c16f2e57e321f6d2527715c01df9112f956f5) before working offline. With Git and Git LFS installed, run these commands from the project root to place the model next to the project:

```powershell
git clone --no-checkout https://huggingface.co/perplexity-ai/PII-Tracer ../PII-Tracer
git -C ../PII-Tracer checkout --detach d25c16f2e57e321f6d2527715c01df9112f956f5
```

Allow about 1.2 GB for the model files, plus space for Git's local cache.

### Module 6: Admin-Only Knowledge Base & Document Placement Visualizer (`Panel Admina`)
- Accessible only to users with the **Administrator** role.
- **Live Knowledge Base Uploader (Jury Test #6):** Drag-and-drop new laws (*Ustawy*), Mayor's regulations (*Zarządzenia*), or archival responses.
- **Visual Placement Map (`Wizualizacja gdzie ląduje dokument`):** When an Admin uploads a document, the system extracts its summary/tags, inserts a node into `knowledge_graph.json`, and visually highlights **which cluster, departments, and historical cases the new document connected to**.
