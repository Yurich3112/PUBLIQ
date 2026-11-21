---
brief: Automatyczny pnpm dev, nazwy usług i kontenerów, diagnostyka, TLS oraz dashboard administratora.
tags: [memory, dev, docker, prisma, python, admin, tls]
---

# Automatyczny DEV i infrastruktura

## Ustalenia i implementacja

- Podstawowa komenda to `pnpm dev`, bez wyboru cold/warm. `dev:start:cold` i
  `dev:start:warm` zachowano jako aliasy zgodności tego samego przebiegu.
- `scripts/dev.mjs` i `scripts/lib/dev-tools.mjs` używają na wejściu tylko
  wbudowanych modułów Node, więc startują bez `node_modules`.
- Kolejność: narzędzia i Docker Engine/Compose → DEV env/TLS/wolne porty →
  instalacja pnpm według lockfile z preferencją cache → walidacja auth →
  przygotowanie Python → Compose build/up z cache i oczekiwaniem na health →
  wspólne pakiety/Prisma, pg-boss, migracje i seed → Web, queue, pyworker.
- Pełna walidacja auth wymaga zainstalowanych zależności; odbywa się przed
  przygotowaniem Pythona, zmianami Dockera i migracjami.
- Preflight wymaga przypiętego pnpm z `package.json`, Node minimum 22.18
  (udokumentowany runtime 26) i Python 3.12–3.14. Wykorzystuje bazowy interpreter
  istniejącego venv, respektuje `PYWORKER_PYTHON`, a bez niego sprawdza dostępne
  zgodne interpretery, w Windows również przez launcher `py`.
- Osiem etapów pokazuje cel i czas. Dłuższe operacje raportują postęp co 15 s.
  Compose dla up/down/delete przekazuje wyjście na żywo; health wait ma limit 240 s.
  Zwykły start zachowuje historię etapów w terminalu.
- Start nie uruchamia Docker Desktop, nie pobiera interpretera Python, nie
  zmienia systemowego zaufania CA i nie resetuje danych ani sekretów.
  Brak wymaganej konfiguracji/TLS lub konflikt danych zatrzymuje przebieg.
- Supervisor jest przypisany do workspace. Drugi start odmawia przejęcia aktywnej
  sesji. `dev:restart` zatrzymuje własne procesy i ponawia przygotowanie/start;
  `dev:stop` zatrzymuje również DEV Compose z zachowaniem wolumenów.
- Zachowano osobne rebuildy web/pyworker/prisma/queue/monitoring/docker i aliasy
  z kropkami. Rebuild Prisma zachowuje schemat, migracje i dane. Zwykły start
  używa `migrate deploy` oraz dodaje wyłącznie brakujące dane seed.

## Docker i diagnostyka

- Projekt DEV: `modulonpocdev`; nazwy kontenerów `dev-db-0`, `dev-auth-0`,
  `dev-s3-0`, `dev-proxy-0`, `dev-s3console-0`. QA stosuje prefiks `qa-`.
  Role Compose: db/auth/s3/proxy/s3console oraz web/queue/pyworker w QA.
  Technologie i wersje pozostają w nazwach obrazów.
- Skrypty adresują projekt i usługę Compose. `INSTANCE_INDEX` zmienia nazwy
  kontenerów, a niezależne `*_VOLUME_NAME` utrzymują istniejące dane i nazwy
  wolumenów. Zmiana nazewnictwa DEV zachowała metadane wszystkich trzech wolumenów.
- Kanoniczne komendy: `dev:infra:up/down/status/logs/delete`; `delate` zachowano
  jako alias delete. Tylko jawne delete usuwa wolumeny; down je zachowuje.
- `dev:doctor` jest odczytowy: config/auth, TLS, Docker, health, bazy/migracje,
  pg-boss i porty. Nie naprawia ani nie restartuje środowiska.
- Pyworker w DEV obserwuje źródła `.py`, pomija cache i restartuje proces po
  zmianie. Przygotowana sesja używa `MODULON_DEV_PREPARED`, aby uniknąć powtórnych
  instalacji. Kolejka po trzech błędach operacji stosuje backoff do 60 s.
- `dev:queue:prepare` przygotowuje schemat i brakującą kolejkę diagnostyczną,
  zachowując istniejące zadania i politykę kolejki.

## UI i dokumentacja

- `/[locale]/admin`: jedna historia ogólnej dostępności i kafelki usług z
  rzeczywistymi metrykami, m.in. plików/obiektów, użytkowników i stanów kolejki.
  Szczegółowa dostępność usług jest pod `/[locale]/admin/monitoring`.
  Dashboard ma PL/EN, odświeżanie co 30 s oraz ponowną kontrolę uprawnień.
- Główne instrukcje: `docs/0315-dev-startup.md`, `docs/0205-workspace-commands.md`
  oraz README. `docs/0318-local-tls.md` zawiera generowanie mkcert dla DEV/QA,
  import publicznego CA w Windows/Linux/macOS i ponowne wczytanie TLS przez proxy.
  Rozróżnia publiczny CA od prywatnego klucza podpisującego, walidację plików
  od zaufania OS/przeglądarki oraz osobne magazyny Windows i WSL.

## Dowody i granice weryfikacji

- Ostatni pełny `pnpm test:scripts`: 76/76 PASS; obejmuje brak `node_modules`,
  wspólny przebieg aliasów, fail-fast, narzędzia i ochronę drzewa procesów.
- Rzeczywisty preflight nowego startu: Node 26.12.1, pnpm 12.15.0,
  Docker Engine/Compose i Python 3.14 przeszły.
- Pełna próba nowego `pnpm dev` zatrzymała się na istniejącej sesji/supervisorze.
  Nie przerywano tej sesji. Pełnego nowego przebiegu na tym workspace do startu
  wszystkich usług nie należy przedstawiać jako potwierdzonego.
- Wcześniej w tej sesji rzeczywisty izolowany test infrastruktury potwierdził:
  build/up, status, logs, down z zachowaniem trzech wolumenów, up --no-build,
  delete i ponowne delete. Projekt testowy i jego dane usunięto.
  Komenda do powtórzenia: `pnpm test:dev:infra:integration`.
- Po izolowanym teście właściwy DEV miał `dev:doctor` 8/8. Wcześniej przeszły
  test logowania OIDC, test reloadu Pythona, 150 testów Web, typecheck i lint;
  nie uruchamiano ich ponownie po ostatniej zmianie samego automatycznego startu.
- Kontrole linków, Markdown, taksonomii i `git diff --check` przeszły.
  Przykłady TLS sprawdzono składniowo i według źródeł; nie wykonywano importu CA
  ani generowania nowych certyfikatów na systemie użytkownika.
- Zmiany pozostają lokalne; nie wykonano commita, push ani wdrożenia PROD.

## Dalsza weryfikacja

Po zakończeniu istniejącej sesji DEV sprawdzić pełne nowe `pnpm dev` do uruchomienia
wszystkich trzech procesów hosta. Nie zatrzymywać cudzych lub osobno uruchomionych
procesów po nazwie albo porcie. Wyniki z tej notatki są historyczne — stan usług
i wersje przed kolejną zmianą należy odczytać z aktualnego repo i runtime.
