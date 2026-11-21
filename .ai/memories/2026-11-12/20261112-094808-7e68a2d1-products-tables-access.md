---
brief: Produkty z opcjonalnym zdjęciem, asynchroniczne tabele, trwałe usuwanie plików i parametryzowana autoryzacja oparta na poziomach ról.
tags: [memory, handoff, products, files, tables, authorization, keycloak, prisma]
---

# Produkty, tabele i poziomy dostępu — 2026-11-12

Zapis na wyraźne żądanie użytkownika. Uzupełnia i w opisanym zakresie zastępuje
notatki z 2026-11-11. Dotyczy lokalnego DEV. Przed wznowieniem sprawdź kod,
stan Git i usługi; wyniki testów poniżej są historyczne.

## Produkty i formularz

- Prisma `Product` / tabela `product`: UUID generowany przez PostgreSQL `uuidv7()`,
  unikalny `code`, `name`, opcjonalny `description`, `status`, `price Decimal(19,4)`,
  `currency` domyślnie PLN, opcjonalny `image_file_uuid`, audyt `created_at`,
  `updated_at`, `created_by`, `updated_by` oraz opcjonalny `last_archived_at`.
- Statusy produktu: `active`, `inactive`, `pending_archiving`, `archived`,
  `pending_deletion`, `softdelete`. Formularz tworzenia dopuszcza active/inactive.
  Nie dodano edycji, usuwania ani procesu archiwizacji produktów.
- `/pl/admin/products` i `/en/admin/products` mają tabelę, checkboxy i szczegóły.
  Wyszukiwanie po kodzie/nazwie, filtry statusu/obecności zdjęcia i sortowanie
  wykonywane są w bazie przed paginacją. Cena przechodzi jako string i jest
  formatowana bez utraty precyzji przez konwersję całej kwoty do JS Number.
- „Dodaj produkt” otwiera push aside i zmienia adres na `/admin/products/create`
  z prefiksem języka. Działa też bezpośrednie wejście/reload tego adresu.
  Natywna historia przeglądarki steruje panelem; formularz jest poza tabelą.
- Pola: kod, nazwa, opis, cena, waluta, status i opcjonalne zdjęcie. Walidacja
  jest po obu stronach. Autorzy pochodzą z sesji. Kod normalizowany do uppercase;
  cena akceptuje przecinek lub kropkę, bez wartości ujemnych i ponad 4 cyfr ułamka.
- Zdjęcie: JPG/PNG/WebP do 8 MiB, kontrola rzeczywistych bajtów i dekodowania,
  limit pikseli, odrzucenie animacji, normalizacja do WebP do 1600 × 1600.
  Produkt, File i FileVersion zapisują się w jednej transakcji; obsłużono
  sprzątanie częściowego uploadu i niejednoznaczną odpowiedź po commit.
- Tabela pokazuje nazwę powiązanego pliku albo „Bez zdjęcia”. Podgląd w formularzu
  używa lokalnego Blob URL. Endpoint odczytu zdjęć zapisanych w storage i miniatury
  tabeli pozostają poza tą implementacją. Relacja do File ma `onDelete: Restrict`.

## Wspólne zachowanie tabel

- Users, Files i Products renderują najpierw toolbar, nagłówki i paginator.
  Odczyt rozpoczyna się po hydratacji przez ponownie autoryzowaną Server Action.
  Ciało pokazuje throbber o wysokości około czterech wierszy.
- `TableQuery` przechwytuje zapytania formularzy i linki własnej tabeli.
  URL/history zmieniają się bez przeładowania dokumentu; `useSearchParams`
  uruchamia pobranie nowych danych. Wstecz/Dalej odtwarza zapytanie.
- `useTableRefresh` odrzuca wyniki nieaktualnych żądań. Przy odświeżaniu stare
  ciało jest ukryte/inert, a komponent pozostaje zamontowany.
- `TableDataRegion` mierzy wysokość przez ResizeObserver. `tableMotion` we
  wspólnym `ui/components/styles.ts` ustawia 100 ms; loader, fade i zmiana
  wysokości respektują reduced motion. Loader pozostaje widoczny przy poziomym
  przewijaniu szerokiej tabeli na małym ekranie.
- `TablePaginator` wspólny dla trzech tabel: pierwsza/poprzednia/następna/ostatnia,
  numery stron, skok do numeru, tooltipy, rozmiar strony, osobne liczniki wyników
  i stron. Nieznane wyniki pokazują „—”, a nawigacja jest wtedy zablokowana.
- Produkty przy pustej liście pokazują „Brak danych”. Błąd jest czerwonym wierszem
  na pełną szerokość i owner-scoped powiadomieniem u góry; tabela/paginator zostają.
- Toolbar: dodatkowe akcje → divider → filtry → divider → odświeżanie po prawej.
  Wspólne hover z domyślnym tłem; filtr zachowuje własny stan. Nagłówek i komórki
  kolumny akcji używają `actionColumn` ze wspólną lewą krawędzią.
- Files mają teraz numerowaną paginację. Domyślna lista obejmuje bucket;
  dokładny licznik wymaga skanowania metadanych S3 w partiach po 1000 obiektów,
  z zachowaniem tylko żądanego okna. Wyszukiwanie/filtry katalogu obejmują cały
  katalog przed paginacją; obiekty spoza katalogu nie uczestniczą w tych filtrach.
  Sortowanie Files/Users nadal dotyczy pobranej strony; Products sortuje w SQL.

## Autoryzacja i Keycloak

- `schemas/access.ts`: ROOT=100, SADMIN=90, ADMIN=80, USER=50, LOGED=0.
  Pozostałe istniejące role zachowano bez nadawania im wyższego poziomu.
- `withAccess({ requireLogin: true, minRoleLevel: 80 }, callback)` i `requireAccess`
  są wspólnym mechanizmem akcji i layoutów. `ADMIN_ACCESS` wymaga poziomu >=80.
  `withAdminSession` przekazuje do mutacji zweryfikowany lokalny UUID autora.
- LOGED=0 wymaga ważnej sesji, także gdy użytkownik nie ma przypisanej roli.
  Anonimowy lub wygasły użytkownik nie otrzymuje poziomu 0. Awaria katalogu ról
  nie daje dostępu powyżej 0. Poziom wynika z nazw ról odczytanych z Keycloak
  i lokalnego mapowania, nigdy z liczby przesłanej przez klienta.
- Layout administracji i każda akcja odczytu/zapisu sprawdzają politykę osobno.
  Layout nie jest dziedziczoną gwarancją dla Server Actions. Cache decyzji/odczytów
  ról jest ograniczony do pojedynczego żądania.
- Realm DEV zsynchronizowano: USER ma atrybut level=50, dodano LOGED level=0
  oraz kompozycję USER → LOGED. Zachowano ROOT → SADMIN → ADMIN → USER,
  konta, sekrety, identyfikatory i przypisania. Nie resetowano wolumenów.
- Migracje `20261112090000_products` i `20261112120000_logged_role` wygenerowano
  przez Prisma CLI i zastosowano w DEV. Idempotentny seed ma 9 ról.
- Zabezpieczono DEV przed globalnie zachowanym klientem Prisma sprzed modelu
  Product: niekompatybilny klient jest zamykany i odtwarzany.

## Pliki i przyciski

- Akcja odpowiadająca aktualnemu statusowi jest disabled i ma ikonę Fill.
  Spoczynek outline; hover daje pełny kolor i kontrast ikony.
- Usunięto przycisk „Usuń logicznie” i możliwość nowych przejść do softdelete
  dla plików. Zachowano odczyt starej wartości i możliwość wyjścia z niej.
- `pending_deletion` jest oznaczeniem intencji. `perma_delete` po potwierdzeniu
  fizycznie usuwa wszystkie rewizje ze storage, potem referencje katalogu.
  Blokada `FOR UPDATE` i sprawdzenie powiązań produktu poprzedzają storage;
  używane zdjęcie zwraca `inUse`. Blokada chroni też równoległe przypięcie pliku.
- Storage i PostgreSQL nie są jedną transakcją. Przy częściowym usunięciu katalog
  pozostaje do ponowienia, a UI uprzedza, że część wersji mogła już zniknąć.
- Popup sesji ma outline z semantycznym wypełnieniem na hover. `buttonMotion`
  w `ui/basic/styles.ts` centralizuje czas przejścia przycisków i wyszukiwarki;
  zwijanie wyszukiwarki animuje również opacity/visibility.

## Weryfikacja i ograniczenia

- PASS: 107 testów Web (76 + 31), TypeScript, ESLint i 18 testów narzędzi.
- PASS: test dwóch jednorazowych baz dla migracji/seed 9 ról oraz wcześniejszy
  test Product UUIDv7, Decimal, opcjonalnego zdjęcia, FK i blokady konkurencji.
- PASS: integracja Better Auth/OIDC/PKCE, sesji, limitów odnowienia, CSRF,
  hard logout, replay i ochrony nowej/przedłużonej sesji. Bazy testowe usunięto.
- Edge z rzeczywistym Keycloak: zapis produktu bez zdjęcia i ze zdjęciem,
  dokładna cena, bezpośredni URL create, panel 320 px, loader 4 wierszy/100 ms,
  paginacja, globalne wyszukiwanie i filtry bez nowego dokumentu. Obniżenie ADMIN
  do USER podczas sesji zablokowało następny odczyt danych.
- Start tego testu OIDC wykonano przez `/api/v1/auth/sign-in/social`; konto
  logowano emailem. Przy próbach startu przez przycisk/Server Action wystąpił
  sporadyczny 502, którego przyczyny nie ustalono. Nie traktować testu jako
  dowodu poprawności każdego wariantu rozpoczęcia logowania.
- Pomocniczy test Edge i Playwright są w ignorowanym `.local/ui-check/`, nie w CI.
  Jednorazowe konta, produkty, obrazy i ich lokalne referencje posprzątano.
- Nie wykonywano produkcyjnego build na aktywnym katalogu dev `.next`, deployu
  QA/PROD ani commit/push. Dokumentacja `docs/` może opisywać starszy wariant
  paginacji, statusów i autoryzacji; bieżący kod i ta notatka są punktem wznowienia.
