import "server-only";
import type { z } from "zod";
import type { udipDraftSuggestionSchema, udipSummarySuggestionSchema, UdipDraftPoint } from "../../schemas/udip.ts";
import type { UdipActor } from "./access.ts";
import { readUdipDraft } from "./drafts.ts";
import { draftWithPllum, summarizeWithPllum } from "./pllum.ts";
import { listPublishedUdipKnowledge, rankUdipPrecedents, readUdipManualSummary } from "./recommendations.ts";
import { readConfirmedUdipSources } from "./redaction-workflow.ts";

export async function suggestUdipSummary(actor: UdipActor, caseUuid: string, source: z.infer<typeof udipSummarySuggestionSchema>) {
  const confirmed = await readConfirmedUdipSources(actor, caseUuid, "request", [source]);
  if (confirmed.status !== "ok") return { status: confirmed.status };
  const text = confirmed.sources.get(source.documentId);
  if (!text?.trim()) return { status: "conflict" as const };
  const original = await readUdipManualSummary(actor, caseUuid);
  if (original.status !== "ok") return original;
  const summary = await summarizeWithPllum(text);
  if (!summary) return { status: "unavailable" as const };
  const current = await readConfirmedUdipSources(actor, caseUuid, "request", [source]);
  if (current.status !== "ok") return { status: current.status };
  return { status: "ok" as const, expectedVersion: original.version, summary };
}

function numericFacts(text: string) {
  return [...text.normalize("NFKC").matchAll(/\d+(?:[ ,.\u00a0\u202f]\d+)*/g)].map(match => match[0].replace(/\s/g, ""));
}

export async function suggestUdipDraft(actor: UdipActor, caseUuid: string, input: z.infer<typeof udipDraftSuggestionSchema>) {
  const current = await readUdipManualSummary(actor, caseUuid);
  if (current.status !== "ok") return current;
  if (!current.summary || current.version !== input.summaryVersion) return { status: "conflict" as const };
  const { summary: workingSummary } = current;
  const draft = await readUdipDraft(actor, caseUuid);
  if ((draft?.version ?? 0) !== input.expectedVersion) return { status: "conflict" as const };
  const selections = new Map(input.points.map(point => [point.questionId, point.sources]));
  if (input.points.some(point => !workingSummary.questions.some(question => question.id === point.questionId))) {
    return { status: "invalid" as const };
  }
  const requested = input.points.flatMap(point => point.sources);
  const confirmed = await readConfirmedUdipSources(actor, caseUuid, "departmentReply", requested);
  if (confirmed.status !== "ok") return { status: confirmed.status };
  const intake = await readConfirmedUdipSources(actor, caseUuid, "request", [input.intake]);
  if (intake.status !== "ok") return { status: intake.status };
  const request = intake.sources.get(input.intake.documentId)?.trim();
  if (!request) return { status: "conflict" as const };
  const sourcesPerPoint = workingSummary.questions.map(question => {
    const ids = [...new Set((selections.get(question.id) ?? []).map(source => source.documentId))];
    return ids.flatMap(id => {
      const text = confirmed.sources.get(id)?.trim();
      return text ? [{ id, text }] : [];
    });
  });
  const referenceCount = sourcesPerPoint.reduce((total, point) => total + point.length, 0);
  const excerptSize = Math.min(1800, Math.floor(12_000 / Math.max(1, referenceCount)));
  const points: UdipDraftPoint[] = workingSummary.questions.map((question, index) => {
    const sources = sourcesPerPoint[index];
    return { question: question.text, status: sources.length ? "supported" : "missing",
      text: sources.length ? sources.map(source => source.text.slice(0, excerptSize)).join("\n\n") : "Brak materiału",
      sourceDocumentIds: sources.map(source => source.id) };
  });
  const modelPoints = points.flatMap((point, index) => point.status === "supported" ? [{
    index, question: point.question, evidence: sourcesPerPoint[index].map(source => source.text.slice(0, excerptSize)),
  }] : []);
  let mode: "pllum" | "template" = "template";
  if (modelPoints.length) {
    const precedents = await listPublishedUdipKnowledge();
    const scores = rankUdipPrecedents(workingSummary, precedents)
      .flatMap(question => question.similarCases).sort((a, b) => b.score - a.score);
    const ids = [...new Set(scores.map(match => match.source.id))].slice(0, 3);
    const styles = ids.flatMap(id => {
      const topic = precedents.find(record => record.id === id)?.data.summary.topic;
      return topic ? [{ topic: topic.replace(/\p{N}+/gu, "").slice(0, 160) }] : [];
    });
    const result = await draftWithPllum(request.slice(0, 4000), modelPoints, styles);
    if (result && result.points.length === modelPoints.length && modelPoints.every(point => {
      const matches = result.points.filter(proposal => proposal.index === point.index);
      const allowed = new Set(point.evidence.flatMap(numericFacts));
      return matches.length === 1 && numericFacts(matches[0].text).every(value => allowed.has(value));
    })) {
      for (const point of result.points) points[point.index].text = point.text;
      mode = "pllum";
    }
  }
  const latest = await readConfirmedUdipSources(actor, caseUuid, "departmentReply", requested);
  if (latest.status !== "ok") return { status: latest.status };
  const latestIntake = await readConfirmedUdipSources(actor, caseUuid, "request", [input.intake]);
  if (latestIntake.status !== "ok") return { status: latestIntake.status };
  const [summary, latestDraft] = await Promise.all([readUdipManualSummary(actor, caseUuid), readUdipDraft(actor, caseUuid)]);
  if (summary.status !== "ok") return summary;
  if (summary.version !== input.summaryVersion || (latestDraft?.version ?? 0) !== input.expectedVersion) return { status: "conflict" as const };
  return { status: "ok" as const, expectedVersion: input.expectedVersion, mode, points };
}
