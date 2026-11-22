"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Building,
  CalendarPlus,
  CheckCircle,
  ClipboardCheck,
  ExclamationTriangleFill,
  FileEarmarkPdf,
  LightningChargeFill,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Link } from "@/i18n/navigation";
import type { VerifiedOcrPayload } from "@/schemas/ocr";
import { Button, Input, Throbber } from "@/ui/basic";

export interface KnowledgeMatchResponse {
  status: "ok";
  path: "TWIN_CASE_MATCH" | "AI_FALLBACK_REQUIRED";
  scenario:
    | "OUR_OFFICE_NEW"
    | "OUR_OFFICE_SIMILAR_FOUND"
    | "EXTERNAL_INSTITUTION"
    | "OTHER_INTERNAL_DEPARTMENT";
  threshold: number;
  latencyMs: number;
  queryTags: string[];
  topMatch: {
    externalKey: string;
    title: string;
    summary: string;
    clusterName: string;
    score: number;
    sharedTags: string[];
    reason: string;
  } | null;
  recommendedDepartments: string[];
  externalAuthorityHint: {
    externalKey: string;
    name: string;
    matchedTerms: string[];
    legalBasis: string;
  } | null;
  referenceTemplate: {
    caseNumber: string;
    fileName: string;
    templateType: string;
    summary: string;
    extractedBodyText: string;
  } | null;
  institutionsForLlm: {
    code: string;
    kind: "OUR_BKS_OFFICE" | "INTERNAL_DEPARTMENT" | "EXTERNAL_INSTITUTION";
    name: string;
    email: string | null;
  }[];
}

interface CreatedCaseSummary {
  uuid: string;
  caseNumber: string;
  deadlineDate: string;
  processStatus: string;
  isMultiDepartment: boolean;
}

export function KnowledgeRecommendationCard({
  verifiedPayload,
  matching,
  matchError,
  matchResult,
}: {
  verifiedPayload: VerifiedOcrPayload;
  matching: boolean;
  matchError: boolean;
  matchResult: KnowledgeMatchResponse | null;
}) {
  const t = useTranslations("ocr");
  const defaultSubject = verifiedPayload.verifiedText.replace(/\s+/g, " ").trim().slice(0, 240);
  const [applicantName, setApplicantName] = useState("Wnioskodawca (skan OCR)");
  const [subject, setSubject] = useState(defaultSubject || verifiedPayload.fileName);
  const [selectedDepts, setSelectedDepts] = useState<string[]>(
    () => matchResult?.recommendedDepartments ?? [],
  );
  const [showTemplateText, setShowTemplateText] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [savingCase, setSavingCase] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [createdCase, setCreatedCase] = useState<CreatedCaseSummary | null>(null);

  const internalDepartments =
    matchResult?.institutionsForLlm.filter(i => i.kind === "INTERNAL_DEPARTMENT") ?? [];

  function toggleDepartment(name: string) {
    setSelectedDepts(prev =>
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name],
    );
  }

  async function handleCopyTemplate() {
    if (!matchResult?.referenceTemplate) return;
    await navigator.clipboard.writeText(matchResult.referenceTemplate.extractedBodyText);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  }

  async function handleSaveToCalendar() {
    setSavingCase(true);
    setSaveError(false);
    try {
      const isExternal = matchResult?.scenario === "EXTERNAL_INSTITUTION";
      const routingType = isExternal ? "EXTERNAL_AUTHORITY" : "INTERNAL_DEPARTMENTS";
      const response = await fetch(API_ROUTES.cases, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          applicantName: applicantName.trim() || "Wnioskodawca (skan OCR)",
          subject: subject.trim() || verifiedPayload.fileName,
          registryNumber: verifiedPayload.registryNumber,
          receivedDate: verifiedPayload.receivedDate ?? undefined,
          sourceMode: "handwritten_scan",
          verifiedRequestText: verifiedPayload.verifiedText,
          ocrConfidence: verifiedPayload.averageConfidence,
          matchedCaseNumber: matchResult?.topMatch?.externalKey ?? null,
          matchSimilarity: matchResult?.topMatch?.score ?? null,
          routingType,
          externalAuthorityName: matchResult?.externalAuthorityHint?.name ?? null,
          letterTemplateType: isExternal ? "EXTERNAL_REDIRECT" : "MERIT_RESPONSE",
          draftResponseText: matchResult?.referenceTemplate?.extractedBodyText ?? null,
          departments: selectedDepts.map(name => ({
            departmentName: name,
            departmentEmail:
              internalDepartments.find(d => d.name === name)?.email ?? null,
          })),
        }),
      });
      if (!response.ok) {
        setSaveError(true);
        return;
      }
      const json = (await response.json()) as {
        status?: string;
        case?: CreatedCaseSummary;
      };
      if (json.status === "ok" && json.case) {
        setCreatedCase(json.case);
      } else {
        setSaveError(true);
      }
    } catch {
      setSaveError(true);
    } finally {
      setSavingCase(false);
    }
  }

  const scenarioTone =
    matchResult?.scenario === "EXTERNAL_INSTITUTION"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100"
      : matchResult?.scenario === "OUR_OFFICE_SIMILAR_FOUND"
        ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
        : matchResult?.scenario === "OTHER_INTERNAL_DEPARTMENT"
          ? "border-blue-500/50 bg-blue-500/10 text-blue-950 dark:text-blue-100"
          : "border-border bg-muted/40 text-foreground";

  return (
    <section
      aria-label={t("recommendation.title")}
      className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-surface p-3.5"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <LightningChargeFill aria-hidden="true" className="size-4 shrink-0 text-amber-500" />
          <h2 className="text-xs font-semibold">{t("recommendation.title")}</h2>
        </div>
        {matchResult && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {t("recommendation.latency", { ms: matchResult.latencyMs })}
          </span>
        )}
      </div>

      {matching && (
        <div className="flex flex-1 items-center gap-3 py-4 text-sm text-muted-foreground">
          <Throbber label={t("recommendation.matching")} />
          <span>{t("recommendation.matching")}</span>
        </div>
      )}

      {!matching && matchError && (
        <p role="alert" className="py-3 text-xs text-red-700 dark:text-red-300">
          {t("recommendation.matchFailed")}
        </p>
      )}

      {!matching && matchResult && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          {/* Scrollable scenario + vertical departments list */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
            {/* 4-Case Scenario Banner */}
            <div className={`rounded-lg border px-3 py-2 text-xs ${scenarioTone}`}>
              <p className="font-semibold">
                {t(`recommendation.scenarios.${matchResult.scenario}.title`)}
              </p>
              <p className="mt-0.5 opacity-90">
                {t(`recommendation.scenarios.${matchResult.scenario}.hint`)}
              </p>
            </div>

            {/* Twin Case Match from Baza Wiedzy */}
            {matchResult.topMatch && (
              <div className="space-y-1.5 rounded-lg border border-border bg-background p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    {t("recommendation.twinCase")}:{" "}
                    <code className="font-mono">{matchResult.topMatch.externalKey}</code>
                  </span>
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                    {Math.round(matchResult.topMatch.score * 100)}% {t("recommendation.similarity")}
                  </span>
                </div>
                <p className="text-muted-foreground">{matchResult.topMatch.summary}</p>
                <p className="text-[11px] text-muted-foreground">
                  {matchResult.topMatch.clusterName} · {matchResult.topMatch.reason}
                </p>
              </div>
            )}

            {/* External Authority Hint (ZUS / ZDMiKP / WKZ — draft only, sent outside app) */}
            {matchResult.externalAuthorityHint && (
              <div className="space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-amber-950 dark:text-amber-100">
                  <ExclamationTriangleFill aria-hidden="true" className="size-3.5 text-amber-600" />
                  <span>{matchResult.externalAuthorityHint.name}</span>
                </div>
                <p className="text-amber-900/90 dark:text-amber-200/90">
                  {matchResult.externalAuthorityHint.legalBasis}
                </p>
              </div>
            )}

            {/* Archived Reference PDF Template from ResponseTemplateArchive */}
            {matchResult.referenceTemplate && (
              <div className="space-y-2 rounded-lg border border-border bg-background p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground">
                    <FileEarmarkPdf aria-hidden="true" className="size-4 text-red-600" />
                    <span>{matchResult.referenceTemplate.fileName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      tone="ghost"
                      onClick={() => setShowTemplateText(v => !v)}
                    >
                      {showTemplateText
                        ? t("recommendation.hideTemplate")
                        : t("recommendation.previewTemplate")}
                    </Button>
                    <Button
                      size="sm"
                      tone="main-outline"
                      onClick={() => void handleCopyTemplate()}
                    >
                      <ClipboardCheck aria-hidden="true" className="size-3.5" />
                      {copiedTemplate
                        ? t("verified.copied")
                        : t("recommendation.copyTemplate")}
                    </Button>
                  </div>
                </div>
                <p className="text-muted-foreground">{matchResult.referenceTemplate.summary}</p>
                {showTemplateText && (
                  <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 font-mono text-[11px]">
                    {matchResult.referenceTemplate.extractedBodyText}
                  </pre>
                )}
              </div>
            )}

            {/* Select / Confirm UM Bydgoszcz Departments — crisp vertical list */}
            {internalDepartments.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Building aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    <span>{t("recommendation.departmentsLabel")}</span>
                  </span>
                  {selectedDepts.length > 0 && (
                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                      {selectedDepts.length}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {internalDepartments.map(dept => {
                    const checked = selectedDepts.includes(dept.name);
                    return (
                      <label
                        key={dept.code}
                        className={`flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                          checked
                            ? "border-blue-600 bg-blue-500/12 font-medium text-blue-950 dark:text-blue-100"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleDepartment(dept.name)}
                          className="size-3.5 shrink-0 accent-blue-600"
                        />
                        <span className="truncate">{dept.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Pinned bottom form: Wnioskodawca + Przedmiot + Save to Calendar */}
          <div className="shrink-0 space-y-2.5 border-t border-border pt-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {t("recommendation.applicantLabel")}
              </span>
              <Input
                type="text"
                value={applicantName}
                onChange={event => setApplicantName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">
                {t("recommendation.subjectLabel")}
              </span>
              <Input
                type="text"
                value={subject}
                onChange={event => setSubject(event.target.value)}
              />
            </label>

            {saveError && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                {t("recommendation.saveFailed")}
              </p>
            )}

            {createdCase ? (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-600/40 bg-emerald-500/12 px-3 py-2 text-xs text-emerald-950 dark:text-emerald-100"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle aria-hidden="true" className="size-4 text-emerald-600" />
                  <span>
                    {t("recommendation.savedSuccess", {
                      caseNumber: createdCase.caseNumber,
                      deadline: createdCase.deadlineDate.slice(0, 10),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/sprawy/${createdCase.uuid}` as "/"}
                    className="font-semibold text-blue-700 underline dark:text-blue-300"
                  >
                    Otwórz sprawę →
                  </Link>
                  <Link href="/kalendarz" className="text-muted-foreground underline">
                    Kalendarz
                  </Link>
                </div>
              </div>
            ) : (
              <Button
                tone="primary"
                disabled={savingCase}
                className="w-full justify-center"
                onClick={() => void handleSaveToCalendar()}
              >
                <CalendarPlus aria-hidden="true" className="size-4" />
                {savingCase
                  ? t("recommendation.saving")
                  : t("recommendation.saveToCalendar")}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
