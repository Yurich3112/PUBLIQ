"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle,
  ClipboardCheck,
  CloudUpload,
  ExclamationTriangleFill,
  FileEarmarkText,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import {
  MAX_OCR_UPLOAD_BYTES,
  ocrAnalysisResponseSchema,
  ocrErrorCodeSchema,
  type OcrAnalysisResponse,
  type OcrErrorCode,
  type OcrWord,
  type VerifiedOcrPayload,
} from "@/schemas/ocr";
import { Button, Input, Throbber } from "@/ui/basic";
import { ClarificationDraftModal } from "./clarification-draft-modal";
import {
  KnowledgeRecommendationCard,
  type KnowledgeMatchResponse,
} from "./knowledge-recommendation-card";
import {
  assembleVerifiedBodyText,
  buildClarificationNoticeDraft,
  buildVerifiedPayload,
  findAdjacentWordId,
  findNextUncertainWordId,
  getWordDisplayText,
} from "./ocr-helpers";
import { ScanCanvas } from "./scan-canvas";
import { TranscriptionPane } from "./transcription-pane";

export function OcrSplitVerifier({
  onConfirm,
}: {
  onConfirm?: (payload: VerifiedOcrPayload) => void;
}) {
  const t = useTranslations("ocr");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<OcrErrorCode | null>(null);
  const [analysis, setAnalysis] = useState<OcrAnalysisResponse | null>(null);

  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [editedWords, setEditedWords] = useState<Record<string, string>>({});
  const [receivedDate, setReceivedDate] = useState("");
  const [registryNumber, setRegistryNumber] = useState("");

  const [verifiedPayload, setVerifiedPayload] = useState<VerifiedOcrPayload | null>(null);
  const [copiedVerified, setCopiedVerified] = useState(false);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [matchingKb, setMatchingKb] = useState(false);
  const [matchError, setMatchError] = useState(false);
  const [matchResult, setMatchResult] = useState<KnowledgeMatchResponse | null>(null);

  async function handleFileUpload(file: File) {
    setErrorCode(null);
    setVerifiedPayload(null);
    if (file.size === 0) {
      setErrorCode("invalid");
      return;
    }
    if (file.size > MAX_OCR_UPLOAD_BYTES) {
      setErrorCode("tooLarge");
      return;
    }

    setLoading(true);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(API_ROUTES.ocrAnalyze, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsedError = ocrErrorCodeSchema.safeParse(
          typeof json === "object" && json !== null && "status" in json
            ? (json as { status: unknown }).status
            : null,
        );
        const fallbackCode: OcrErrorCode = response.status === 504 || response.status === 408
          ? "timeout"
          : response.status === 413
            ? "tooLarge"
            : response.status === 503
              ? "unavailable"
              : response.status === 401 || response.status === 403
                ? "denied"
                : "failed";
        setErrorCode(parsedError.success ? parsedError.data : fallbackCode);
        setAnalysis(null);
        return;
      }

      const parsed = ocrAnalysisResponseSchema.safeParse(json);
      if (!parsed.success) {
        setErrorCode("failed");
        setAnalysis(null);
        return;
      }

      setAnalysis(parsed.data);
      setPageIndex(0);
      setZoom(100);
      setSelectedWordId(null);
      setEditedWords({});
      setReceivedDate(parsed.data.stamp_metadata.received_date ?? "");
      setRegistryNumber(parsed.data.stamp_metadata.registry_number ?? "");
    } catch {
      setErrorCode("unavailable");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  const handleJumpNextUncertain = useCallback(() => {
    if (!analysis) return;
    const next = findNextUncertainWordId(analysis, editedWords, selectedWordId);
    if (!next) return;
    setPageIndex(next.pageIndex);
    setSelectedWordId(next.wordId);
  }, [analysis, editedWords, selectedWordId]);

  const handleStepWord = useCallback(
    (direction: 1 | -1) => {
      if (!analysis) return;
      const next = findAdjacentWordId(analysis, selectedWordId, direction, pageIndex);
      if (!next) return;
      setPageIndex(next.pageIndex);
      setSelectedWordId(next.wordId);
    },
    [analysis, selectedWordId, pageIndex],
  );

  function handleSelectWord(word: OcrWord) {
    setSelectedWordId(word.id);
  }

  function handleEditWord(wordId: string, nextText: string) {
    setEditedWords(prev => ({ ...prev, [wordId]: nextText }));
    setVerifiedPayload(null);
  }

  async function handleConfirmVerification() {
    if (!analysis) return;
    const payload = buildVerifiedPayload({
      analysis,
      fileName: fileName || "wniosek.pdf",
      editedWords,
      receivedDate: receivedDate || null,
      registryNumber: registryNumber || null,
    });
    setVerifiedPayload(payload);
    setMatchResult(null);
    setMatchError(false);
    onConfirm?.(payload);

    if (payload.verifiedText.trim().length < 3) return;
    setMatchingKb(true);
    try {
      const response = await fetch(API_ROUTES.knowledgeMatch, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          title: payload.fileName,
          summary: payload.verifiedText,
        }),
      });
      if (!response.ok) {
        setMatchError(true);
        return;
      }
      const json = (await response.json()) as KnowledgeMatchResponse;
      if (json.status === "ok") {
        setMatchResult(json);
      } else {
        setMatchError(true);
      }
    } catch {
      setMatchError(true);
    } finally {
      setMatchingKb(false);
    }
  }

  async function handleCopyVerifiedText() {
    if (!verifiedPayload) return;
    await navigator.clipboard.writeText(verifiedPayload.verifiedText);
    setCopiedVerified(true);
    setTimeout(() => setCopiedVerified(false), 2000);
  }

  const activePage = analysis?.pages[pageIndex] ?? null;
  const selectedWord =
    activePage && selectedWordId
      ? activePage.words.find(w => w.id === selectedWordId) ?? null
      : null;
  const assembledPreview = analysis ? assembleVerifiedBodyText(analysis, editedWords) : "";
  const clarificationDraft = buildClarificationNoticeDraft({
    fileName: fileName || "wniosek.pdf",
    receivedDate: receivedDate || null,
    registryNumber: registryNumber || null,
  });

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void handleFileUpload(file);
              event.target.value = "";
            }}
          />
          <Button
            tone="main-outline"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUpload aria-hidden="true" className="size-4" />
            {analysis ? t("uploadAnother") : t("uploadButton")}
          </Button>
          {analysis && (
            <>
              <Button
                tone={analysis.legibility.recommend_clarification ? "error" : "danger-outline"}
                onClick={() => setClarificationOpen(true)}
              >
                <ExclamationTriangleFill aria-hidden="true" className="size-4" />
                {t("illegibleButton")}
              </Button>
              <Button tone="primary" onClick={() => void handleConfirmVerification()}>
                <CheckCircle aria-hidden="true" className="size-4" />
                {t("confirmButton")}
              </Button>
            </>
          )}
        </div>
      </header>

      {errorCode && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200"
        >
          {t(`errors.${errorCode}`)}
        </div>
      )}

      {loading && (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface p-8 text-center">
          <Throbber label={t("processing")} />
          <p className="text-sm font-medium">{t("processingFile", { name: fileName })}</p>
          <p className="text-xs text-muted-foreground">{t("processingStages")}</p>
        </div>
      )}

      {!loading && !analysis && (
        <div
          onDragOver={event => event.preventDefault()}
          onDrop={event => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFileUpload(file);
          }}
          className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface/60 p-10 text-center"
        >
          <FileEarmarkText aria-hidden="true" className="size-10 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-base font-medium">{t("dropTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("dropHint")}</p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()}>
            <CloudUpload aria-hidden="true" className="mr-2 size-4" />
            {t("uploadButton")}
          </Button>
        </div>
      )}

      {!loading && analysis && activePage && (
        <>
          {analysis.legibility.recommend_clarification && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-500/12 px-4 py-3"
            >
              <div className="flex items-start gap-2.5 text-sm">
                <ExclamationTriangleFill aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-950 dark:text-amber-100">
                    {t("illegibleBannerTitle")}
                  </p>
                  <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
                    {analysis.legibility.reason ?? t("illegibleBannerHint")}
                  </p>
                </div>
              </div>
              <Button size="sm" tone="error" onClick={() => setClarificationOpen(true)}>
                {t("illegibleButton")}
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium text-foreground">{fileName}</span>
              <span>
                {t("stats.confidence", {
                  percent: Math.round(analysis.legibility.average_confidence * 100),
                })}
              </span>
              <span>{t("stats.edited", { count: Object.keys(editedWords).length })}</span>
              <span>{t("stats.duration", { ms: analysis.duration_ms })}</span>
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="inline-block size-2.5 rounded-xs border-2 border-red-600 bg-red-500/25" />
                {t("legend.low")}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px]">
                <span className="inline-block size-2.5 rounded-xs border-2 border-blue-600 bg-blue-500/25" />
                {t("inspector.selected")}
              </span>
            </div>
            <span className="font-mono text-[11px]">
              {analysis.engine.detector} · {analysis.engine.recognizer}
            </span>
          </div>

          {/* Shared top metadata & selected-word bar so both document sheets below stay 100% level */}
          <div className="grid grid-cols-1 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{t("stamp.receivedDate")}</span>
              <Input
                type="date"
                value={receivedDate}
                onChange={event => setReceivedDate(event.target.value)}
                aria-label={t("stamp.receivedDate")}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{t("stamp.registryNumber")}</span>
              <Input
                type="text"
                value={registryNumber}
                placeholder="3468/2026"
                onChange={event => setRegistryNumber(event.target.value)}
                aria-label={t("stamp.registryNumber")}
              />
            </label>
            <div className="flex flex-col justify-center gap-1 text-xs">
              <span className="font-medium text-muted-foreground">{t("inspector.selected")}</span>
              {selectedWord ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <code className="font-mono font-semibold text-foreground">
                      {getWordDisplayText(selectedWord, editedWords)}
                    </code>
                    <span className="text-muted-foreground">
                      (OCR: {selectedWord.text} · {Math.round(selectedWord.confidence * 100)}%)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border px-2.5 py-2 text-muted-foreground">
                  {t("transcriptionHint")}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
            <ScanCanvas
              page={activePage}
              pageCount={analysis.page_count}
              zoom={zoom}
              onZoomChange={setZoom}
              onPageChange={next => {
                setPageIndex(next);
                setSelectedWordId(null);
              }}
              selectedWordId={selectedWordId}
              editedWords={editedWords}
              onSelectWord={handleSelectWord}
            />

            <TranscriptionPane
              page={activePage}
              zoom={zoom}
              selectedWordId={selectedWordId}
              editedWords={editedWords}
              onSelectWord={handleSelectWord}
              onEditWord={handleEditWord}
              onJumpNextUncertain={handleJumpNextUncertain}
              onStepWord={handleStepWord}
            />
          </div>

          {verifiedPayload && (
            <>
              <KnowledgeRecommendationCard
                key={`${verifiedPayload.fileName}:${matchResult?.topMatch?.externalKey ?? "none"}:${matchResult?.scenario ?? "pending"}`}
                verifiedPayload={verifiedPayload}
                matching={matchingKb}
                matchError={matchError}
                matchResult={matchResult}
              />

              <section
                aria-label={t("verified.title")}
                className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                    <CheckCircle aria-hidden="true" className="size-4" />
                    <span>{t("verified.title")}</span>
                  </div>
                  <Button size="sm" tone="main-outline" onClick={() => void handleCopyVerifiedText()}>
                    <ClipboardCheck aria-hidden="true" className="size-3.5" />
                    {copiedVerified ? t("verified.copied") : t("verified.copyText")}
                  </Button>
                </div>
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 font-mono text-xs">
                  {assembledPreview || verifiedPayload.verifiedText}
                </pre>
              </section>
            </>
          )}
        </>
      )}

      <ClarificationDraftModal
        key={`${fileName}:${receivedDate}:${registryNumber}:${clarificationOpen}`}
        open={clarificationOpen}
        initialDraft={clarificationDraft}
        onClose={() => setClarificationOpen(false)}
      />
    </div>
  );
}
