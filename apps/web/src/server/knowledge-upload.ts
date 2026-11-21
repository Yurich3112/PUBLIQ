import "server-only";
import { z } from "zod";
import {
  detectExternalAuthorityHint,
  exportInstitutionRegistryForLlm,
  extractAutoTags,
  ingestKnowledgeNode,
  KbNodeType,
  type KbIngestResult,
  type LlmInstitutionJsonEntry,
} from "@modulon-poc/database";
import { getDatabase } from "./database.ts";
import { extractUdipText } from "./udip/extraction.ts";
import { readUdipScan } from "./udip/worker.ts";

const aiSummarySchema = z.object({
  nodeType: z.enum(["CASE", "LEGAL_ACT", "DEPARTMENT", "EXTERNAL_AUTHORITY"]).optional(),
  externalKey: z.string().trim().min(2).max(80).optional(),
  title: z.string().trim().min(2).max(255).optional(),
  summary: z.string().trim().min(5).max(1200).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  routedTo: z.array(z.string().trim().min(1).max(200)).max(8).optional(),
  isExternalAuthority: z.boolean().optional(),
  externalAuthority: z.string().trim().max(255).nullable().optional(),
  legalBasis: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
});

export interface UploadedKbResult extends KbIngestResult {
  fileName: string;
  extractionMode: "digital_text" | "ocr_fallback" | "plain_text";
  aiMode: "ollama_json" | "deterministic_fallback";
  extractedCharCount: number;
}

const CASE_SIGNATURE_RE = /BKS\.IV\.1431\.\d+\.\d{4}/i;

function heuristicSummaryFromText(
  fileName: string,
  text: string,
  institutions: readonly LlmInstitutionJsonEntry[],
) {
  const clean = text.replace(/\s+/g, " ").trim();
  const sigMatch =
    fileName.match(CASE_SIGNATURE_RE)?.[0] ?? clean.match(CASE_SIGNATURE_RE)?.[0] ?? null;

  const lower = `${fileName} ${clean}`.toLowerCase();
  const isLegalAct =
    !sigMatch
    && (lower.includes("zarządzenie")
      || lower.includes("ustawa")
      || lower.includes("rozporządzenie")
      || lower.includes("uchwała"));

  const nodeType: KbNodeType = isLegalAct ? KbNodeType.LEGAL_ACT : KbNodeType.CASE;
  const stem = fileName
    .replace(/\.(pdf|docx|txt)$/i, "")
    .replace(/[^a-zA-Z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż._-]+/g, "_")
    .slice(0, 48);
  const externalKey = sigMatch
    ? sigMatch.toUpperCase()
    : isLegalAct
      ? `LAW:${stem.toUpperCase()}`
      : `DOC:${stem.toUpperCase()}`;

  const firstSentence = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 420);
  const title = sigMatch
    ? `${sigMatch.toUpperCase()} — ${firstSentence.slice(0, 90)}`
    : fileName.replace(/\.(pdf|docx|txt)$/i, "").slice(0, 120);

  const tags = extractAutoTags(`${fileName} ${clean}`);
  const externalHint = detectExternalAuthorityHint(`${fileName} ${clean}`);

  const matchedDepts = institutions
    .filter(
      inst =>
        inst.kind === "INTERNAL_DEPARTMENT"
        && (lower.includes(inst.name.toLowerCase())
          || inst.competencies.some(c => c.length >= 4 && lower.includes(c.toLowerCase()))),
    )
    .map(inst => inst.name)
    .slice(0, 3);

  const legalBasis: string[] = [];
  if (lower.includes("art. 4 ust. 3") || externalHint) legalBasis.push("Art. 4 ust. 3 UDIP");
  if (lower.includes("art. 13 ust. 2") || lower.includes("kwerend")) legalBasis.push("Art. 13 ust. 2 UDIP");
  if (lower.includes("535/2024")) legalBasis.push("Zarządzenie nr 535/2024");
  if (legalBasis.length === 0) legalBasis.push("Art. 13 ust. 1 UDIP");

  return {
    nodeType,
    externalKey,
    title,
    summary: firstSentence || clean.slice(0, 360) || fileName,
    tags,
    routedTo: externalHint ? [] : matchedDepts,
    isExternalAuthority: Boolean(externalHint),
    externalAuthority: externalHint?.name ?? null,
    legalBasis,
  };
}

async function summarizeWithLocalOllama(
  fileName: string,
  extractedText: string,
  institutions: readonly LlmInstitutionJsonEntry[],
): Promise<z.infer<typeof aiSummarySchema> | null> {
  const baseUrl = process.env.PYWORKER_OLLAMA_URL || "http://127.0.0.1:11434";
  const model = process.env.PYWORKER_OCR_VLM_MODEL || "gemma3:4b";

  // Keep prompt compact (~1200 tokens) so local 4B model responds in a few seconds
  const snippet = extractedText.replace(/\s+/g, " ").trim().slice(0, 3500);
  const compactInst = institutions
    .map(i => `${i.code} (${i.kind}): ${i.name} [${i.competencies.slice(0, 5).join(", ")}]`)
    .join("\n");

  const prompt = [
    "Jesteś asystentem BKS Urzędu Miasta Bydgoszczy (UDIP). Z poniższego dokumentu przygotuj zwięzły rekord JSON do Bazy Wiedzy.",
    "Zwróć WYŁĄCZNIE poprawny obiekt JSON o polach:",
    '{"nodeType":"CASE"|"LEGAL_ACT","externalKey":"sygnatura np. BKS.IV.1431.X.2026 lub LAW:...","title":"krótki tytuł po polsku","summary":"2 zdania streszczenia (~40-80 słów) po polsku","tags":["tag1","tag2","tag3","tag4","tag5"],"routedTo":["dokładna nazwa wydziału z listy jeśli dotyczy"],"isExternalAuthority":false,"externalAuthority":null,"legalBasis":["Art. 13 ust. 1 UDIP"]}',
    "",
    "Lista jednostek UM Bydgoszcz i instytucji zewnętrznych:",
    compactInst,
    "",
    `Nazwa pliku: ${fileName}`,
    `Treść dokumentu:\n${snippet}`,
  ].join("\n");

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        prompt,
        format: "json",
        stream: false,
        options: { temperature: 0.1, num_predict: 400 },
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { response?: string };
    if (!payload.response) return null;
    const rawJson: unknown = JSON.parse(payload.response);
    const parsed = aiSummarySchema.safeParse(rawJson);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function processAdminKnowledgeUpload(params: {
  fileName: string;
  mediaType: string;
  bytes: Uint8Array<ArrayBuffer>;
  actorUuid?: string | null;
}): Promise<UploadedKbResult> {
  const { fileName, mediaType, bytes, actorUuid } = params;

  let extractedText: string | null = null;
  let extractionMode: "digital_text" | "ocr_fallback" | "plain_text" = "digital_text";

  if (mediaType === "text/plain" || fileName.toLowerCase().endsWith(".txt")) {
    extractedText = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    extractionMode = "plain_text";
  } else {
    const media =
      mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      || fileName.toLowerCase().endsWith(".docx")
        ? ("application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const)
        : ("application/pdf" as const);

    extractedText = await extractUdipText({
      fileName,
      mediaType: media,
      content: bytes,
    });

    if (!extractedText && media === "application/pdf") {
      const ocr = await readUdipScan(bytes);
      if (ocr?.text) {
        extractedText = ocr.text;
        extractionMode = "ocr_fallback";
      }
    }
  }

  if (!extractedText || extractedText.trim().length < 5) {
    throw new Error("Could not extract readable text from uploaded document");
  }

  const db = getDatabase();
  const institutions = await exportInstitutionRegistryForLlm(db);
  const heuristic = heuristicSummaryFromText(fileName, extractedText, institutions);
  const ai = await summarizeWithLocalOllama(fileName, extractedText, institutions);

  const merged = {
    nodeType: (ai?.nodeType as KbNodeType | undefined) ?? heuristic.nodeType,
    externalKey: ai?.externalKey || heuristic.externalKey,
    title: ai?.title || heuristic.title,
    summary: ai?.summary || heuristic.summary,
    tags: ai?.tags && ai.tags.length > 0 ? ai.tags : heuristic.tags,
    routedTo: ai?.routedTo && ai.routedTo.length > 0 ? ai.routedTo : heuristic.routedTo,
    isExternalAuthority: ai?.isExternalAuthority ?? heuristic.isExternalAuthority,
    externalAuthority: ai?.externalAuthority ?? heuristic.externalAuthority,
    legalBasis: ai?.legalBasis && ai.legalBasis.length > 0 ? ai.legalBasis : heuristic.legalBasis,
    templateFile: fileName,
    actorUuid: actorUuid ?? null,
  };

  const ingested = await ingestKnowledgeNode(db, merged);
  return {
    ...ingested,
    fileName,
    extractionMode,
    aiMode: ai ? "ollama_json" : "deterministic_fallback",
    extractedCharCount: extractedText.length,
  };
}
