import { z } from "zod";
import { LOGGED_ACCESS } from "@/schemas/access";
import { getAccess } from "@/server/auth/access";
import { getAuthConfig } from "@/server/auth/config";
import { jsonNoStore } from "@/server/http";
import { matchAgainstKnowledgeGraph } from "@/server/knowledge-graph";
import { loadUdipCaseById } from "@/server/udip-cases";
import { readFinalResponseReferenceText } from "@/server/udip/final-responses-store";
import { localModelUrl, postLocalModel } from "@/server/udip/local-model-http";

const requestSchema = z.object({
  templateKind: z.enum(["MERIT", "KWERENDA", "CLARIFICATION", "EXTERNAL"]).optional(),
});

const completionSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string().max(100_000) }),
    }),
  ).min(1),
});

async function discoverInstalledLocalModels(base: URL): Promise<string[]> {
  try {
    const res = await fetch(new URL("/api/tags", base), { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return [];
    const json = (await res.json()) as { models?: { name?: string }[] };
    return (json.models ?? [])
      .map(m => m.name?.trim())
      .filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  if (request.headers.get("origin") !== getAuthConfig().AUTH_BASE_URL) {
    return jsonNoStore({ status: "denied" }, 403);
  }
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status === "unavailable") return jsonNoStore({ status: "unavailable" }, 503);
  if (access.status !== "allowed") return jsonNoStore({ status: "denied" }, 401);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonNoStore({ status: "invalid" }, 400);

  const { uuid } = await context.params;
  const item = await loadUdipCaseById(uuid);
  if (!item) return jsonNoStore({ status: "notFound" }, 404);

  // 1. Resolve closest prior final response from data/final_responses/ or ResponseTemplateArchive
  let referenceCaseNumber: string | null = item.matchedCaseNumber ?? null;
  let referenceFileName: string | null = null;
  let referenceText: string | null = null;

  if (referenceCaseNumber) {
    const fileRef = await readFinalResponseReferenceText(referenceCaseNumber);
    if (fileRef) {
      referenceFileName = fileRef.fileName;
      referenceText = fileRef.text;
    }
  }

  if (!referenceText) {
    try {
      const match = await matchAgainstKnowledgeGraph({
        title: item.caseNumber,
        summary: item.verifiedRequestText || item.subject,
        limit: 3,
      });
      if (match.topMatch?.externalKey && !referenceCaseNumber) {
        referenceCaseNumber = match.topMatch.externalKey;
      }
      if (match.referenceTemplate) {
        referenceFileName = match.referenceTemplate.fileName;
        const diskRef = await readFinalResponseReferenceText(match.referenceTemplate.fileName);
        referenceText = diskRef?.text ?? match.referenceTemplate.extractedBodyText;
      }
    } catch {
      // Non-fatal: proceed without archived reference
    }
  }

  // 2. Call local Gemma 4 E4B -> E2B via Ollama with current request, dept replies, and prior final response
  const base = localModelUrl(
    process.env.UDIP_PLLUM_URL ?? process.env.UDIP_LLM_URL ?? "http://127.0.0.1:11434",
  );
  const timeout = Number(process.env.UDIP_PLLUM_TIMEOUT_MS ?? "75000");
  const primaryModel = process.env.UDIP_PLLUM_MODEL ?? process.env.UDIP_LLM_MODEL ?? "gemma4:e4b";
  const fallbackModel = process.env.UDIP_LLM_FALLBACK_MODEL ?? "gemma4:e2b";
  const installed = base ? await discoverInstalledLocalModels(base) : [];
  const preferred = [primaryModel, fallbackModel, ...installed.filter(m => m.toLowerCase().includes("gemma")), ...installed];
  const candidates = [...new Set(preferred)];

  const deptEvidence = item.departmentQueries
    .filter(d => d.status === "REPLIED" && d.replyText?.trim())
    .map(d => ({ department: d.departmentName, reply: d.replyText!.trim() }));

  if (base && Number.isInteger(timeout) && timeout >= 500 && timeout <= 120_000) {
    const systemPrompt = [
      "Jesteś asystentem urzędnika Biura Komunikacji Społecznej Urzędu Miasta Bydgoszczy (Zarządzenie nr 535/2024).",
      "Przygotuj oficjalny, zwięzły projekt pisma odpowiedzi na wniosek UDIP po polsku.",
      "ZASADY:",
      "1. Korzystaj WYŁĄCZNIE z faktów, liczb i dat z pola departmentReplies (odpowiedzi wydziałów). Nie wymyślaj kwot ani faktów.",
      "2. Jeżeli podano priorFinalResponse (wcześniejsza zanonimizowana odpowiedź finalna BKS na podobne zapytanie), wzoruj się na jej stylu, strukturze (Szanowny Panie / Ad 1 / podstawa prawna / podpis BKS), ale podstaw wyłącznie bieżące dane.",
      "3. Jeśli brakuje odpowiedzi wydziału na któreś pytanie, wyraźnie zaznacz [OCZEKUJE NA DANE Z WYDZIAŁU].",
      "4. Zwróć wyłącznie gotową treść pisma bez komentarzy markdown.",
    ].join("\n");

    const userPayload = {
      caseNumber: item.caseNumber,
      receivedDate: item.receivedDate.toISOString().slice(0, 10),
      applicantName: item.applicantName,
      templateKind: parsed.data.templateKind ?? "MERIT",
      requestText: item.verifiedRequestText || item.subject,
      departmentReplies: deptEvidence,
      externalAuthorityName: item.externalAuthorityName,
      priorFinalResponse: referenceText
        ? { caseNumber: referenceCaseNumber, fileName: referenceFileName, text: referenceText }
        : null,
    };

    for (const model of candidates) {
      const result = await postLocalModel(
        new URL("/v1/chat/completions", base),
        {
          model,
          temperature: 0.1,
          stream: false,
          max_tokens: 1800,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
        },
        completionSchema,
        { timeout, maxBytes: 512_000 },
      );
      const generated = result?.choices[0]?.message.content.trim();
      if (generated) {
        return jsonNoStore({
          status: "ok",
          draft: generated,
          usedModel: model,
          referenceCaseNumber,
          referenceFileName,
          fallbackUsed: false,
        });
      }
    }
  }

  // 3. Deterministic graceful fallback when Ollama / Gemma 4 is offline
  return jsonNoStore({
    status: "ok",
    draft: null,
    usedModel: null,
    referenceCaseNumber,
    referenceFileName,
    fallbackUsed: true,
  });
}
