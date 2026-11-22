# Archiwum Finalnych Odpowiedzi BKS (`data/final_responses/`)

Ten katalog przechowuje zanonimizowane, zatwierdzone odpowiedzi finalne (`.pdf` i `.txt`) cytowane przez rekordy JSON w Bazie Wiedzy (`KbNode.structuredJson.template_file` oraz `ResponseTemplateArchive.fileName`).

## Jak wykorzystuje go Asystent UDIP + Gemma 4
1. Gdy wpływa nowy wniosek UDIP, Baza Wiedzy dopasowuje najbliższą sprawę archiwalną (np. `BKS.IV.1431.293.2025` dla zapytań o bezdomne zwierzęta).
2. Endpoint `POST /api/v1/cases/[uuid]/draft` wczytuje z tego folderu dokładną treść wcześniejszej odpowiedzi finalnej (`.txt` lub `ResponseTemplateArchive.extractedBodyText`) i przekazuje ją razem z bieżącym wnioskiem oraz odpowiedziami wydziałów do lokalnego modelu **Gemma 4 E4B / E2B** (Ollama · Apache 2.0) jako wzorzec stylu, struktury i podstaw prawnych.
3. Każda nowa sprawa zamknięta w aplikacji jako **Status E** (po akceptacji Przełożonego i trwałej anonimizacji PII) automatycznie dopisuje swój zanonimizowany plik `Odpowiedź - <sygnatura>.anonymised.txt` do tego katalogu.
