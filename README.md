# PUBLIQ — Asystent UDIP (Urząd Miasta Bydgoszczy)

> **HackNation 2026** · Wyzwanie: *Inteligentny asystent urzędnika — Generator odpowiedzi na UDIP z kalendarzem (organizerem) wniosków*  
> **Odbiorca:** Biuro Komunikacji Społecznej (BKS) Urzędu Miasta Bydgoszczy (*Administrator Informacji Publicznej — Zarządzenie nr 535/2024 Prezydenta Miasta Bydgoszczy*)  
> **Zespół:** **FeatureFromFuture** (Kacper Boś, Jakub Mielcarek, Natalia Balicka, Yurii Holovko, Stanisław Wałga)

**PUBLIQ** to przeglądarkowa (bez instalacji `.exe`) aplikacja intranetowa, która skraca obsługę wniosków o udostępnienie informacji publicznej (UDIP) z wielu dni do kilku minut — przy zachowaniu **100% lokalnego działania offline (air-gapped)** na otwartowagowych modelach **Gemma 4 (Apache 2.0)**.

## Co potrafi PUBLIQ?

1. **Kokpit Urzędnika (`/`) i Kalendarz Wniosków (`/kalendarz`)**
   - Rejestr ~800 spraw rocznie z oficjalną sygnaturą **`BKS.IV.1431.<nr>.<rok>`**, sortowany od najpilniejszych (`Po terminie / Dziś` → `Czeka na wydziały` → `Komplet odpowiedzi` → `Zakończone`).
   - Rozwijane wiersze z niezależnym śledzeniem odpowiedzi poszczególnych wydziałów UM Bydgoszczy (`X/Y odp.`), załączaniem plików PDF/DOCX, podglądem PDF w oknie aplikacji oraz szybką kwerendą (Art. 13 ust. 2 UDIP) i wezwaniem do doprecyzowania (7 dni).
   - Startuje z **10 wzorcowymi sprawami UM Bydgoszczy (5 Zielonych / 5 Czerwonych)**.
2. **Obsługa wniosków PDF i Word (`.docx`) + Weryfikator OCR 1:1 (`/ocr`)**
   - **Pliki Word (`.docx`)**: natychmiastowa ekstrakcja czystego tekstu z `word/document.xml` (bez obrazków i zbędnego formatowania) i bezpośrednie przejście do 3-kolumnowego ekranu rutowania i generowania odpowiedzi.
   - **Skany PDF i pismo ręczne**: usuwanie kratki zeszytowej (OpenCV), podgląd 1:1 skanu z ramkami słów obok edytowalnej transkrypcji, czerwone oznaczenia słów do weryfikacji, cofanie `Ctrl+Z`, usuwanie artefaktów oraz 1-klikowe *Wezwanie do doprecyzowania (7 dni)* dla nieczytelnych skanów.
   - **Jak działa odczyt (`/ocr/pokaz`)**: spowolnione odtworzenie przebiegu na skanie — kratka, ramki słów, pierwszy odczyt obrazu i druga korekta całego pisma.
3. **Baza Wiedzy, 4 scenariusze UDIP i archiwum finalnych odpowiedzi (`data/final_responses/`)**
   - Natychmiastowe dopasowanie spraw bliźniaczych z 2025/2026 r., automatyczna pre-selekcja top 1–2 wydziałów UM Bydgoszczy, obsługa trybu **`Nasz dział (BKS)`** (odpowiadamy sami bez wysyłania zapytań) oraz przekierowania do podmiotów zewnętrznych (Art. 4 ust. 3 UDIP — ZUS, ZDMiKP, WKZ) z przyciskiem **`AI się myli`** do nadpisania decyzji modelu.
   - Katalog **`data/final_responses/`** przechowuje zanonimizowane odpowiedzi finalne cytowane przez rekordy JSON i przekazywane do Gemma 4 jako wzorzec stylu i podstaw prawnych.
4. **3-etapowa obsługa sprawy (`/sprawy/[uuid]`): `1. Projekt pisma` → `2. Redakcja` → `3. Zarządzanie`**
   - **1. Projekt pisma**: 4 oficjalne szablony BKS + generowanie projektu odpowiedzi lokalnym modelem **Gemma 4** z cytowaniem wcześniejszej odpowiedzi z `data/final_responses/`.
   - **2. Redakcja (Anonimizator PII)**: wykrywanie 28 kategorii PII z **czarnymi paskami zaczernień (black boxes)** i ochroną funkcjonariuszy publicznych (Art. 5 ust. 2 UDIP — np. nazwisko Prezydenta pozostaje jawne).
   - **3. Zarządzanie**: poziome kafelki — akceptacja przełożonego, eksport czystego `.txt` (bez możliwości cofnięcia `Ctrl+Z`), rejestracja daty wysyłki (`Status E`, automatyczna archiwizacja w `data/final_responses/`) oraz (dla Administratora) trwałe usuwanie wniosku.
5. **Panel Administratora i Graf Bazy Wiedzy (`/admin/knowledge`)**
   - Ścisła separacja ról przez Keycloak (`Urzędnik` vs `Administrator`). Tylko Administrator widzi pełny graf klastrów tematycznych i może dodawać nowe akty prawne lub archiwalne sprawy.

---

## Lokalny stos AI (100% Air-Gapped · Apache 2.0)

| Zadanie | Model / Narzędzie | Zasoby | Licencja |
| :--- | :--- | :--- | :--- |
| **OCR pisma ręcznego, streszczenia JSON, projekty pism** | **`Gemma 4 E4B`** (`gemma4:e4b` przez Ollama) | pobranie ~6,6–9,5 GB | Apache 2.0 |
| **Lekki tryb awaryjny (16 GB RAM / samo CPU)** | **`Gemma 4 E2B`** (`gemma4:e2b` przez Ollama) | pobranie ~4,6–7,5 GB | Apache 2.0 |
| **Usuwanie kratki, ramki słów 1:1 i detekcja PII** | OpenCV + RapidOCR (ONNX) + `PII-Tracer` + Reguły BKS | ~1.2 GB RAM (CPU) | Open-Source |

> **Tryb awaryjny bez GPU / bez Ollamy:** Jeśli Ollama nie jest uruchomiona, aplikacja działa w 100% stabilnie — dostępne są szablony BKS, ekstrakcja Word/PDF, dopasowanie w Bazie Wiedzy i anonimizacja PII.

---

## Instalacja krok po kroku

Pierwsze uruchomienie pobiera obrazy Dockera i wagi Gemma 4. Na typowym laptopie zajmie to **15–40 minut**, nie pięć. Kolejne `pnpm dev` startuje z cache.

### Krok 0: Zainstaluj darmowe programy (jeśli jeszcze ich nie masz)

| Program | Wersja | Skąd pobrać |
| :--- | :--- | :--- |
| **Git** | najnowsza | https://git-scm.com/downloads |
| **Node.js** | **22.18+** (działa 24 LTS i 26) | https://nodejs.org |
| **pnpm** | **dokładnie 12.15.0** | `corepack enable` potem `corepack prepare pnpm@12.15.0 --activate` |
| **Python** | **3.12 – 3.14** | https://www.python.org/downloads/ *(na Windows zaznacz „Add Python to PATH”)* |
| **Docker Desktop** | najnowsza | https://www.docker.com/products/docker-desktop/ *(musi być uruchomiony przed `pnpm dev`)* |
| **mkcert** *(lokalne HTTPS)* | najnowsza | Windows: `winget install FiloSottile.mkcert` · macOS: `brew install mkcert` |
| **Ollama** *(Gemma 4)* | najnowsza | Windows: `winget install -e --id Ollama.Ollama` · https://ollama.com/download |

---

### Krok 1: Pobierz kod i zainstaluj pakiety

Otwórz terminal w zwykłym katalogu użytkownika (nie w `C:\Windows\System32`):

```bash
git clone https://github.com/Yurich3112/PUBLIQ.git
cd PUBLIQ
pnpm install --frozen-lockfile
```

---

### Krok 2: Dodaj lokalne adresy do pliku `hosts`

Pomiń ten krok, jeśli te nazwy już tam są. Inaczej logowanie Keycloak i S3 nie otworzą się w przeglądarce.

- **Windows** — PowerShell **jako Administrator**:
  ```powershell
  Add-Content -Path "$env:SystemRoot\System32\drivers\etc\hosts" -Value "`n127.0.0.1 modulon.local web.modulon.local auth.modulon.local authconsole.modulon.local s3.modulon.local s3console.modulon.local"
  ```
- **macOS / Linux**:
  ```bash
  echo "127.0.0.1 modulon.local web.modulon.local auth.modulon.local authconsole.modulon.local s3.modulon.local s3console.modulon.local" | sudo tee -a /etc/hosts
  ```

---

### Krok 3: Wygeneruj zaufany certyfikat HTTPS (`mkcert`)

Nazwy plików muszą być dokładnie `localhost.pem`, `localhost-key.pem` i `rootCA.pem`. Inne nazwy odrzuca `pnpm validate:certs`.

**Windows (PowerShell, katalog główny repozytorium):**

```powershell
New-Item -ItemType Directory -Force -Path .\infra\local\certs | Out-Null
mkcert -install
mkcert -cert-file .\infra\local\certs\localhost.pem -key-file .\infra\local\certs\localhost-key.pem localhost 127.0.0.1 ::1 modulon.local "*.modulon.local"
Copy-Item -LiteralPath (Join-Path (mkcert -CAROOT) "rootCA.pem") -Destination .\infra\local\certs\rootCA.pem
```

**macOS / Linux:**

```bash
mkdir -p infra/local/certs
mkcert -install
mkcert -cert-file infra/local/certs/localhost.pem -key-file infra/local/certs/localhost-key.pem localhost 127.0.0.1 ::1 modulon.local "*.modulon.local"
cp "$(mkcert -CAROOT)/rootCA.pem" infra/local/certs/rootCA.pem
```

`mkcert -install` może poprosić o uprawnienia administratora. To jednorazowe zaufanie lokalnego CA w systemie.

---

### Krok 4: Utwórz pliki `.env`

```bash
pnpm stack:init
pnpm validate:dev
pnpm validate:certs
```

`stack:init` tworzy brakujące `infra/local/.env.dev`, `apps/web/.env`, `apps/pyworker/.env` i `packages/database/.env`. Istniejących plików nie nadpisuje. Wszystkie trzy komendy powinny zakończyć się `[ok]`.

Lokalne hasła w przykładach są celowo słabe i takie same między plikami, żeby świeży klon wstał bez ręcznego przepisywania sekretów. Przed jakimkolwiek wystawieniem poza własny laptop wygeneruj własne hasła i podmień je w obu stronach (aplikacja i `infra/local/.env.dev`).

---

### Krok 5: Pobierz **Gemma 4** do natywnej Ollamy

Aplikacja woła model pod `http://127.0.0.1:11434`. Na Windows zainstaluj **natywną Ollamę**, nie kontener `ollama/ollama`.

Kontener Dockera na Windowsie nie widzi zintegrowanej karty AMD. Natywna Ollama używa Vulkan. Dedykowana NVIDIA działa w tej samej aplikacji natywnej. Ollama **domyślnie wyłącza iGPU**. Na Radeonie zintegrowanym włącz go raz, dla bieżącego użytkownika, i zrestartuj Ollamę:

```powershell
[Environment]::SetEnvironmentVariable("OLLAMA_IGPU_ENABLE", "1", "User")
Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
```

Bez tej zmiennej log Ollamy zawiera `dropping integrated GPU` i cały model idzie na CPU. Po restarcie `ollama ps` w trakcie generowania powinno pokazać bibliotekę `Vulkan`, nie samo `cpu`.

Po instalacji zamknij i otwórz terminal, żeby `ollama` było w `PATH`:

```bash
ollama pull gemma4:e4b
ollama pull gemma4:e2b
```

`gemma4:e4b` to model domyślny (OCR, streszczenia, projekty pism). `gemma4:e2b` jest awaryjny. Na laptopie z **16 GB RAM** E4B razem z Dockerem, przeglądarką i Node może wymusić swap. Jeśli system zaczyna mielić dyskiem, w `apps/pyworker/.env` ustaw `PYWORKER_OCR_VLM_MODEL=gemma4:e2b` i `PYWORKER_OCR_VLM_FALLBACK_MODEL=gemma4:e2b`, a w `apps/web/.env` odkomentuj:

```env
UDIP_PLLUM_URL=http://127.0.0.1:11434
UDIP_PLLUM_MODEL=gemma4:e2b
UDIP_LLM_FALLBACK_MODEL=gemma4:e2b
```

Potem zrestartuj `pnpm dev`. Sprawdzenie, że Ollama żyje:

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

Bez Ollamy aplikacja dalej wstaje: szablony BKS, Word/PDF, baza wiedzy i anonimizacja PII działają. Generowanie AI i OCR pisma ręcznego czekają, aż model będzie dostępny.

---

### Krok 6: Uruchom całą aplikację

Docker Desktop musi być uruchomiony.

```bash
pnpm dev
```

Skrypt:
1. Sprawdza Node, pnpm 12.15.0, Dockera, Pythona, `.env` i certyfikat.
2. Buduje i uruchamia PostgreSQL 18, Keycloak (motyw **PUBLIQ**), SeaweedFS, konsolę S3 i Nginx.
3. Tworzy `.venv` Pythona i instaluje zahashowane koła (OpenCV, RapidOCR, FastAPI).
4. Wykonuje migracje i zasiewa przykładowe sprawy oraz bazę wiedzy.
5. Uruchamia Next.js, worker Pythona i kolejkę `pg-boss`.

To polecenie zostaje na pierwszym planie. Gdy w logach widać gotowość serwerów, otwórz:

👉 **https://modulon.local**

Zatrzymanie hosta: `Ctrl+C` (kontenery zostają). Cały stos w dół, z zachowaniem danych: `pnpm dev:stop`.

---

### Gotowa wersja w kontenerach

`pnpm dev` kompiluje stronę przy każdym wejściu. Do pokazu i zwykłej pracy uruchom zbudowaną wersję. Cała aplikacja jest wtedy w kontenerach, bez trybu deweloperskiego:

```bash
pnpm dev:stop
pnpm qa:up
```

Adres zostaje ten sam: **https://modulon.local**. Startują strona, kolejka, worker Pythona, baza, logowanie, pliki i proxy. Strony są już zbudowane, więc wejście na nie nie uruchamia kompilacji. Gemma 4 zostaje w Ollamie na tym komputerze; worker sięga do niej pod `host.docker.internal:11434`.

Powrót do pracy nad kodem: `pnpm qa:stop`, potem `pnpm dev`. Dane QA i DEV leżą w osobnych wolumenach.

---

## Szybki scenariusz testowy dla Jury (2 minuty)

Przykładowe wnioski z UM Bydgoszczy znajdują się w katalogu `docs/Przykładowe wnioski i odpowiedzi -20261121T114640Z-1-001/Przykładowe wnioski i odpowiedzi/`:

1. **Zaloguj się** przyciskiem w prawym górnym rogu (możesz zarejestrować własne konto przez ekran logowania PUBLIQ / Keycloak lub zalogować się kontem Administratora).
2. **Kalendarz Wniosków (`/kalendarz`)**: kliknij dowolny wiersz (np. `BKS.IV.1431.590.2026`), rozwiń statusy wydziałów i kliknij **`Podgląd dokumentu`**, aby otworzyć PDF odpowiedzi wydziału.
3. **Nowy wniosek z pliku Word (`.docx`) (`/ocr`)**: wgraj `Wniosek - BKS.IV.1431.15.2026.docx` (rzeźba Stehnovej → automatycznie wykrywa **Scenariusz 3: WKZ**; kliknij **`AI się myli`**, zaznacz wydziały lub wybierz **`Nasz dział (BKS)`**, kliknij **`Wygeneruj odpowiedź`** i **`Zapisz sprawę w Kalendarzu`**).
4. **OCR pisma odręcznego (`/ocr`)**: wgraj `Wniosek - BKS.IV.1431.16.2026.pdf` (kartka w kratkę — usuwanie kratki + porównanie 1:1 + klikanie słów do edycji).
5. **Generator pism + Czarne paski PII (`/sprawy/[uuid]`)**: otwórz sprawę `BKS.IV.1431.599.2026`, kliknij **`Wygeneruj z AI (Gemma 4)`**, przejdź do **`2. Redakcja`** (zobaczysz czarne paski zaczernień na danych osobowych i numerze PESEL), a następnie w **`3. Zarządzanie`** zatwierdź wersję, pobierz czysty `.txt` i zamknij sprawę (`Status E`).

---

## Przydatne komendy i rozwiązywanie problemów

| Komenda | Co robi |
| :--- | :--- |
| `pnpm dev` | Uruchamia cały projekt w trybie DEV (strony kompilują się przy wejściu) |
| `pnpm dev:stop` | Zatrzymuje aplikację i kontenery DEV (zachowuje dane w bazie) |
| `pnpm qa:up` | Buduje i uruchamia gotową wersję w kontenerach |
| `pnpm qa:stop` | Zatrzymuje kontenery QA (zachowuje dane) |
| `pnpm dev:rebuild:docker` | Przebudowuje obrazy Dockera (np. po zmianie motywu logowania Keycloak) |
| `pnpm dev:doctor` | Diagnozuje porty, certyfikaty, `.env`, bazę danych i kontenery |
| `pnpm --filter ./apps/web run lint` | Sprawdza jakość kodu ESLint |
| `pnpm --filter ./apps/web run test` | Uruchamia testy automatyczne aplikacji webowej |

Jeśli `pnpm dev` albo `pnpm qa:up` zatrzyma się na `Bind for 127.0.0.1:8333 failed: port is already allocated` (albo na 5432, 443, 8080, 8090), drugi stos DEV/QA tego projektu zajmuje te same porty. Zatrzymaj go bez kasowania danych (`pnpm dev:stop` albo `pnpm qa:stop`) i uruchom ponownie. Nie używaj `docker volume rm` ani `down --volumes`.

---

## Struktura repozytorium

```text
PUBLIQ/
├── apps/
│   ├── web/                  # Next.js (App Router), UI PUBLIQ, API, Baza Wiedzy, Gemma 4
│   └── pyworker/             # FastAPI + Uvicorn (Port 8010) — OpenCV, RapidOCR, PII-Tracer
├── packages/
│   ├── database/             # Prisma 7 + PostgreSQL (sprawy UDIP, graf Bazy Wiedzy, szablony)
│   ├── queue/                # pg-boss (zadania w tle)
│   └── monitoring/           # Monitoring dostępności usług
├── data/
│   └── final_responses/      # Zanonimizowane odpowiedzi finalne cytowane przez Bazę Wiedzy i Gemma 4
├── infra/local/              # Docker Compose (Postgres, Keycloak z motywem PUBLIQ, SeaweedFS, Nginx)
├── docs/                     # Specyfikacja UDIP_COMPLETE_IDEA.md, akty prawne i przykładowe wnioski
└── tests/                    # Testy automatyczne (web + pyworker)
```
