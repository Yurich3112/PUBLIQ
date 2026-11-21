---
brief: QA używa domen DEV; migracja adresów zachowuje sekrety, a powrót do DEV korzysta z wrapperów pnpm.
tags: [memory, qa, dev, docker, tls, verification]
---

# Wspólne domeny DEV i QA

## Decyzja i zmiany

- Użytkownik wybrał te same publiczne adresy dla DEV i QA: `modulon.local`,
  `web.modulon.local`, `auth.modulon.local`, `authconsole.modulon.local`,
  `s3.modulon.local` i `s3console.modulon.local`. Zmienia się sposób uruchomienia
  aplikacji: procesy hosta w DEV, zbudowane obrazy release w QA.
- Domyślne porty również są wspólne; środowiska działają naprzemiennie.
  Projekty `modulonpocdev` / `modulonpocqa`, kontenery, wolumeny, dane,
  sekrety i nazwy cookies aplikacji pozostają rozdzielone.
- Zmieniono `.env.qa.example`, fallback aliasu konsoli w Compose i skrypcie
  konsoli. W ignorowanym lokalnym `.env.qa` zmieniono tylko dziewięć publicznych
  pól hostów/URL, sprawdzając zachowanie pozostałych wartości.
- `migrateQaHosts` w `scripts/qa.mjs` przenosi dawne wbudowane domeny QA na
  wspólne adresy podczas `qa:init`. Zachowuje własne domeny użytkownika, porty
  i istniejące sekrety; kolejne wywołanie jest idempotentne.
- QA nadal ma siedem podstawowych usług i osobno włączaną konsolę S3.
  Wspólne nazwy działają także wewnątrz izolowanej sieci proxy QA.

## Przełączanie

- DEV → QA: `pnpm dev:stop && pnpm qa:up`.
- QA → DEV bez usuwania kontenerów: `pnpm qa:stop && pnpm dev`.
- Usunięcie głównych kontenerów/sieci QA z zachowaniem danych, potem DEV:
  `pnpm stack:down --mode qa && pnpm dev`.
- Jeżeli osobno uruchomiono konsolę QA, wcześniej wykonać
  `pnpm s3console:stop --mode qa`, aby zwolnić jej port.
- `qa:stop` oznacza Compose stop, a nie down. Zwykły powrót do DEV nie wymaga
  kasowania danych. Nie używać globalnego prune ani usuwać wolumenów.
- Surowa komenda Compose z samym `.env.qa` nie wystarcza: model wymaga
  `QA_DATABASE_URL` i `QA_QUEUE_DATABASE_URL`, które wrapper wylicza w pamięci.
  Poprzednią poradę z surowym Compose down zastąpiono wrapperem stack.
  Nie kopiować tych adresów z hasłami do dokumentacji, logów ani dodatkowych env.
- Dla ponownego wczytania plików TLS w przygotowanym QA dokumentacja zaleca
  `pnpm qa:stop && pnpm qa:start`; DEV może restartować sam proxy.

## Weryfikacja przed publikacją

- `pnpm test:scripts`: 78/78 PASS.
- `pnpm stack:config --mode qa`: PASS, rzeczywisty odczytowy wrapper Compose.
- `pnpm test:qa:integration`: PASS na osobnym projekcie i wolnych portach:
  siedem healthy usług, migracje/seed, Web HTTPS, kanoniczny OIDC przez DNS/TLS,
  trwałe zadanie kolejki wykonane przez Python i odrzucenie błędnego tokena.
  Potwierdzono niezmienione identyfikatory kontenerów DEV. Usunięto wyłącznie
  testowe kontenery, sieci, wolumeny i pliki prywatnej konfiguracji.
- W poprzednim kroku potwierdzono również zgodność rzeczywistego Compose QA,
  origin/issuer Web, aliasów proxy i certyfikatu z publicznymi domenami DEV.
- Kontrole dokumentacji obejmują linki, Markdown, taksonomię i diff whitespace.
  Główne źródło instrukcji: `docs/0316-qa-containers.md`, z odnośnikami w README,
  komendach workspace, runbooku oraz dokumentacji TLS.
- Weryfikacja izolowana nie oznacza przełączenia normalnych środowisk użytkownika,
  przetestowania browser SSO ani uruchomienia całego nowego `pnpm dev` w tym
  workspace. Wcześniejsza blokada istniejącego supervisora pozostaje osobną
  granicą dowodów. PROD nie był wdrażany.
