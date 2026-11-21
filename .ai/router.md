---
brief: Mapa pamięci repo Modulon PoC — decyzje, aktualny stan i ograniczenia.
tags: [memory, overview, modulon-poc]
---

# Pamięć Modulon PoC

Czytaj pamięć jako zapis stanu z danego dnia. Przed zmianą sprawdź aktualny kod,
konfigurację i działanie usług. Nie zapisuj tutaj sekretów ani danych sesji.

## Aktualny kontekst

- **[AGENTS.md — Instrukcje dla agentów, OpenSpec i Skillpack](../AGENTS.md)**
- **[Pełna specyfikacja rozwiązania HackNation 2026: Inteligentny Asystent Urzędnika UDIP (UM Bydgoszcz)](../docs/UDIP_COMPLETE_IDEA.md)**
- **Handwritten OCR Verifier (`handwritten-ocr-verifier`, 2026-11-21):** Lokalny 5-etapowy potok OCR (`apps/pyworker` `POST /v1/tasks/ocr`: Stage 0 PDF/PNG/JPEG + fast-path, Stage 1 OpenCV Grid Eraser, Stage 2 ONNX DBNet/word detector + line/zone grouper, Stage 3 lokalna Ollama `qwen2.5vl:3b`, Stage 4 mapowanie 1:1 + parser pieczątki + brama czytelności) oraz Split-Screen Verifier w `apps/web` (`/ocr`, `POST /api/v1/ocr/analyze`). Szczegóły: [0314-python-worker.md](../docs/0314-python-worker.md).
- [Czat OpenAI, Markdown i metryki odpowiedzi — 2026-11-19](memories/2026-11-19/20261119-004617-chat-openai-markdown-metrics.md)
- [Upload, powiadomienia i Info starszej wersji — 2026-11-18](memories/2026-11-18/20261118-220126-file-upload-and-revision-info.md)
- [Wersje plików, przywracanie i trwałe usuwanie — 2026-11-18](memories/2026-11-18/20261118-204644-file-revisions.md)
- [Audyt niezawodności, historia, backup i retencja — 2026-11-18](memories/2026-11-18/20261118-020923-reliability-audit-and-retention.md)
- [Wspólne domeny DEV/QA, przełączanie i weryfikacja — 2026-11-17](memories/2026-11-17/20261117-221746-qa-shared-origins-and-switching.md)
- [Automatyczny DEV, Docker, TLS i dashboard admina — 2026-11-17](memories/2026-11-17/20261117-213018-automatic-dev-infra-admin.md)
- [Produkty, asynchroniczne tabele i poziomy dostępu — 2026-11-12](memories/2026-11-12/20261112-094808-7e68a2d1-products-tables-access.md)
- [Trzy przyciski popupu sesji i dokumentacja kodowania — 2026-11-11](memories/2026-11-11/20261111-215514-session-warning-docs.md)
- [Administracja, pliki, statusy, tabele i postęp powiadomień — 2026-11-11](memories/2026-11-11/20261111-142522-admin-files-ui.md)
- [PoC, komponenty UI, sesje i hard logout — 2026-11-09](memories/2026-11-09/20261109-005826-modulon-poc-ui-auth.md)
- [Dokumentacja projektu](../docs/0000-overview.md)
- [Logowanie, konfiguracja sesji i wylogowanie](../docs/0304-keycloak-login.md)

## Kierunek projektu

Minimalny PoC; pozostają środowiska DEV, QA i PROD. DEV ma cztery główne usługi
Compose oraz S3 console uruchamiane przez `pnpm dev`; Web, queue i pyworker
działają na hoście. `pnpm dev` automatycznie przygotowuje zależności, kontenery
i Prisma. Lokalny przepływ QA jest zaimplementowany; pełna akceptacja QA i
wdrożenie PROD pozostają odrębnymi zakresami. Szczegóły i granice weryfikacji
opisuje notatka z 2026-11-17.

DEV i QA używają tych samych publicznych domen, z `https://modulon.local`
na czele, i działają naprzemiennie. Dane/projekty/sekrety pozostają niezależne.
Powrót do DEV: `pnpm qa:stop && pnpm dev`; usunięcie głównych kontenerów QA
bez danych: `pnpm stack:down --mode qa && pnpm dev`. Operacje QA wykonuj przez
wrappery pnpm, które wyliczają prywatne URL baz w pamięci.

## Ostatnia weryfikacja

- Czat: migracja Prisma w DEV, testy Web, typecheck i lint. Próba przeglądarkowa
  z OpenAI potwierdziła strumieniowanie, Markdown i odczyt metryk z historii.
- Pliki: 162 testy Web, kontrole RepoRoute i 22 scenariusze przeglądarkowe
  po restarcie DEV. Potwierdzono postęp uploadu, panel Info starszej wersji,
  przywrócenie jako wersji 3 i usunięcie wszystkich obiektów i wpisów wersji.
- Zakończony audyt: pełne zatrzymanie i ponowny start DEV, pięć healthy kontenerów,
  `pnpm check` 280/280 PASS oraz integracje logowania, sesji, Python reload/drain,
  odzyskania zadania i fizycznego backup/restore. Raport PostgreSQL–S3 bez
  rozbieżności. To wynik zapisanego przebiegu; przed kolejną zmianą sprawdź stan.
- Szczegóły i ograniczenia: [raport audytu](../docs/0404-reliability-verification.md).

## Zaplanowane

- Kosz dla `pending_deletion` z trwałym usuwaniem po 30 dniach oraz ustalenie
  polityki automatycznej archiwizacji. Procesy nie są wdrożone:
  [backlog](../docs/9999-backlog.md).
- Hybrydowe AI: czat korzysta z OpenAI przez backend Web. Modele CPU w Pythonie,
  bramka PII i trwałe zadania AI przez kolejkę pozostają w planie:
  [architektura AI](../docs/0207-ai-execution-architecture.md).

Aktualne produkty, tabele, usuwanie plików i autoryzację opisuje notatka
z 2026-11-12. Starsze notatki zachowują kontekst historyczny; w szczególności
overlay aside powiadomień zastąpił wcześniejszy wyśrodkowany drawer.

- [Session checkpoint 2026-11-09T21:05:05.282Z](./memories/2026-11-09/20261109-210505-282-23a8e1223bd4-session.md)

- [Session checkpoint 2026-11-11T15:44:51.094Z](./memories/2026-11-11/20261111-154451-094-f98f77f72ab6-session.md)

- [Session checkpoint 2026-11-17T14:48:32.488Z](./memories/2026-11-17/20261117-144832-488-f80fb8d6d53c-session.md)
