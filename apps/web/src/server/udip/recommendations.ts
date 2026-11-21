import "server-only";
import type { z } from "zod";
import { udipKnowledgeDataSchema, udipStructuredSummarySchema, type udipManualSummaryInputSchema } from "../../schemas/udip.ts";
import { getDatabase } from "../database.ts";
import type { UdipActor } from "./access.ts";
import { caseScope, lockUdipCase } from "./scope.ts";

type Summary = z.infer<typeof udipStructuredSummarySchema>;
type Question = Summary["questions"][number];
type Knowledge = z.infer<typeof udipKnowledgeDataSchema>;
type Period = Summary["period"];
export type UdipPrecedent = { id: string; title: string; sourceName: string; version: number; data: Knowledge };

const stopWords = new Set(["czy", "jak", "jaki", "jaka", "oraz", "dla", "się", "sie", "jest", "wniosek", "proszę", "prosze", "dotyczy", "ile", "lub"]);
export function udipWords(text: string) {
  const normalized = text.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replaceAll("ł", "l");
  return new Set((normalized.match(/\p{L}{2,}/gu) ?? []).filter(word => !stopWords.has(word)));
}

function similarity(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const word of left) if (right.has(word)) overlap++;
  return 2 * overlap / (left.size + right.size);
}

function periodDifference(requested: Period, precedent: Period) {
  return requested && precedent && (requested.from !== precedent.from || requested.to !== precedent.to)
    ? { requested, precedent } : null;
}

export function rankUdipPrecedents(summary: Summary, precedents: readonly UdipPrecedent[]) {
  const context = udipWords([summary.topic, ...summary.tags, ...summary.dataSought].join(" "));
  const indexed = precedents.map(record => {
    const archive = record.data.summary;
    return { record, archive, topicScore: similarity(context, udipWords([archive.topic, ...archive.tags, ...archive.dataSought].join(" "))),
      questions: archive.questions.map(question => ({ question, terms: udipWords([question.text, ...question.dataSought].join(" ")) })) };
  });
  return summary.questions.map(question => {
    const key = udipWords([question.text, ...question.dataSought].join(" "));
    const ranked = indexed.flatMap(({ record, archive, topicScore, questions }) => {
      let best: { question: Question; score: number; difference: ReturnType<typeof periodDifference> } | undefined;
      for (const { question: previous, terms } of questions) {
        const questionScore = similarity(key, terms);
        if (!questionScore) continue;
        const difference = periodDifference(question.period ?? summary.period, previous.period ?? archive.period);
        const score = Math.round((questionScore * 0.8 + topicScore * 0.2) * 100);
        if (!best || score > best.score || (score === best.score && best.difference && !difference)) best = { question: previous, score, difference };
      }
      if (!best || best.score < 25) return [];
      const questionId = best.question.id;
      const units = record.data.questionUnits.find(item => item.questionId === questionId)?.units ?? record.data.units;
      const source = { id: record.id, title: record.title, name: record.sourceName, version: record.version,
        caseSignature: record.data.caseSignature ?? null, questionId: best.question.id };
      const reason = topicScore ? "Zbieżne pytanie i zakres tematyczny." : "Zbieżne sformułowanie pytania.";
      return [{ source, score: best.score, reason, periodDifference: best.difference, units }];
    }).sort((a, b) => b.score - a.score || Number(!!a.periodDifference) - Number(!!b.periodDifference) || a.source.id.localeCompare(b.source.id));

    const similarCases = ranked.slice(0, 5).map(({ source, score, reason, periodDifference }) => ({ source, score, reason, periodDifference }));
    const suggestedUnits = new Map<string, { unit: Knowledge["units"][number]; source: typeof ranked[number]["source"];
      reason: string; periodDifference: ReturnType<typeof periodDifference> }>();
    for (const match of ranked) {
      if (match.score < 45 || suggestedUnits.size >= 5) break;
      for (const unit of match.units) {
        const key = `${unit.kind}:${unit.departmentCode}`;
        if (!suggestedUnits.has(key) && suggestedUnits.size < 5) suggestedUnits.set(key, {
          unit, source: match.source, reason: match.reason, periodDifference: match.periodDifference,
        });
      }
    }
    return { questionId: question.id, similarCases, suggestedUnits: [...suggestedUnits.values()], requiresManualSelection: !suggestedUnits.size };
  });
}

export async function listPublishedUdipKnowledge(excludeGroup?: string): Promise<UdipPrecedent[]> {
  const rows = await getDatabase().udipKnowledgeRecord.findMany({
    where: { approvedAt: { not: null }, supersededAt: null, ...(excludeGroup ? { groupUuid: { not: excludeGroup } } : {}) },
    select: { uuid: true, title: true, sourceName: true, version: true, data: true },
  });
  return rows.flatMap(({ uuid: id, data, ...record }) => {
    const parsed = udipKnowledgeDataSchema.safeParse(data);
    return parsed.success ? [{ ...record, id, data: parsed.data }] : [];
  });
}

export async function readUdipManualSummary(actor: UdipActor, caseUuid: string) {
  const row = await getDatabase().udipCase.findFirst({ where: { ...caseScope(actor), uuid: caseUuid }, select: {
    manualSummary: { select: { version: true, data: true } },
  } });
  if (!row) return { status: "missing" } as const;
  return { status: "ok" as const, version: row.manualSummary?.version ?? 0,
    summary: row.manualSummary ? udipStructuredSummarySchema.parse(row.manualSummary.data) : null };
}

export async function saveUdipManualSummary(actor: UdipActor, caseUuid: string, input: z.infer<typeof udipManualSummaryInputSchema>) {
  return getDatabase().$transaction(async tx => {
    if (!await lockUdipCase(tx, actor, caseUuid)) return { status: "missing" } as const;
    const current = await tx.udipCaseManualSummary.findUnique({ where: { caseUuid }, select: { version: true } });
    const currentVersion = current?.version ?? 0;
    if (input.expectedVersion !== currentVersion) return { status: "conflict" as const, currentVersion };
    const data = { data: input.summary, version: currentVersion + 1, updatedByUuid: actor.id };
    await tx.udipCaseManualSummary.upsert({ where: { caseUuid }, create: { ...data, caseUuid }, update: data });
    return { status: "ok" as const, version: data.version, summary: input.summary };
  });
}

export async function readUdipRecommendations(actor: UdipActor, caseUuid: string) {
  const current = await readUdipManualSummary(actor, caseUuid);
  if (current.status !== "ok") return current;
  if (!current.summary) return { status: "conflict" } as const;
  const precedents = await listPublishedUdipKnowledge();
  return { status: "ok" as const, summaryVersion: current.version, questions: rankUdipPrecedents(current.summary, precedents) };
}
