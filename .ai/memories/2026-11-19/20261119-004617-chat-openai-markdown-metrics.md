---
brief: Integracja czatu z OpenAI, wersje promptu, Markdown i metryki odpowiedzi.
tags: [memory, chat, openai, markdown, prisma]
---

# Czat OpenAI w Modulon PoC

- Zalogowany użytkownik korzysta z lokalizowanego `/chat`. Historia otwiera się
  w prawym panelu, właściciel może zmienić nazwę rozmowy, a załączniki w PostgreSQL
  są dostępne wyłącznie właścicielowi rozmowy.
- Przeglądarka wysyła wiadomości do `POST /api/v1/chat`. Next.js weryfikuje sesję
  i właściciela rozmowy, wywołuje OpenAI Responses API i przesyła fragmenty jako
  NDJSON. DEV pobiera konfigurację z `apps/web/.env`, QA z `infra/local/.env.qa`.
  `OPENAI_API_KEY` jest zmienną serwerową, a tryby mogą używać tego samego modelu.
  Instant wysyła `reasoning.effort: none`, Thinking `medium` i `summary: auto`.
- Administrator zarządza wersjami w **Chat → System prompt** pod `/chat/settings`.
  Zapis tworzy nową wersję, aktywacja przełącza pojedynczy aktywny prompt,
  a podgląd pozwala odczytać wcześniejsze wersje. Prompt z seeda wymaga języka
  użytkownika i zwięzłości. Wariant przedstawiający się jako „MODULON AI” został
  podany jako tekst do wklejenia w panelu. Seed nadal zawiera wersję językową.
- Odpowiedź jest renderowana jako GitHub Flavored Markdown w strumieniu i historii.
  Opcjonalne podsumowanie rozumowania widać w bieżącej sesji czatu. Surowy HTML
  i obrazy osadzone przez Markdown są blokowane.
- Wiadomości wyświetlają godzinę. Licznik na żywo mierzy oczekiwanie po stronie
  przeglądarki. Szczegóły zapisanej odpowiedzi pokazują model, wersję promptu,
  parametry rozumowania, czas do pierwszego fragmentu, czas całkowity i tokeny
  raportowane przez OpenAI. Czas do pierwszego fragmentu obejmuje rozumowanie
  modelu i opóźnienia API. Migracja `20261119010000_chat_generation_metrics`
  dodaje opcjonalne `chat_message.generation`; starsze odpowiedzi zachowują
  dotychczasowe informacje.
- W DEV zastosowano migrację i przebudowano Prisma. Przeszły testy Web,
  typecheck i lint. Test w przeglądarce z prawdziwym OpenAI potwierdził
  strumień, renderowanie Markdown oraz ponowny odczyt odpowiedzi i metryk
  z historii. Szerszy test niezawodności zatrzymał się wcześniej na kroku
  edycji produktu, poza ścieżką czatu.
- Zaplanowane pozostają lokalne modele CPU w pyworkerze, bramka PII,
  integracja długich zadań AI z kolejką i limity użycia na poziomie wdrożenia.
  Kontrakt i konfiguracja są w [architekturze AI](../../../docs/0207-ai-execution-architecture.md#chat-stream-and-response-details).
