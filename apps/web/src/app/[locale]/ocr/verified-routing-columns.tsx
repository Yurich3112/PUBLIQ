"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowCounterclockwise,
  ArrowLeft,
  Building,
  CalendarPlus,
  CheckCircle,
  ClipboardCheck,
  ExclamationTriangleFill,
  LightningChargeFill,
  Magic,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Link } from "@/i18n/navigation";
import type { VerifiedOcrPayload } from "@/schemas/ocr";
import { Button, Input, Throbber } from "@/ui/basic";
import type { KnowledgeMatchResponse } from "./knowledge-recommendation-card";

interface CreatedCaseSummary {
  uuid: string;
  caseNumber: string;
  deadlineDate: string;
  processStatus: string;
  isMultiDepartment: boolean;
}

export function VerifiedRoutingColumns({
  verifiedPayload,
  requestText,
  receivedDate,
  registryNumber,
  onReceivedDateChange,
  onRegistryNumberChange,
  matching,
  matchError,
  matchResult,
  onCaseRegistered,
  onResetForNewRequest,
}: {
  verifiedPayload: VerifiedOcrPayload;
  requestText: string;
  receivedDate: string;
  registryNumber: string;
  onReceivedDateChange: (next: string) => void;
  onRegistryNumberChange: (next: string) => void;
  matching: boolean;
  matchError: boolean;
  matchResult: KnowledgeMatchResponse | null;
  onCaseRegistered?: () => void;
  onResetForNewRequest?: () => void;
}) {
  const t = useTranslations("ocr");
  const defaultSubject = requestText.replace(/\s+/g, " ").trim().slice(0, 240);

  const [applicantName, setApplicantName] = useState("Wnioskodawca (skan OCR)");
  const [subject, setSubject] = useState(defaultSubject || verifiedPayload.fileName);
  const [selectedDepts, setSelectedDepts] = useState<string[]>(
    () => matchResult?.recommendedDepartments ?? [],
  );
  const [overrideExternal, setOverrideExternal] = useState(false);
  const [ownDepartment, setOwnDepartment] = useState(
    () =>
      matchResult?.scenario === "OUR_OFFICE_NEW" &&
      (matchResult?.recommendedDepartments.length ?? 0) === 0,
  );

  // Right column 2-step flow: "select" (choose departments) -> "draft" (edit generated response + Save to Calendar)
  const [rightMode, setRightMode] = useState<"select" | "draft">("select");
  const [generatedDraft, setGeneratedDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [savingCase, setSavingCase] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [createdCase, setCreatedCase] = useState<CreatedCaseSummary | null>(null);

  const recommendedSet = new Set(matchResult?.recommendedDepartments ?? []);
  const internalDepartments = [
    ...(matchResult?.institutionsForLlm.filter(i => i.kind === "INTERNAL_DEPARTMENT") ?? []),
  ].sort((a, b) => {
    const ar = recommendedSet.has(a.name) ? 0 : 1;
    const br = recommendedSet.has(b.name) ? 0 : 1;
    return ar - br;
  });

  const isExternalActive = matchResult?.scenario === "EXTERNAL_INSTITUTION" && !overrideExternal;
  const isDepartmentQueryMode = !isExternalActive && !ownDepartment;
  const hasRequiredMetadata = Boolean(receivedDate.trim() && registryNumber.trim());
  const canGenerate =
    hasRequiredMetadata && (isExternalActive || ownDepartment || selectedDepts.length > 0);

  function toggleDepartment(name: string) {
    setSelectedDepts(prev =>
      prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name],
    );
  }

  async function handleGenerateResponse() {
    if (!canGenerate) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/v1/knowledge/draft-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          requestText,
          selectedDepartments: isExternalActive || ownDepartment ? [] : selectedDepts,
          overrideExternal,
          ownDepartment: !isExternalActive && ownDepartment,
          receivedDate: receivedDate.trim() || null,
          registryNumber: registryNumber.trim() || null,
          referenceCaseNumber: matchResult?.topMatch?.externalKey ?? null,
          referenceText: matchResult?.referenceTemplate?.extractedBodyText ?? null,
          externalAuthorityName: matchResult?.externalAuthorityHint?.name ?? null,
          externalLegalBasis: matchResult?.externalAuthorityHint?.legalBasis ?? null,
        }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { status?: string; draft?: string };
      if (json.status === "ok" && json.draft) {
        setGeneratedDraft(json.draft);
        setRightMode("draft");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyDraft() {
    if (!generatedDraft) return;
    await navigator.clipboard.writeText(generatedDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleSaveToCalendar() {
    setSavingCase(true);
    setSaveError(false);
    try {
      const routingType = isExternalActive ? "EXTERNAL_AUTHORITY" : "INTERNAL_DEPARTMENTS";
      const response = await fetch(API_ROUTES.cases, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          applicantName: applicantName.trim() || "Wnioskodawca (skan OCR)",
          subject: subject.trim() || verifiedPayload.fileName,
          registryNumber: registryNumber.trim() || null,
          receivedDate: receivedDate.trim() || undefined,
          sourceMode: verifiedPayload.fileName.toLowerCase().endsWith(".docx") ? "digital_pdf" : "handwritten_scan",
          verifiedRequestText: requestText,
          ocrConfidence: verifiedPayload.averageConfidence,
          matchedCaseNumber: matchResult?.topMatch?.externalKey ?? null,
          matchSimilarity: matchResult?.topMatch?.score ?? null,
          routingType,
          externalAuthorityName: isExternalActive ? matchResult?.externalAuthorityHint?.name ?? null : null,
          letterTemplateType: isExternalActive ? "EXTERNAL_REDIRECT" : "MERIT_RESPONSE",
          draftResponseText: isDepartmentQueryMode ? null : generatedDraft.trim() || null,
          departments:
            isExternalActive || ownDepartment
              ? []
              : selectedDepts.map(name => ({
                  departmentName: name,
                  departmentEmail:
                    internalDepartments.find(d => d.name === name)?.email ?? null,
                  questionText: generatedDraft.trim() || null,
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
        onCaseRegistered?.();
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
    <>
      {/* Column 2 (Center): Knowledge Base recommendation + Case Metadata Form */}
      <section
        aria-label={t("recommendation.title")}
        className="flex min-h-0 flex-col rounded-xl border border-border bg-surface p-3.5"
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

        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
          {matching && (
            <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
              <Throbber label={t("recommendation.matching")} />
              <span>{t("recommendation.matching")}</span>
            </div>
          )}

          {!matching && matchError && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              {t("recommendation.matchFailed")}
            </p>
          )}

          {!matching && matchResult && (
            <>
              {isExternalActive ? (
                <>
                  <div className="space-y-1.5 rounded-lg border border-amber-500/45 bg-amber-500/10 p-3 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-950 dark:text-amber-100">
                      <ExclamationTriangleFill aria-hidden="true" className="size-3.5 shrink-0 text-amber-600" />
                      <span>
                        {matchResult.externalAuthorityHint?.name ??
                          "Instytucja zewnętrzna (Art. 4 ust. 3 UDIP)"}
                      </span>
                    </div>
                    <p className="text-amber-900/90 dark:text-amber-200/90">
                      {matchResult.externalAuthorityHint?.legalBasis ??
                        "Art. 4 ust. 3 UDIP — Urząd Miasta Bydgoszczy nie jest dysponentem danych."}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    tone="main-outline"
                    className="w-full justify-center text-xs"
                    onClick={() => {
                      setOverrideExternal(true);
                      setRightMode("select");
                    }}
                  >
                    AI się myli — wybierz wydziały UM Bydgoszcz
                  </Button>
                </>
              ) : (
                <>
                  {matchResult.scenario === "EXTERNAL_INSTITUTION" && overrideExternal ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-950 dark:text-blue-100">
                      <span className="font-semibold">Nadpisano: sprawa wewnętrzna UM Bydgoszcz</span>
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideExternal(false);
                          setRightMode("select");
                        }}
                        className="inline-flex items-center gap-1 font-medium underline hover:opacity-80"
                      >
                        <ArrowCounterclockwise aria-hidden="true" className="size-3" />
                        Cofnij
                      </button>
                    </div>
                  ) : (
                    <div className={`rounded-lg border px-3 py-2 text-xs ${scenarioTone}`}>
                      <p className="font-semibold">
                        {t(`recommendation.scenarios.${matchResult.scenario}.title`)}
                      </p>
                      <p className="mt-0.5 opacity-90">
                        {t(`recommendation.scenarios.${matchResult.scenario}.hint`)}
                      </p>
                    </div>
                  )}

                  {matchResult.topMatch && !overrideExternal && (
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
                </>
              )}
            </>
          )}

          {/* Case Metadata Fields */}
          <div className="mt-auto space-y-2.5 border-t border-border pt-3">
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
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  {t("stamp.receivedDate")} *
                </span>
                <Input
                  type="date"
                  required
                  value={receivedDate}
                  onChange={event => onReceivedDateChange(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  {t("stamp.registryNumber")} *
                </span>
                <Input
                  type="text"
                  required
                  value={registryNumber}
                  onChange={event => onRegistryNumberChange(event.target.value)}
                  placeholder="Nr wpływu"
                  className={registryNumber.trim() ? undefined : "border-amber-500/70"}
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Column 3 (Rightmost): Step 1 = Select Departments + Generate -> Step 2 = Editable Response + Save to Calendar */}
      <section
        aria-label={rightMode === "select" ? "Wybór wydziałów" : "Wygenerowana odpowiedź"}
        className="flex min-h-0 flex-col rounded-xl border border-emerald-600/40 bg-emerald-500/8 p-3.5"
      >
        {rightMode === "select" ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
              {isExternalActive ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-amber-500/35 bg-background/90 p-5 text-center text-xs">
                  <ExclamationTriangleFill aria-hidden="true" className="size-6 text-amber-500" />
                  <p className="font-semibold text-foreground">
                    Sprawa podlega pod instytucję zewnętrzną
                  </p>
                  <p className="max-w-xs text-muted-foreground">
                    Kliknij <strong>Wygeneruj odpowiedź</strong> poniżej, aby przygotować projekt pisma o braku dysponenta (Art. 4 ust. 3 UDIP), lub nadpisz decyzję AI w środkowej kolumnie.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid shrink-0 grid-cols-2 gap-1.5 rounded-lg border border-border bg-background/80 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setOwnDepartment(false)}
                      className={`rounded-md px-2.5 py-1.5 font-semibold transition ${
                        !ownDepartment
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Inne wydziały UMB
                    </button>
                    <button
                      type="button"
                      onClick={() => setOwnDepartment(true)}
                      className={`rounded-md px-2.5 py-1.5 font-semibold transition ${
                        ownDepartment
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Nasz dział (BKS)
                    </button>
                  </div>

                  {ownDepartment ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-emerald-500/35 bg-background/90 p-5 text-center text-xs">
                      <CheckCircle aria-hidden="true" className="size-6 text-emerald-600" />
                      <p className="font-semibold text-foreground">
                        Odpowiadamy samodzielnie (Biuro Komunikacji Społecznej)
                      </p>
                      <p className="max-w-xs text-muted-foreground">
                        Nie wysyłamy zapytań do innych wydziałów. Kliknij{" "}
                        <strong>Wygeneruj odpowiedź</strong>, aby AI przygotowało projekt odpowiedzi na podstawie Bazy Wiedzy.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
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

                      {matching ? (
                        <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                          <Throbber label={t("recommendation.matching")} />
                          <span>Ładowanie sugerowanych wydziałów…</span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {internalDepartments.map(dept => {
                            const checked = selectedDepts.includes(dept.name);
                            const isSuggested = recommendedSet.has(dept.name);
                            return (
                              <label
                                key={dept.code}
                                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs transition ${
                                  checked
                                    ? "border-blue-600 bg-blue-500/12 font-medium text-blue-950 dark:text-blue-100"
                                    : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                                }`}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleDepartment(dept.name)}
                                    className="size-3.5 shrink-0 accent-blue-600"
                                  />
                                  <span className="truncate">{dept.name}</span>
                                </span>
                                {isSuggested && (
                                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                                    Sugerowany
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-emerald-600/20 pt-3">
              {generatedDraft ? (
                <button
                  type="button"
                  onClick={() => setRightMode("draft")}
                  className="text-xs font-medium text-emerald-900 underline hover:opacity-80 dark:text-emerald-200"
                >
                  Wróć do projektu →
                </button>
              ) : (
                <span className="text-[11px] text-emerald-900/80 dark:text-emerald-200/80">
                  {!hasRequiredMetadata
                    ? "Uzupełnij datę i Nr wpływu (Kancelaria)"
                    : isExternalActive
                      ? "Projekt przekierowania (Art. 4 ust. 3)"
                      : ownDepartment
                        ? "Bezpośrednia odpowiedź BKS"
                        : selectedDepts.length > 0
                          ? `Wybrane wydziały: ${selectedDepts.length}`
                          : "Zaznacz min. 1 wydział"}
                </span>
              )}
              <Button
                tone="primary"
                disabled={generating || matching || !canGenerate}
                title={!hasRequiredMetadata ? "Uzupełnij datę oraz Nr wpływu (Kancelaria), aby wygenerować pismo." : undefined}
                className="shrink-0 whitespace-nowrap"
                onClick={() => void handleGenerateResponse()}
              >
                <Magic aria-hidden="true" className="size-3.5" />
                {generating
                  ? "Generowanie…"
                  : isDepartmentQueryMode
                    ? selectedDepts.length > 1
                      ? "Wygeneruj zapytanie do wydziałów"
                      : "Wygeneruj zapytanie do wydziału"
                    : "Wygeneruj odpowiedź"}
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Draft Header: Back to departments + Copy (fixed top-right) */}
            <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-emerald-600/20 pb-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRightMode("select")}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                >
                  <ArrowLeft aria-hidden="true" className="size-3" />
                  Wydziały
                </button>
                <span className="truncate text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                  {isDepartmentQueryMode
                    ? "Zapytanie do wydziału (BKS → UMB)"
                    : isExternalActive
                      ? "Pismo o braku dysponenta (Art. 4 ust. 3)"
                      : "Projekt odpowiedzi do wnioskodawcy"}
                </span>
              </div>
              <Button
                size="sm"
                tone="main-outline"
                className="min-w-[100px] shrink-0 justify-center whitespace-nowrap"
                onClick={() => void handleCopyDraft()}
              >
                <ClipboardCheck aria-hidden="true" className="size-3.5 shrink-0" />
                {copied ? t("verified.copied") : "Kopiuj"}
              </Button>
            </div>

            {/* Editable Generated Response Textarea */}
            <textarea
              value={generatedDraft}
              onChange={e => setGeneratedDraft(e.target.value)}
              aria-label="Edytowalny projekt odpowiedzi"
              className="mt-2.5 min-h-0 flex-1 resize-none rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />

            {saveError && (
              <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
                {t("recommendation.saveFailed")}
              </p>
            )}

            {/* Pinned Bottom Action: Save Case to Calendar */}
            <div className="mt-3 shrink-0 border-t border-emerald-600/20 pt-3">
              {createdCase ? (
                <div
                  role="status"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-600/40 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-950 dark:text-emerald-100"
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
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/sprawy/${createdCase.uuid}` as "/"}
                      className="font-semibold text-blue-700 underline dark:text-blue-300"
                    >
                      Otwórz sprawę →
                    </Link>
                    <Link href="/kalendarz" className="text-muted-foreground underline">
                      Kalendarz
                    </Link>
                    {onResetForNewRequest && (
                      <button
                        type="button"
                        onClick={onResetForNewRequest}
                        className="font-semibold text-emerald-800 underline hover:opacity-80 dark:text-emerald-200"
                      >
                        + Nowy wniosek
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    tone="main-outline"
                    disabled={generating}
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => void handleGenerateResponse()}
                  >
                    <Magic aria-hidden="true" className="size-3.5" />
                    {generating ? "…" : "Generuj ponownie"}
                  </Button>
                  <Button
                    tone="primary"
                    disabled={savingCase}
                    className="min-w-0 flex-1 justify-center whitespace-nowrap"
                    onClick={() => void handleSaveToCalendar()}
                  >
                    <CalendarPlus aria-hidden="true" className="size-4 shrink-0" />
                    {savingCase
                      ? t("recommendation.saving")
                      : t("recommendation.saveToCalendar")}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}
