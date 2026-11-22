import "server-only";
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
import { summarizeWithPllum } from "./udip/pllum.ts";
import { readUdipScan } from "./udip/worker.ts";

interface AiSummaryFields {
  nodeType?: "CASE" | "LEGAL_ACT" | "DEPARTMENT" | "EXTERNAL_AUTHORITY";
  externalKey?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  routedTo?: string[];
  isExternalAuthority?: boolean;
  externalAuthority?: string | null;
  legalBasis?: string[];
}

export interface UploadedKbResult extends KbIngestResult {
  fileName: string;
  extractionMode: "digital_text" | "ocr_fallback" | "plain_text";
  aiMode: "pllum_json" | "ollama_json" | "deterministic_fallback";
  extractedCharCount: number;
}

const CASE_SIGNATURE_RE = /BKS\.IV\.1431\.\d+\.\d{4}/i;

function stripBoilerplate(text: string): string {
  return text
    .replace(/WNIOSEK\s+O\s+UDOSTĘPNIENIE\s+INFORMACJI\s+PUBLICZNEJ/gi, "")
    .replace(/Na\s+podstawie\s+art\.\s*2\s+ust\.\s*1\s+ustawy[^.]+\./gi, "")
    .replace(/dzien\/miesiac\/rok|dzień\/miesiąc\/rok/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function heuristicSummaryFromText(
  fileName: string,
  text: string,
  institutions: readonly LlmInstitutionJsonEntry[],
) {
  const clean = stripBoilerplate(text);
  const sigMatch =
    fileName.match(CASE_SIGNATURE_RE)?.[0] ?? text.match(CASE_SIGNATURE_RE)?.[0] ?? null;

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

  const firstSentence = clean.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 360);
  const title = sigMatch
    ? `${sigMatch.toUpperCase()} — ${firstSentence.slice(0, 72)}`
    : fileName.replace(/\.(pdf|docx|txt)$/i, "").slice(0, 90);

  const tags = extractAutoTags(clean);
  const externalHint = detectExternalAuthorityHint(`${fileName} ${clean}`);

  const matchedDepts = institutions
    .filter(
      inst =>
        inst.kind === "INTERNAL_DEPARTMENT"
        && (lower.includes(inst.name.toLowerCase())
          || inst.competencies.some(c => c.length >= 5 && lower.includes(c.toLowerCase()))),
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
    summary: firstSentence || clean.slice(0, 320) || fileName,
    tags,
    routedTo: externalHint ? [] : matchedDepts,
    isExternalAuthority: Boolean(externalHint),
    externalAuthority: externalHint?.name ?? null,
    legalBasis,
  };
}

function stringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

async function resolveOllamaModel(baseUrl: string): Promise<string> {
  if (process.env.PYWORKER_OCR_VLM_MODEL) return process.env.PYWORKER_OCR_VLM_MODEL;
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = (await res.json()) as { models?: { name?: string }[] };
      const first = data.models?.find(m => typeof m.name === "string")?.name;
      if (first) return first;
    }
  } catch {
    // fallback to default model name
  }
  return "gemma3:4b";
}

async function summarizeWithLocalOllama(
  fileName: string,
  extractedText: string,
  institutions: readonly LlmInstitutionJsonEntry[],
): Promise<AiSummaryFields | null> {
  const baseUrl = (process.env.PYWORKER_OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = await resolveOllamaModel(baseUrl);

  const snippet = stripBoilerplate(extractedText).slice(0, 1200);
  const deptNames = institutions
    .filter(i => i.kind !== "OUR_BKS_OFFICE")
    .map(i => `${i.name}${i.kind === "EXTERNAL_INSTITUTION" ? " [ZEWNĘTRZNA]" : ""}`)
    .join("; ");

  const prompt = [
    "Streść polski dokument UDIP do JSON dla Bazy Wiedzy UM Bydgoszczy.",
    'Zwróć TYLKO JSON: {"nodeType":"CASE","title":"krótki tytuł","summary":"1-2 zdania merytoryczne","tags":["4-5 krótkich polskich tagów tematycznych w mianowniku, bez art./ust./dat"],"routedTo":["pasujące wydziały z listy"],"isExternalAuthority":false,"externalAuthority":null,"legalBasis":["Art. 13 ust. 1 UDIP"]}',
    `Jednostki: ${deptNames}`,
    `Plik: ${fileName}`,
    `Treść: ${snippet}`,
  ].join("\n");

  try {
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        prompt,
        format: "json",
        stream: false,
        options: { temperature: 0.1, num_predict: 240 },
      }),
    });
    if (!response.ok) {
      console.warn("kb_ollama_http_error", response.status);
      return null;
    }
    const payload = (await response.json()) as { response?: string };
    if (!payload.response) return null;
    const cleanedJson = payload.response
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const obj = JSON.parse(cleanedJson) as Record<string, unknown>;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

    const validTypes = new Set(["CASE", "LEGAL_ACT", "DEPARTMENT", "EXTERNAL_AUTHORITY"]);
    return {
      nodeType:
        typeof obj.nodeType === "string" && validTypes.has(obj.nodeType)
          ? (obj.nodeType as AiSummaryFields["nodeType"])
          : undefined,
      externalKey: typeof obj.externalKey === "string" && obj.externalKey.trim().length >= 3
        ? obj.externalKey.trim().slice(0, 80)
        : undefined,
      title: typeof obj.title === "string" && obj.title.trim().length >= 3
        ? obj.title.trim().slice(0, 255)
        : undefined,
      summary: typeof obj.summary === "string" && obj.summary.trim().length >= 10
        ? obj.summary.trim().slice(0, 1200)
        : undefined,
      tags: stringArray(obj.tags, 8),
      routedTo: stringArray(obj.routedTo, 6),
      isExternalAuthority: typeof obj.isExternalAuthority === "boolean" ? obj.isExternalAuthority : undefined,
      externalAuthority:
        typeof obj.externalAuthority === "string" && obj.externalAuthority.trim()
          ? obj.externalAuthority.trim().slice(0, 255)
          : null,
      legalBasis: stringArray(obj.legalBasis, 6),
    };
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

  // 1. Prefer PLLuM 4B if configured (UDIP_PLLUM_URL), 2. otherwise use local Ollama (gemma3/gemma4)
  let aiMode: "pllum_json" | "ollama_json" | "deterministic_fallback" = "deterministic_fallback";
  let ai: AiSummaryFields | null = null;

  const pllum = await summarizeWithPllum(extractedText).catch(() => null);
  if (pllum) {
    aiMode = "pllum_json";
    ai = {
      title: pllum.topic,
      summary: pllum.questions.map(q => q.text).join(" ").slice(0, 600) || pllum.topic,
      tags: pllum.tags,
    };
  } else {
    const ollama = await summarizeWithLocalOllama(fileName, extractedText, institutions);
    if (ollama) {
      aiMode = "ollama_json";
      ai = ollama;
    }
  }

  // Always preserve official BKS signature if present in fileName/text
  const sigFromDoc = fileName.match(CASE_SIGNATURE_RE)?.[0]?.toUpperCase();
  const rawTags = ai?.tags && ai.tags.length > 0 ? ai.tags : heuristic.tags;
  const cleanTags = extractAutoTags("", rawTags);

  const merged = {
    nodeType: (ai?.nodeType as KbNodeType | undefined) ?? heuristic.nodeType,
    externalKey: sigFromDoc || ai?.externalKey || heuristic.externalKey,
    title: ai?.title ? (sigFromDoc ? `${sigFromDoc} — ${ai.title}` : ai.title) : heuristic.title,
    summary: ai?.summary || heuristic.summary,
    tags: cleanTags.length > 0 ? cleanTags : heuristic.tags,
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
    aiMode,
    extractedCharCount: extractedText.length,
  };
}
