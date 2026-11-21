---
brief: Zatwierdzona architektura PoC, komponenty UI, polityka sesji Better Auth i zweryfikowane wylogowanie Keycloak.
tags: [memory, handoff, architecture, ui, authentication, keycloak, prisma]
---

# Modulon PoC — stan i decyzje

Zapis: 2026-11-09T00:58:26+01:00, Europe/Warsaw. Pamięć zapisana na wyraźne
żądanie użytkownika. To kontekst do wznowienia, nie zastępstwo weryfikacji kodu.

## Architektura i granice

- Repo: `C:\Users\bos\Documents\modulon-poc`. Repo referencyjne tylko do odczytu:
  `C:\Users\bos\Documents\modulon` oraz
  `C:\Users\bos\Documents\02_contracts\TrueGuard`.
- Minimalny stos: Nginx, PostgreSQL 18.6, Next.js z backendem, SeaweedFS i Keycloak.
  DEV ma wyłącznie cztery kontenery; Web działa na hoście przez `pnpm dev`.
  Bootstrap baz i Keycloak wykonują skrypty uruchamiane przez kontenery.
- Zachować DEV/QA/PROD. QA nadal nie ma kompletnego Dockerfile/env dla Web;
  PROD i pełna akceptacja QA pozostają poza wykonanym zakresem.
- `packages/database`: Prisma 7.10.1. Migracje wyłącznie przez Prisma CLI,
  nigdy ręcznie pisany SQL migracji. Lokalne klucze to `uuid`, generowane przez
  PostgreSQL `uuidv7()`; zewnętrzny Keycloak subject pozostaje bez zmian.
  Komentarze modeli/pól Prisma poprzedzaj `///`.
- Keycloak posiada profile, hasła i przypisania ról. Lokalny User jest referencją
  tożsamości; Session/Account/Verification są technicznym stanem Better Auth.
  System i Role stanowią lokalną identyfikację instalacji i katalog ról.
- Role: ROOT, SADMIN, ADMIN, SYSTEM, AUDITOR, VIEWER, USER, GUEST. Seed jest
  idempotentny, zachowuje UUID instalacji i nie nadaje użytkownikom uprawnień.
- Prywatny bucket avatarów Keycloak ma osobne uprawnienia; sanitizacja obrazów
  i zapis profilu pozostają po stronie serwera/Keycloak. Szczegóły w
  [dokumencie profilu](../../../docs/0305-account-profile-and-avatars.md).

## UI i konwencje

- PL/EN, motywy light/dark/system i kontrast normal/high. Preferencje współdzielone
  z Keycloak przez skonfigurowaną domenę; migracja usuwa stare host-only cookies
  preferencji. Nie zmieniać cookies uwierzytelniania przy poprawkach motywu.
- Komponenty basic: `apps/web/src/ui/basic`; wspólne style w `basic/styles.ts`.
  Galeria wszystkich 46 komponentów basic działa na `/pl/test` i `/en/test`.
- `Popup`, `Blur`, `CornerBadge`, UserPanelV2 oraz komponenty sesji są w
  `apps/web/src/ui/components`. Style złożonych komponentów są w `components/styles.ts`.
- Popup używa natywnego Dialog/portalu, blokady scrolla i przywracania fokusu.
  Promień `radius.control` jest wspólny z przyciskami. X jest danger-outline po
  prawej; nagłówek ma `pl-5 pr-1 py-1`, stopka `px-5 py-1`. Przyciski stopki
  mają równą szerokość i wysokość 32 px. Escape respektuje blokadę zamykania.
- Blur obsługuje natywny backdrop lub osobną powierzchnię za treścią.
  CornerBadge: cztery rogi, kropka, zero/liczba, licznik lub tekst; galeria
  zawiera edytor i przykłady. Nie zastępuje istniejącego inline Badge.
- Navbar używa UserPanelV2; V1 pozostaje dostępny. Finalnie przyjęto dwa etapy:
  najpierw proporcjonalnie rośnie wiersz avatara, nazwy i emaila (150 → 350 px,
  avatar 16 → 48 px), potem rozwijają się szczegóły i przyciski. Zwijanie ma
  odwrotną kolejność. Blur narasta od początku. Kliknięcie tła/nagłówka lub Escape
  minimalizuje; panel mieści się w viewport i respektuje reduced motion.
- Podgląd UserPanel na stronie testowej nie wywołuje endpointów sesji ani zmian
  konta/wylogowania. Prawdziwy panel wymaga zweryfikowanego lifecycle DTO.

## Polityka sesji

- Konfiguracja w Web `.env.example` i lokalnym ignorowanym `.env`, czasy w sekundach:
  `SESSION_TTL=900`, `SESSION_WARNING=120`, `SESSION_AUTO_REFRESH=false`,
  `SESSION_MAX_REFRESHES=3`. Stare `AUTH_SESSION_SECONDS` usunięte.
- Flaga true pozwala odnawiać przy przechodzeniu między stronami; home (`/`,
  `/pl`, `/en` i wariant końcowego slash) jest wyłączony. False oznacza wyłącznie
  ręczne przedłużenie podczas warning. Start strony/reload nie liczy się jako
  nawigacja. Komentarz env zaleca krótki TTL, np. 15 minut, dla trybu true.
- Better Auth ma `disableSessionRefresh=true` i wyłączony cookie cache.
  GET `/api/v1/auth/session-status` jest odczytem co 10 s w widocznej karcie oraz
  po powrocie fokusu. Licznik UI działa co sekundę, ze skorygowanym czasem serwera;
  inicjalizacja SSR jest deterministyczna, bez `Date.now()` podczas renderowania.
- POST `/api/v1/auth/renew-session`: middleware Better Auth, exact Origin,
  walidacja warning/nawigacji i atomowy limit `Session.renewalCount` wspólny dla
  wszystkich kart oraz obu trybów. Zero wyłącza przedłużanie. Zdarzenia blisko
  pełnego TTL są koaleskowane przez 10 s bez zużywania kolejnego przedłużenia.
  Sesji wygasłej/odwołanej nie można reaktywować.
- Migracja `20261108225820_session_renewal_counter` wygenerowana i zastosowana
  przez Prisma CLI w aplikacyjnej bazie DEV. Tymczasowy shadow DB usunięto.
- Role pochodzą z efektywnych realm mappings Keycloak, filtrowanych do ośmiu kodów.
  Brak przypisania pokazuje brak roli, błąd katalogu — niedostępność. Nie nadawać
  domyślnie USER/GUEST. Wyświetlanie ról nie zastępuje autoryzacji serwera.
- Warning pokazuje badge z czasem w prawym górnym rogu dropdownu, Popup i przycisk
  przedłużenia; po limicie przycisk jest nieaktywny. DTO zawiera publiczne UUID,
  nie sekrety. Zmiana UUID sesji/użytkownika w innej karcie odświeża tożsamość SSR,
  zamiast mieszać dane profilu i role różnych osób.

## Automatyczne i twarde wylogowanie

- Zero sekund lub autorytatywne 401 automatycznie wywołuje wylogowanie i pełne
  `window.location.replace`, bez oczekiwania na zamknięcie Popup. Samo 503/błąd
  odpytywania nie dowodzi końca sesji. Podgląd nigdy nie wylogowuje.
- Potwierdzenie ręczne używa `window.location.assign`, jak w TrueGuard; błąd
  endpointu pozostawia Popup z możliwością ponowienia.
- Better Auth plugin `logout-plugin.ts`: POST `/api/v1/auth/hard-sign-out`.
  Sprawdza Origin i podpisane cookie; UUID z klienta sam nie daje dostępu do konta.
  Chroni nową tożsamość przed starą kartą oraz przedłużoną sesję przed starym zegarem.
  Usuwa własną sesję/cookies przed przekierowaniem do logout Keycloak, używając
  odszyfrowanej wskazówki ID-token i dokładnego powrotu `/pl` lub `/en`.
- Publiczne HTTP `/sign-out` deleguje do tego samego mechanizmu; fallback
  Server Action też. Dwa dokładne adresy powrotu są w zarządzanym kliencie Keycloak;
  konfigurację zastosowano w DEV przez `pnpm stack:auth:sync`, zachowując konta
  i istniejące sekrety. Globalne wylogowanie innych urządzeń/back-channel nie jest
  zaimplementowane. Bez podpisanego kontekstu pozostaje lokalne czyszczenie i home;
  nie zgadywać tożsamości dostawcy na podstawie przekazanego UUID.
- Nie logować pełnych URL logout/callback. Istniejący safe log Nginx pomija query.

## Dowody i ograniczenia przy wznowieniu

- Ostatnie `pnpm check`: PASS, typy/lint i 51 testów (14 tooling, 3 DB, 34 Web).
- `pnpm test:auth:integration`: PASS na jednorazowym PostgreSQL/OIDC; obejmuje
  read-only polling, brak/niedostępność ról, współbieżność/limity, cookies, CSRF,
  expiry, hard logout, replay oraz ochronę nowej/przedłużonej sesji. DB usunięto.
- Przeglądarka PL/EN: odliczanie, warning, badge, nawigacja/home, limit, auto logout
  na zero/401, twarda nawigacja, retry, brak logout przy 503 i ochrona odnowionej
  sesji. Widoki 320/390 px oraz animacje/reduced motion sprawdzono wcześniej.
- Rzeczywisty Keycloak: jednorazowy użytkownik przeszedł login, UI hard logout,
  powrót na anonimowe `/en`; następny login wymagał hasła. Konto testowe, jego
  lokalne referencje i profile przeglądarki usunięto. Tymczasowych tras testowych
  nie pozostawiono.
- Przy początkowych próbach startu logowania przez Server Action wystąpił
  sporadyczny 502; nie ustalono przyczyny. Końcowy test rzeczywistego SSO rozpoczął
  OIDC przez API, następnie sprawdził właściwy UI wylogowania. Nie przedstawiać tego
  jako dowodu poprawności każdego wariantu startu logowania.
- DEV Web pozostawiono uruchomiony. PID/stan procesu sprawdź ponownie; nie są trwałą
  konfiguracją. Nie uruchamiaj build na tym samym `.next` równolegle z dev.
- [Dokumentacja logowania i sesji](../../../docs/0304-keycloak-login.md) oraz
  [cookbook Web](../../../docs/0301-web-development.md) opisują szczegóły.
- Brak commit/push w tej sesji. Nie traktuj zastanego niezacommitowanego kodu
  jako własnych zmian do usunięcia. Globalna pamięć Codex nie była aktualizowana.
