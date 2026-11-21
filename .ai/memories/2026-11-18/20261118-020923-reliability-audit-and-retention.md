---
brief: Audyt niezawodności zakończony; historia, odzyskiwanie danych i testy wdrożone, kosz po 30 dniach pozostaje backlogiem.
tags: [memory, reliability, auth, storage, backup, testing]
---

# Audyt niezawodności i decyzje o retencji

## Wdrożone

- Poprawki audytu 1–18 i scenariusze testowe z punktu 20 opisuje
  [raport weryfikacji](../../../docs/0404-reliability-verification.md).
  Naprawiono ochronę zdjęcia przez `FileVersion`, Escape najwyższego popupu,
  limity SQL/monitoringu, ścieżki CA, test infrastruktury, paginację, reset
  podglądu i odpowiedź 415 dla nieobsługiwanych formatów oraz nieaktualne teksty.
- Usuwanie produktu wymaga `expectedUpdatedAt`. Automatyczne wylogowanie
  porównuje sprawdzoną wersję sesji, chroni nowsze odnowienie i respektuje
  wyłączenie tożsamości. Utrata ciasteczka nie powoduje pętli wylogowania.
- Windows: zamykanie konsumenta kolejki i Pythona ma kanały sterowania,
  oczekiwanie na aktywną pracę oraz ograniczony czas wymuszonego zakończenia.
  Sprzątanie procesów testowych obsługuje również proces już zakończony.
- Opcjonalny bridge kolejki jest wyłączony w szablonach. Znany przewidywalny
  placeholder jest odrzucany; migracja może zastąpić wyłącznie ten znany wzorzec
  osobnym losowym sekretem, zachowując własne prywatne wartości.
- Migracja `20261117000100_change_history`: transakcyjne triggery historii
  produktów, plików i wersji, autor/czas/operacja/przed/po. Administrator ma
  prywatny paginowany endpoint i leniwie pobierane panele historii.
- Dodano `pnpm storage:report`, kontrolowane `storage:cleanup`,
  `backup:create` i `backup:restore`. Raport jest odczytowy; sprzątanie wymaga
  przeglądu, hasha raportu, wieku obiektów i ponownej weryfikacji referencji
  oraz tożsamości S3. Backup offline obejmuje trzy bazy PostgreSQL i całe dane
  SeaweedFS, opcjonalnie konsolę; restore tworzy nowe woluminy.
  Procedura i ograniczenia: [odzyskiwanie danych](../../../docs/0403-data-recovery.md).

## Wynik zakończonego przebiegu

- `pnpm check`: 280 testów, typy i lint — PASS. Osobno przeszły integracja auth,
  pełne logowanie przeglądarkowe przez Keycloak, konflikt dwóch administratorów,
  popupy, wygaśnięcie i wyścigi sesji, podglądy oraz zmniejszenie liczby stron.
- Przeszły rzeczywiste testy reload/drain Pythona, odzyskania zadania po zabiciu
  workera, izolowanego backup/restore wszystkich trzech baz i obiektu S3 oraz
  odrzucenia warunkowego DELETE z niewłaściwym ETag przez lokalny SeaweedFS.
- Końcowy raport DEV: zero brakujących obiektów, rozbieżności rozmiaru,
  osieroconych obiektów i niepowiązanych plików. Na koniec audytu DEV działał,
  pięć kontenerów infrastruktury było healthy, migracja historii była zastosowana
  w DEV, a kopia jego woluminów pozostała w ignorowanym katalogu backupów.
- To zapis poprzedniego przebiegu, nie gwarancja bieżącego stanu. Browser test
  symuluje 503 endpointu podglądu; nie zatrzymuje współdzielonego storage.
  Historia UI ma kontrolowane odpowiedzi API, a triggery osobną integrację SQL.
  Fizyczny restore infrastruktury nie zastępuje akceptacji biznesowej Web po
  odtworzeniu. Nie wykonywano migracji PROD, wdrożenia, commita ani push.

## Decyzje i dalsza praca

- Użytkownik odłożył proces biznesowy: `pending_deletion` ma oznaczać kosz,
  a trwałe usuwanie ma następować po 30 dniach. To **nie jest wdrożone**;
  zapisano zadanie w [backlogu](../../../docs/9999-backlog.md).
  Automatyczna archiwizacja także czeka na ustalenie polityki.
- Nie uruchamiać produkcyjnego buildu Web równolegle z DEV używającym tego
  samego `.next`. Podczas audytu nieaktualny cache powodował przeładowania,
  błędy chunków i blokadę logowania. Pomogło zatrzymanie DEV, usunięcie wyłącznie
  `apps/web/.next` i ponowne `pnpm dev`; dane Docker pozostały zachowane.
- Zachować wcześniejsze lokalne zmiany strony głównej, `/about`, `/about/team`,
  awatara i animacji kart. Dane zespołu są w `apps/web/src/config/team.ts`.
- Kierunek AI pozostaje planem: Web backend → OpenAI, małe modele CPU w Pythonie,
  dłuższe zadania przez kolejkę. Brak wdrożonego klienta OpenAI/modeli/vLLM;
  szczegóły w [architekturze AI](../../../docs/0207-ai-execution-architecture.md).
