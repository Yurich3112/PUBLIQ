---
brief: Trzy akcje popupu wygasającej sesji, obsługa wygaśnięcia podczas wylogowania i aktualna dokumentacja zasad kodowania.
tags: [memory, handoff, sessions, popup, ui, documentation]
---

# Popup sesji i dokumentacja

Zapis na wyraźne żądanie użytkownika. Uzupełnia wcześniejszą notatkę
`20261111-142522-admin-files-ui.md` o późniejsze zmiany.

## Przyjęte zachowanie popupu sesji

- `SessionWarning` ma trzy przyciski od lewej na desktopie. „Wyloguj teraz”
  używa `tone="error"`, „Rozumiem” domyślnego stylu, „Przedłuż sesję”
  `tone="warning"`. PL/EN mają odpowiadające etykiety.
- Przyciski mają równe szerokości. Na wąskim ekranie układają się pionowo.
  Opcjonalny `Popup.actionsClassName` nadpisuje układ wewnętrznej siatki akcji.
- „Wyloguj teraz” wywołuje istniejący `hardSignOut()`, „Rozumiem” zamyka
  ostrzeżenie przez `dismiss()`, a żółty przycisk wywołuje `renew()`.
  Przedłużenie pozostaje widoczne i wyłączone po osiągnięciu limitu
  oraz w podglądzie wygasłej sesji.
- `pending || logoutPending` blokuje wszystkie akcje oraz zamykanie popupu.
  Właściwy przycisk pokazuje throbber. Błąd wylogowania daje komunikat
  i pozwala ponowić próbę.
- Popup pozostaje zamontowany podczas żądania wylogowania, również gdy
  w tym czasie upłynie termin sesji. Hook odracza automatyczne wylogowanie
  podczas `logoutPending`. Po błędzie ręcznego żądania i przy wygasłej
  sesji uruchamia automatyczne wylogowanie przez blokujący progress popup.
  Sprawdzono brak równoległego zdublowanego żądania w tym przebiegu.

## Dokumentacja

- Dodano `docs/0307-admin-files.md` z katalogiem, rewizjami, tagami,
  uploadem, statusami, tabelą i granicami implementacji.
- Dodano `docs/0308-code-conventions.md` z zasadami czytelności,
  podziału server/client, konfiguracji, walidacji, cookies, współbieżności,
  wspólnego UI, stanów asynchronicznych i weryfikacji.
- Zaktualizowano routery oraz istniejące opisy struktury Web, Prisma,
  UI, administracji, kontroli dostępu i wylogowania.
- Dokumentacja zachowuje angielską konwencję repo i nagłówki `brief`/`tags`.
  Taksonomia, lokalne linki i Markdown przeszły checkery Scribe.
- Dalsze szczegóły bieżącej implementacji sprawdzaj w kodzie.
  Ostatnia zmiana trzech przycisków jest zapisana w tej notatce;
  rozdział UI może wymagać uzupełnienia tego szczegółu przy kolejnej
  aktualizacji dokumentacji.

## Wyniki sprawdzeń

- TypeScript i lint przeszły po końcowej poprawce obsługi wygaśnięcia.
- Przeszły 8 testów podstawowego UI oraz 21 testów preferencji/katalogów.
- Build Next.js przeszedł po dodaniu trzech przycisków i responsywnych stylów.
  Dwie późniejsze poprawki utrzymania popupu i efektu `logoutPending`
  zweryfikowano przez TypeScript/lint i test interakcji w przeglądarce.
- Izolowane testy Edge obejmowały PL/EN, szerokość 320px i desktop,
  kolejność/kolory, równe szerokości, zamykanie przez „Rozumiem”,
  przedłużanie, limit, blokady, błąd wylogowania i wygasły podgląd.
- Osobny test z rzeczywistym hookiem lifecycle i symulowanym API
  sprawdził wygaśnięcie podczas ręcznego wylogowania oraz przejście
  do automatycznego wylogowania po błędzie. Odpowiedzi auth były
  symulowane. Ten test potwierdza zachowanie UI i hooka w tym przebiegu.

## Pliki do wznowienia

- `apps/web/src/ui/components/session-warning.tsx`
- `apps/web/src/ui/components/use-session-lifecycle.ts`
- `apps/web/src/ui/components/popup.tsx`
- `apps/web/src/schemas/ui.ts`
- `apps/web/messages/pl/common.json` i `apps/web/messages/en/common.json`

Stan plików, migracje DEV, sortowanie bieżącej strony, checkboxy i krótki
postęp zapisu opisuje wcześniejsza notatka z tego dnia. Ta poprawka dotyczyła
prezentacji sesji i lifecycle. Podczas tej poprawki nie wykonywano deploy QA/PROD.
