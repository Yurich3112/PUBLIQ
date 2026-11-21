import {
  verifiedOcrPayloadSchema,
  type OcrAnalysisResponse,
  type OcrWord,
  type VerifiedOcrPayload,
} from "../../../schemas/ocr.ts";

export type ConfidenceTier = "stamp" | "verified" | "high" | "medium" | "low";

export const LOW_CONFIDENCE_THRESHOLD = 0.8;
export const VERY_LOW_CONFIDENCE_THRESHOLD = 0.5;

export function getWordTier(
  word: OcrWord,
  editedWords: Readonly<Record<string, string>>,
): ConfidenceTier {
  if (word.zone === "stamp") return "stamp";
  if (Object.prototype.hasOwnProperty.call(editedWords, word.id)) return "verified";
  if (word.confidence >= LOW_CONFIDENCE_THRESHOLD) return "high";
  if (word.confidence >= VERY_LOW_CONFIDENCE_THRESHOLD) return "medium";
  return "low";
}

export function isWordUncertain(
  word: OcrWord,
  editedWords: Readonly<Record<string, string>>,
): boolean {
  const tier = getWordTier(word, editedWords);
  return tier === "medium" || tier === "low";
}

export function getWordDisplayText(
  word: OcrWord,
  editedWords: Readonly<Record<string, string>>,
): string {
  return Object.prototype.hasOwnProperty.call(editedWords, word.id)
    ? editedWords[word.id]
    : word.text;
}

export function assembleVerifiedBodyText(
  analysis: OcrAnalysisResponse,
  editedWords: Readonly<Record<string, string>>,
): string {
  const lines: string[] = [];
  for (const page of analysis.pages) {
    const wordMap = new Map(page.words.map(word => [word.id, word]));
    for (const line of page.lines) {
      if (line.zone === "stamp") continue;
      const tokens = line.word_ids
        .map(id => wordMap.get(id))
        .filter((word): word is OcrWord => Boolean(word))
        .map(word => getWordDisplayText(word, editedWords).trim())
        .filter(Boolean);
      if (tokens.length) lines.push(tokens.join(" "));
    }
  }
  return lines.join("\n").trim();
}

export function findNextUncertainWordId(
  analysis: OcrAnalysisResponse,
  editedWords: Readonly<Record<string, string>>,
  currentWordId: string | null,
): { pageIndex: number; wordId: string } | null {
  const uncertain: { pageIndex: number; wordId: string }[] = [];
  for (const page of analysis.pages) {
    for (const word of page.words) {
      if (isWordUncertain(word, editedWords)) {
        uncertain.push({ pageIndex: page.page_index, wordId: word.id });
      }
    }
  }
  if (!uncertain.length) return null;
  if (!currentWordId) return uncertain[0];
  const currentIdx = uncertain.findIndex(item => item.wordId === currentWordId);
  return currentIdx === -1 ? uncertain[0] : uncertain[(currentIdx + 1) % uncertain.length];
}

export function buildVerifiedPayload({
  analysis,
  fileName,
  editedWords,
  receivedDate,
  registryNumber,
  now = new Date(),
}: {
  analysis: OcrAnalysisResponse;
  fileName: string;
  editedWords: Readonly<Record<string, string>>;
  receivedDate: string | null;
  registryNumber: string | null;
  now?: Date;
}): VerifiedOcrPayload {
  const bodyWords = analysis.pages.flatMap(page => page.words.filter(word => word.zone !== "stamp"));
  const verifiedText = assembleVerifiedBodyText(analysis, editedWords) || analysis.assembled_text.trim();
  const normalizedDate = receivedDate && /^\d{4}-\d{2}-\d{2}$/.test(receivedDate) ? receivedDate : null;
  const normalizedRegistry = registryNumber?.trim() || null;

  return verifiedOcrPayloadSchema.parse({
    fileName,
    pageCount: analysis.page_count,
    verifiedText,
    receivedDate: normalizedDate,
    registryNumber: normalizedRegistry,
    editedWordCount: Object.keys(editedWords).length,
    totalWordCount: bodyWords.length,
    averageConfidence: analysis.legibility.average_confidence,
    verifiedAt: now.toISOString(),
  });
}

export function buildClarificationNoticeDraft({
  fileName,
  receivedDate,
  registryNumber,
  todayIso = new Date().toISOString().slice(0, 10),
}: {
  fileName: string;
  receivedDate: string | null;
  registryNumber: string | null;
  todayIso?: string;
}): string {
  const intakeRef = registryNumber ? `nr wpływu ${registryNumber}` : `plik „${fileName}”`;
  const intakeDate = receivedDate || todayIso;

  return [
    "URZĄD MIASTA BYDGOSZCZY",
    "Biuro Komunikacji Społecznej",
    "85-102 Bydgoszcz, ul. Jezuicka 1",
    "e-mail: bks@um.bydgoszcz.pl",
    "",
    `Bydgoszcz, dnia ${todayIso} r.`,
    "Znak sprawy: BKS.IV.1431.___.2026",
    "",
    "WEZWANIE DO UZUPEŁNIENIA / DOPRECYZOWANIA WNIOSKU",
    "O UDOSTĘPNIENIE INFORMACJI PUBLICZNEJ",
    "",
    "Szanowna Pani / Szanowny Panie,",
    "",
    `w związku ze złożonym w dniu ${intakeDate} wnioskiem (${intakeRef}) o udostępnienie informacji publicznej,`,
    "uprzejmie informuję, że treść nadesłanego pisma (skanu/rękopisu) jest w części nieczytelna",
    "i nie pozwala na jednoznaczne ustalenie zakresu żądanej informacji publicznej.",
    "",
    "Działając na podstawie ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej",
    "oraz art. 64 § 2 Kodeksu postępowania administracyjnego, proszę o uzupełnienie i doprecyzowanie",
    "treści wniosku (w formie czytelnej lub elektronicznej) w terminie 7 dni od dnia otrzymania",
    "niniejszego wezwania.",
    "",
    "Nieuzupełnienie braków we wskazanym terminie spowoduje pozostawienie wniosku bez rozpoznania.",
    "",
    "Z wyrazami szacunku,",
    "Biuro Komunikacji Społecznej",
    "Urząd Miasta Bydgoszczy",
  ].join("\n");
}
