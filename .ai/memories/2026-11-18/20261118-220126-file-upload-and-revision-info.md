---
brief: Panel wysyłania plików, postęp transferu w powiadomieniach i panel Info starszej wersji.
tags: [memory, files, revisions, upload, notifications]
---

# Upload i panel Info wersji pliku

- „Dodaj plik” rozwija formularz pod paskiem tabeli na wzór filtrów.
  Przycisk jest obrysowany po zwinięciu i wypełniony kolorem obramowania po
  otwarciu. Escape zamyka formularz i oddaje fokus. Po udanej wysyłce formularz
  się zwija, a tabela odświeża. Błąd zostawia formularz do ponowienia.
- Nowe pliki i rewizje używają `POST /api/v1/admin/files/upload`. Endpoint
  sprawdza origin i uprawnienia administratora, przyjmuje maksymalnie 8 MiB
  oraz dopuszcza jeden aktywny upload na konto w ramach instancji Web.
  Przeglądarka raportuje przesłane bajty, procent i szacowany czas w panelu
  powiadomień. Po 100% ten sam wpis pokazuje zapisywanie, a następnie wynik.
- Strzałka obok numeru rozwija starsze wersje pod wierszem pliku.
  „Nadpisz plik” w akcjach wiersza publikuje nową wersję ze starszymi kopiami
  zachowanymi w S3. Starszy wiersz ma ikony przywracania, pobierania i Info.
  Info po prawej otwiera `PushAside` z numerem wersji, rozmiarem, datą
  i podglądem wskazanej rewizji. Treść podglądu pozostaje w panelu, a po
  zamknięciu fokus wraca do ikony.
- Ostatnia weryfikacja: 162 testy Web, kontrole linków, taksonomii i Markdown
  RepoRoute oraz 22 scenariusze przeglądarkowe w DEV po restarcie.
  Wcześniejsze próby przekierowały testowego administratora do „Brak dostępu”.
  Scenariusze potwierdziły postęp na wolnym łączu, odmowę równoległego uploadu,
  podgląd starszej wersji w panelu, przywrócenie oraz usunięcie wszystkich kopii.
- Kontrakt i procedura: [administracja plikami](../../../docs/0307-admin-files.md)
  oraz [weryfikacja niezawodności](../../../docs/0404-reliability-verification.md).
  Bazowy model i usuwanie rewizji opisuje [wcześniejsza notatka](20261118-204644-file-revisions.md).
