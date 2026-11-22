import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { readFinalResponseReferenceText } from "@/server/udip/final-responses-store";
import { localModelUrl, postLocalModel } from "@/server/udip/local-model-http";

const bodySchema = z.object({
  requestText: z.string().trim().min(1).max(20_000),
  selectedDepartments: z.array(z.string().trim().min(1).max(200)).max(20),
  overrideExternal: z.boolean(),
  ownDepartment: z.boolean().optional().default(false),
  receivedDate: z.string().trim().max(40).nullable().optional(),
  registryNumber: z.string().trim().max(80).nullable().optional(),
  referenceCaseNumber: z.string().trim().max(120).nullable().optional(),
  referenceText: z.string().trim().max(20_000).nullable().optional(),
  externalAuthorityName: z.string().trim().max(300).nullable().optional(),
  externalLegalBasis: z.string().trim().max(500).nullable().optional(),
});

const completionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().max(100_000) }),
    }),
  ).min(1),
});

function buildDeterministicDraft(data: z.infer<typeof bodySchema>, refText: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  if (data.ownDepartment) {
    if (refText) {
      return [
        "URZĄD MIASTA BYDGOSZCZY",
        "Biuro Komunikacji Społecznej",
        `Bydgoszcz, dnia ${today}`,
        "",
        refText,
      ].join("\n");
    }
    return [
      "URZĄD MIASTA BYDGOSZCZY",
      "Biuro Komunikacji Społecznej",
      `Bydgoszcz, dnia ${today}`,
      "",
      "Szanowny Wnioskodawco,",
      "",
      "odpowiadając na złożony wniosek o udostępnienie informacji publicznej w zakresie kompetencji Biura Komunikacji Społecznej Urzędu Miasta Bydgoszczy, przedstawiam poniżej wnioskowane informacje:",
      "",
      "Ad 1. [Uzupełnić bezpośrednią odpowiedź merytoryczną BKS]",
      "",
      "Łączę wyrazy szacunku,",
      "Biuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy",
    ].join("\n");
  }

  if (!data.overrideExternal && data.externalAuthorityName) {
    return [
      "URZĄD MIASTA BYDGOSZCZY",
      "Biuro Komunikacji Społecznej",
      `Bydgoszcz, dnia ${today}`,
      "",
      "Szanowny Wnioskodawco,",
      "",
      "odpowiadając na złożony wniosek o udostępnienie informacji publicznej, uprzejmie informuję, iż Urząd Miasta Bydgoszczy nie jest dysponentem wnioskowanych danych.",
      data.externalLegalBasis || "Zgodnie z art. 4 ust. 3 ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej obowiązane do udostępnienia informacji publicznej są wyłącznie podmioty będące w posiadaniu tych informacji.",
      "",
      `W związku z powyższym właściwym adresatem wniosku jest: ${data.externalAuthorityName}.`,
      "",
      "Łączę wyrazy szacunku,",
      "Biuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy",
    ].join("\n");
  }

  const depts = data.selectedDepartments;
  if (depts.length > 0) {
    return [
      "URZĄD MIASTA BYDGOSZCZY — ZAPYTANIE WEWNĘTRZNE BKS (UDIP)",
      `Data wpływu: ${data.receivedDate || today} · Nr wpływu (Kancelaria): ${data.registryNumber || "—"}`,
      `Do: ${depts.join(", ")}`,
      "",
      "Szanowni Państwo,",
      "",
      "w związku z wpływem wniosku o udostępnienie informacji publicznej (Zarządzenie nr 535/2024 Prezydenta Miasta Bydgoszczy) proszę o pilne przekazanie danych merytorycznych w zakresie kompetencji Państwa Wydziału:",
      "",
      `Zakres wniosku:\n${data.requestText.slice(0, 1200)}`,
      "",
      "Prosimy o zwrotną odpowiedź (e-mail lub załącznik PDF/DOCX) umożliwiającą zachowanie ustawowego 14-dniowego terminu (Art. 13 ust. 1 UDIP).",
      "",
      "Z poważaniem,",
      "Biuro Komunikacji Społecznej (Administrator Informacji Publicznej)",
    ].join("\n");
  }

  return [
    "URZĄD MIASTA BYDGOSZCZY",
    "Biuro Komunikacji Społecznej",
    `Bydgoszcz, dnia ${today}`,
    "",
    "Szanowny Wnioskodawco,",
    "",
    "w odpowiedzi na złożony wniosek o udostępnienie informacji publicznej informujemy, że sprawa została przekazana do analizy merytorycznej w Urzędzie Miasta Bydgoszczy.",
    "",
    "Łączę wyrazy szacunku,",
    "Biuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy",
  ].join("\n");
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) {
    return jsonNoStore({ status: "denied" }, 403);
  }
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed") return jsonNoStore({ status: "denied" }, 401);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonNoStore({ status: "invalid" }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return jsonNoStore({ status: "invalid" }, 400);

  const data = parsed.data;
  const diskRef = data.referenceCaseNumber
    ? await readFinalResponseReferenceText(data.referenceCaseNumber)
    : null;
  const priorFinalResponse = diskRef?.text ?? data.referenceText ?? null;

  const base = localModelUrl(
    process.env.UDIP_PLLUM_URL ?? process.env.UDIP_LLM_URL ?? "http://127.0.0.1:11434",
  );
  const timeout = Number(process.env.UDIP_PLLUM_TIMEOUT_MS ?? "45000");

  if (base && Number.isInteger(timeout) && timeout >= 500 && timeout <= 120_000) {
    let installed: string[] = [];
    try {
      const res = await fetch(new URL("/api/tags", base), { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const json = (await res.json()) as { models?: { name?: string }[] };
        installed = (json.models ?? []).map(m => m.name?.trim()).filter((n): n is string => Boolean(n));
      }
    } catch { /* ignore */ }

    const primaryModel = process.env.UDIP_PLLUM_MODEL ?? process.env.UDIP_LLM_MODEL ?? "gemma4:e4b";
    const fallbackModel = process.env.UDIP_LLM_FALLBACK_MODEL ?? "gemma4:e2b";
    const candidates = [...new Set([primaryModel, fallbackModel, ...installed.filter(m => m.toLowerCase().includes("gemma")), ...installed])];

    const isDepartmentQuery = !data.ownDepartment && data.selectedDepartments.length > 0;
    const systemPrompt = isDepartmentQuery
      ? [
          "Jesteś asystentem urzędnika Biura Komunikacji Społecznej (BKS) Urzędu Miasta Bydgoszczy.",
          "ZADANIE: Napisz KRÓTKIE, SŁUŻBOWE ZAPYTANIE WEWNĘTRZNE (e-mail) od BKS DO wskazanych wydziałów merytorycznych (selectedDepartments) z prośbą o przekazanie danych potrzebnych do odpowiedzi na wniosek UDIP.",
          "ZAKAZ: NIE pisz odpowiedzi do wnioskodawcy! Nie udawaj, że masz już dane ani załączniki. Adresatem pisma są WYŁĄCZNIE wydziały z pola selectedDepartments (np. 'Szanowni Państwo, prosimy o przekazanie danych...').",
          "Uwzględnij datę wpływu, numer wpływu (Kancelaria), zwięzły zakres pytań z requestText oraz przypomnienie o 14-dniowym terminie z Art. 13 ust. 1 UDIP i Zarządzenia nr 535/2024.",
          "Zwróć wyłącznie gotową treść wiadomości po polsku, bez komentarzy ani znaczników markdown.",
        ].join("\n")
      : [
          "Jesteś asystentem urzędnika Biura Komunikacji Społecznej Urzędu Miasta Bydgoszczy (UDIP).",
          data.ownDepartment
            ? "Sprawa należy bezpośrednio do kompetencji naszego działu (BKS) — NIE wysyłamy zapytań do innych wydziałów. Napisz gotowy projekt bezpośredniej odpowiedzi do wnioskodawcy. Jeśli podano priorFinalResponse (wcześniejszą odpowiedź z Bazy Wiedzy), wzoruj się na jej stylu, strukturze i podstawach prawnych."
            : "Napisz zwięzłe, oficjalne pismo BKS UM Bydgoszczy o braku dysponenta (Art. 4 ust. 3 UDIP) wskazujące właściwą instytucję zewnętrzną z pola externalAuthorityName.",
          "Zwróć wyłącznie treść gotowego pisma po polsku, bez komentarzy ani znaczników markdown.",
        ].join("\n");

    const llmInput = isDepartmentQuery
      ? {
          toDepartments: data.selectedDepartments,
          receivedDate: data.receivedDate,
          registryNumber: data.registryNumber,
          requestText: data.requestText,
        }
      : { ...data, priorFinalResponse };

    for (const model of candidates) {
      const result = await postLocalModel(
        new URL("/v1/chat/completions", base),
        {
          model,
          temperature: 0.1,
          stream: false,
          max_tokens: 1200,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(llmInput) },
          ],
        },
        completionSchema,
        { timeout, maxBytes: 512_000 },
      );
      const generated = result?.choices[0]?.message.content.trim();
      if (generated) {
        return jsonNoStore({ status: "ok", draft: generated, usedModel: model, fallbackUsed: false });
      }
    }
  }

  return jsonNoStore({
    status: "ok",
    draft: buildDeterministicDraft(data, priorFinalResponse),
    usedModel: null,
    fallbackUsed: true,
  });
}
