# PUBLIQ — Asystent UDIP (Urząd Miasta Bydgoszczy)

> **HackNation 2026** · Wyzwanie: *Inteligentny asystent urzędnika — Generator odpowiedzi na UDIP z kalendarzem (organizerem) wniosków*  
> **Odbiorca:** Biuro Komunikacji Społecznej (BKS) Urzędu Miasta Bydgoszczy (*Administrator Informacji Publicznej — Zarządzenie nr 535/2024 Prezydenta Miasta Bydgoszczy*)  
> **Zespół:** **FeatureFromFuture** (Kacper Boś, Jakub Mielcarek, Natalia Balicka, Yurii Holovko, Stanisław Wałga)

**PUBLIQ** to przeglądarkowa (bez instalacji `.exe`) aplikacja intranetowa, która skraca obsługę wniosków o udostępnienie informacji publicznej (UDIP) z wielu dni do kilku minut — przy zachowaniu **100% lokalnego działania offline (air-gapped)** na otwartowagowych modelach **Gemma 4 (Apache 2.0)**.

---
VIDEO https://fex.net/uk/s/0moamz3

## Co potrafi PUBLIQ?

1. **Kokpit Urzędnika (`/`) i Kalendarz Wniosków (`/kalendarz`)**
   - Rejestr ~800 spraw rocznie z oficjalną sygnaturą **`BKS.IV.1431.<nr>.<rok>`**, sortowany od najpilniejszych (`Po terminie / Dziś` → `Czeka na wydziały` → `Komplet odpowiedzi` → `Zakończone`).
   - Rozwijane wiersze z niezależnym śledzeniem odpowiedzi poszczególnych wydziałów UM Bydgoszczy (`X/Y odp.`), załączaniem plików PDF/DOCX, podglądem PDF w oknie aplikacji oraz szybką kwerendą (Art. 13 ust. 2 UDIP) i wezwaniem do doprecyzowania (7 dni).
   - Startuje z **10 wzorcowymi sprawami UM Bydgoszczy (5 Zielonych / 5 Czerwonych)**.
2. **Obsługa wniosków PDF i Word (`.docx`) + Weryfikator OCR 1:1 (`/ocr`)**
   - **Pliki Word (`.docx`)**: natychmiastowa ekstrakcja czystego tekstu z `word/document.xml` (bez obrazków i zbędnego formatowania) i bezpośrednie przejście do 3-kolumnowego ekranu rutowania i generowania odpowiedzi.
   - **Skany PDF i pismo ręczne**: usuwanie kratki zeszytowej (OpenCV), podgląd 1:1 skanu z ramkami słów obok edytowalnej transkrypcji, czerwone oznaczenia słów do weryfikacji, cofanie `Ctrl+Z`, usuwanie artefaktów oraz 1-klikowe *Wezwanie do doprecyzowania (7 dni)* dla nieczytelnych skanów.
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
| **OCR pisma ręcznego, streszczenia JSON, projekty pism** | **`Gemma 4 E4B`** (`gemma4:e4b` przez Ollama) | ~3–5 GB (GPU / CPU) | Apache 2.0 |
| **Lekki tryb awaryjny (stacje CPU)** | **`Gemma 4 E2B`** (`gemma4:e2b` przez Ollama) | ~1.5–2.5 GB RAM (CPU) | Apache 2.0 |
| **Usuwanie kratki, ramki słów 1:1 i detekcja PII** | OpenCV + RapidOCR (ONNX) + `PII-Tracer` + Reguły BKS | ~1.2 GB RAM (CPU) | Open-Source |

> **Tryb awaryjny bez GPU / bez Ollamy:** Jeśli Ollama nie jest uruchomiona, aplikacja działa w 100% stabilnie — dostępne są szablony BKS, ekstrakcja Word/PDF, dopasowanie w Bazie Wiedzy i anonimizacja PII.

---

## Instalacja krok po kroku (dla każdego — od zera w 5 minut)

### Krok 0: Zainstaluj 5 darmowych programów (jeśli jeszcze ich nie masz)

| Program | Wersja | Skąd pobrać |
| :--- | :--- | :--- |
| **Git** | najnowsza | https://git-scm.com/downloads |
| **Node.js** | **24.x** (LTS) | https://nodejs.org |
| **pnpm** | **12.x** | W terminalu: `corepack enable && corepack prepare pnpm@12.15.0 --activate` |
| **Python** | **3.12 – 3.14** | https://www.python.org/downloads/ *(na Windows zaznacz „Add Python to PATH”)* |
| **Docker Desktop** | najnowsza | https://www.docker.com/products/docker-desktop/ *(uruchom go przed startem!)* |
| **mkcert** *(lokalne HTTPS)* | najnowsza | Windows: `winget install FiloSottile.mkcert` · macOS: `brew install mkcert` |

---

### Krok 1: Pobierz kod i zainstaluj pakiety

Otwórz terminal (PowerShell na Windows lub Terminal na macOS/Linux):

```bash
git clone https://github.com/Yurich3112/asystent_hacknation2026_FFF.git
cd asystent_hacknation2026_FFF
pnpm install --frozen-lockfile
```

---

### Krok 2: Dodaj lokalny adres `modulon.local` do pliku `hosts`

Dzięki temu aplikacja i logowanie Keycloak będą działały pod bezpiecznym adresem `https://modulon.local`.

- **Windows** — uruchom PowerShell **jako Administrator** i wklej:
  ```powershell
  Add-Content -Path "$env:SystemRoot\System32\drivers\etc\hosts" -Value "`n127.0.0.1 modulon.local auth.modulon.local s3.modulon.local s3console.modulon.local"
  ```
- **macOS / Linux** — uruchom w terminalu:
  ```bash
  echo "127.0.0.1 modulon.local auth.modulon.local s3.modulon.local s3console.modulon.local" | sudo tee -a /etc/hosts
  ```

---

### Krok 3: Wygeneruj zaufany certyfikat HTTPS (`mkcert`)

W głównym katalogu projektu uruchom:

```bash
mkcert -install
mkdir -p infra/local/certs
mkcert -cert-file infra/local/certs/modulon.local.crt -key-file infra/local/certs/modulon.local.key modulon.local "*.modulon.local" localhost 127.0.0.1
```

Skopiuj certyfikat CA do `infra/local/certs/rootCA.pem`:
- **Windows (PowerShell):**
  ```powershell
  Copy-Item "$(mkcert -CAROOT)\rootCA.pem" "infra\local\certs\rootCA.pem"
  ```
- **macOS / Linux:**
  ```bash
  cp "$(mkcert -CAROOT)/rootCA.pem" infra/local/certs/rootCA.pem
  ```

---

### Krok 4: Automatycznie utwórz pliki konfiguracyjne `.env`

Jedna komenda wygeneruje wszystkie wymagane pliki `.env` (`apps/web/.env`, `apps/pyworker/.env`, `packages/database/.env`, `infra/local/.env.dev`) z losowymi hasłami:

```bash
pnpm stack:init
pnpm validate:dev
pnpm validate:certs
```

Wszystkie 3 komendy powinny zakończyć się statusem `[ok]`.

---

### Krok 5: (Opcjonalnie) Uruchom lokalny model AI **Gemma 4** w Ollamie

Jeśli chcesz testować generowanie odpowiedzi i OCR pisma ręcznego przez lokalny model Gemma 4:

```bash
docker run -d --name modulon-ollama -p 11434:11434 -v ollama:/root/.ollama ollama/ollama
docker exec -it modulon-ollama ollama pull gemma4:e4b
# (opcjonalnie na słabszy komputer bez GPU):
docker exec -it modulon-ollama ollama pull gemma4:e2b
```

---

### Krok 6: Uruchom całą aplikację jedną komendą!

Upewnij się, że **Docker Desktop jest uruchomiony**, a następnie wpisz:

```bash
pnpm dev
```

Skrypt automatycznie:
1. Zbuduje i uruchomi kontenery PostgreSQL 18, Keycloak (z motywem **PUBLIQ**), SeaweedFS (S3) i Nginx.
2. Przygotuje środowisko Python (`.venv`) dla `pyworker` (OCR + PII).
3. Wykona migracje bazy danych i zasieje **10 przykładowych spraw UM Bydgoszczy** oraz Bazę Wiedzy.
4. Uruchomi aplikację webową Next.js + worker Pythona + kolejkę `pg-boss`.

Gdy zobaczysz w logach gotowość serwerów, otwórz w przeglądarce:

👉 **https://modulon.local**

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
| `pnpm dev` | Uruchamia cały projekt w trybie DEV |
| `pnpm dev:stop` | Zatrzymuje aplikację i kontenery Docker (zachowuje dane w bazie) |
| `pnpm dev:rebuild:docker` | Przebudowuje obrazy Dockera (np. po zmianie motywu logowania Keycloak) |
| `pnpm dev:doctor` | Diagnozuje porty, certyfikaty, `.env`, bazę danych i kontenery |
| `pnpm --filter ./apps/web run lint` | Sprawdza jakość kodu ESLint |
| `pnpm --filter ./apps/web run test` | Uruchamia 192 testy automatyczne aplikacji webowej |

---

## Struktura repozytorium

```text
asystent_hacknation2026_FFF/
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
