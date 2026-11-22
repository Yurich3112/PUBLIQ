"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle,
  ClipboardCheck,
  CloudUpload,
  EnvelopePaper,
  ExclamationTriangleFill,
  FileEarmarkText,
  Search,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Link } from "@/i18n/navigation";
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
  const [acceptedWords, setAcceptedWords] = useState<Set<string>>(() => new Set());
  const [deletedWords, setDeletedWords] = useState<Set<string>>(() => new Set());
  const [undoStack, setUndoStack] = useState<
    {
      editedWords: Record<string, string>;
      acceptedWords: string[];
      deletedWords: string[];
      selectedWordId: string | null;
    }[]
  >([]);
  const [receivedDate, setReceivedDate] = useState("");
  const [registryNumber, setRegistryNumber] = useState("");

  const [verifiedPayload, setVerifiedPayload] = useState<VerifiedOcrPayload | null>(null);
  const [copiedVerified, setCopiedVerified] = useState(false);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [matchingKb, setMatchingKb] = useState(false);
  const [matchError, setMatchError] = useState(false);
  const [matchResult, setMatchResult] = useState<KnowledgeMatchResponse | null>(null);
  const [intakeMode, setIntakeMode] = useState<"scan" | "text">("scan");
  const [pastedText, setPastedText] = useState("");

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
      setAcceptedWords(new Set());
      setDeletedWords(new Set());
      setUndoStack([]);
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
    const next = findNextUncertainWordId(
      analysis,
      editedWords,
      selectedWordId,
      acceptedWords,
      deletedWords,
    );
    if (!next) return;
    setPageIndex(next.pageIndex);
    setSelectedWordId(next.wordId);
  }, [analysis, editedWords, selectedWordId, acceptedWords, deletedWords]);

  const handleStepWord = useCallback(
    (direction: 1 | -1) => {
      if (!analysis) return;
      const next = findAdjacentWordId(
        analysis,
        selectedWordId,
        direction,
        pageIndex,
        deletedWords,
      );
      if (!next) return;
      setPageIndex(next.pageIndex);
      setSelectedWordId(next.wordId);
    },
    [analysis, selectedWordId, pageIndex, deletedWords],
  );

  function pushUndoSnapshot() {
    setUndoStack(prev => [
      ...prev.slice(-49),
      {
        editedWords: { ...editedWords },
        acceptedWords: Array.from(acceptedWords),
        deletedWords: Array.from(deletedWords),
        selectedWordId,
      },
    ]);
  }

  function handleSelectWord(word: OcrWord) {
    setSelectedWordId(word.id);
  }

  function handleEditWord(wordId: string, nextText: string) {
    pushUndoSnapshot();
    setEditedWords(prev => ({ ...prev, [wordId]: nextText }));
    setAcceptedWords(prev => {
      if (!prev.has(wordId)) return prev;
      const next = new Set(prev);
      next.delete(wordId);
      return next;
    });
    setVerifiedPayload(null);
  }

  function handleAcceptWord(wordId: string) {
    pushUndoSnapshot();
    setAcceptedWords(prev => {
      const next = new Set(prev);
      next.add(wordId);
      return next;
    });
    setVerifiedPayload(null);
  }

  function handleDeleteWord(wordId: string) {
    if (!analysis) return;
    pushUndoSnapshot();
    const nextDeleted = new Set(deletedWords);
    nextDeleted.add(wordId);
    const adjacent = findAdjacentWordId(analysis, wordId, 1, pageIndex, nextDeleted);
    setDeletedWords(nextDeleted);
    setSelectedWordId(adjacent && adjacent.wordId !== wordId ? adjacent.wordId : null);
    setVerifiedPayload(null);
  }

  const handleUndo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setEditedWords(last.editedWords);
      setAcceptedWords(new Set(last.acceptedWords));
      setDeletedWords(new Set(last.deletedWords));
      setSelectedWordId(last.selectedWordId);
      setVerifiedPayload(null);
      return prev.slice(0, -1);
    });
  }, []);

  async function handleConfirmVerification() {
    if (!analysis) return;
    const payload = buildVerifiedPayload({
      analysis,
      fileName: fileName || "wniosek.pdf",
      editedWords,
      deletedWords,
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

  async function handleAnalyzePastedText() {
    const clean = pastedText.trim();
    if (clean.length < 3) return;
    const payload: VerifiedOcrPayload = {
      fileName: "wniosek-email.txt",
      pageCount: 1,
      verifiedText: clean,
      receivedDate: receivedDate || new Date().toISOString().slice(0, 10),
      registryNumber: registryNumber || null,
      averageConfidence: 1,
      editedWordCount: 0,
      totalWordCount: clean.split(/\s+/).filter(Boolean).length,
      verifiedAt: new Date().toISOString(),
    };
    setVerifiedPayload(payload);
    setMatchResult(null);
    setMatchError(false);
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

  const activePage = analysis?.pages[pageIndex] ?? null;
  const assembledPreview = analysis
    ? assembleVerifiedBodyText(analysis, editedWords, deletedWords)
    : "";
  const clarificationDraft = buildClarificationNoticeDraft({
    fileName: fileName || "wniosek.pdf",
    receivedDate: receivedDate || null,
    registryNumber: registryNumber || null,
  });

  const isSplitWorkspace = Boolean(!loading && analysis && activePage);
  const canConfirmDocument = Boolean(receivedDate.trim() && registryNumber.trim());

  useLayoutEffect(() => {
    if (!isSplitWorkspace) return;
    document.body.dataset.viewportLock = "ocr";
    return () => {
      if (document.body.dataset.viewportLock === "ocr") {
        delete document.body.dataset.viewportLock;
      }
    };
  }, [isSplitWorkspace]);

  return (
    <div
      data-ocr-workspace={isSplitWorkspace ? "true" : undefined}
      className={
        isSplitWorkspace
          ? "mx-auto flex w-full max-w-[1520px] flex-1 min-h-0 flex-col gap-2 px-3 py-2 sm:px-5"
          : "mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 sm:px-6"
      }
    >
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

      {!analysis ? (
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <Link
              href="/kalendarz"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              Kalendarz Wniosków
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>

          <Button
            tone="main-outline"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUpload aria-hidden="true" className="size-4" />
            {t("uploadButton")}
          </Button>
        </header>
      ) : (
        /* Ultra-compact single-row metadata strip; actions live directly in the left/right pane headers */
        <header className="flex shrink-0 flex-wrap items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs">
          <span className="max-w-[260px] truncate font-semibold text-foreground" title={fileName}>
            {fileName}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {Math.round(analysis.legibility.average_confidence * 100)}%
          </span>
          {analysis.legibility.recommend_clarification && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              <ExclamationTriangleFill aria-hidden="true" className="size-3" />
              {t("illegibleBannerTitle")}
            </span>
          )}

          <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:inline-block" />

          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{t("stamp.receivedDate")} *:</span>
            <Input
              type="date"
              required
              value={receivedDate}
              onChange={event => setReceivedDate(event.target.value)}
              aria-label={t("stamp.receivedDate")}
              className={`h-7 w-[136px] px-2 text-[11px] ${!receivedDate.trim() ? "border-amber-500/70" : ""}`}
            />
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{t("stamp.registryNumber")} *:</span>
            <Input
              type="text"
              required
              value={registryNumber}
              placeholder="Nr wpływu"
              onChange={event => setRegistryNumber(event.target.value)}
              aria-label={t("stamp.registryNumber")}
              className={`h-7 w-[120px] px-2 text-[11px] ${!registryNumber.trim() ? "border-amber-500/70" : ""}`}
            />
          </label>
        </header>
      )}

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
        <div className="space-y-4">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
            <button
              type="button"
              onClick={() => setIntakeMode("scan")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                intakeMode === "scan"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CloudUpload aria-hidden="true" className="size-3.5" />
              Skan / PDF (OCR 1:1)
            </button>
            <button
              type="button"
              onClick={() => setIntakeMode("text")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                intakeMode === "text"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <EnvelopePaper aria-hidden="true" className="size-3.5" />
              Wklej treść z e-maila
            </button>
          </div>

          {intakeMode === "scan" ? (
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFileUpload(file);
              }}
              className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-surface/60 p-10 text-center"
            >
              <FileEarmarkText aria-hidden="true" className="size-10 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-base font-medium">{t("dropTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("dropHint")}</p>
              </div>
              <Button tone="primary" onClick={() => fileInputRef.current?.click()}>
                <CloudUpload aria-hidden="true" className="mr-2 size-4" />
                {t("uploadButton")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  Wklej treść wniosku przesłanego e-mailem lub przez ePUAP
                </p>
                <p className="text-xs text-muted-foreground">
                  System natychmiast sprawdzi Bazę Wiedzy (sprawy bliźniacze 2025/2026), wskaże właściwy wydział lub instytucję zewnętrzną (np. ZUS, ZDMiKP, WKZ) i pozwoli zapisać sprawę w Kalendarzu.
                </p>
              </div>
              <textarea
                rows={6}
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Np. Wnoszę o udostępnienie informacji publicznej dotyczącej liczby uczniów cudzoziemców w szkołach podstawowych w Bydgoszczy..."
                className="w-full rounded-lg border border-input-border bg-input p-3 text-xs text-input-foreground"
              />
              <div className="flex justify-end">
                <Button
                  tone="primary"
                  disabled={matchingKb || pastedText.trim().length < 3}
                  onClick={() => void handleAnalyzePastedText()}
                >
                  <Search aria-hidden="true" className="size-3.5" />
                  Analizuj w Bazie Wiedzy
                </Button>
              </div>
            </div>
          )}

          {intakeMode === "text" && verifiedPayload && (
            <KnowledgeRecommendationCard
              key={`${verifiedPayload.fileName}:${matchResult?.topMatch?.externalKey ?? "none"}:${matchResult?.scenario ?? "pending"}`}
              verifiedPayload={verifiedPayload}
              matching={matchingKb}
              matchError={matchError}
              matchResult={matchResult}
            />
          )}
        </div>
      )}

      {!loading && analysis && activePage && (
        <div
          className={`grid min-h-0 flex-1 grid-cols-1 items-stretch gap-2.5 ${
            verifiedPayload ? "lg:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          {!verifiedPayload ? (
            <>
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
                acceptedWords={acceptedWords}
                deletedWords={deletedWords}
                onSelectWord={handleSelectWord}
                onUploadAnother={() => fileInputRef.current?.click()}
                onIllegible={() => setClarificationOpen(true)}
                recommendClarification={analysis.legibility.recommend_clarification}
                loading={loading}
              />

              <TranscriptionPane
                page={activePage}
                zoom={zoom}
                selectedWordId={selectedWordId}
                editedWords={editedWords}
                acceptedWords={acceptedWords}
                deletedWords={deletedWords}
                canUndo={undoStack.length > 0}
                onSelectWord={handleSelectWord}
                onEditWord={handleEditWord}
                onAcceptWord={handleAcceptWord}
                onDeleteWord={handleDeleteWord}
                onUndo={handleUndo}
                onJumpNextUncertain={handleJumpNextUncertain}
                onStepWord={handleStepWord}
                onConfirmDocument={() => void handleConfirmVerification()}
                confirmDisabled={!canConfirmDocument}
                confirmDisabledReason="Uzupełnij datę wpływu oraz numer wpływu (Kancelaria), aby zatwierdzić wniosek."
              />
            </>
          ) : (
            <>
              {/* Column 1 (Leftmost): Read-only A4 scanned/transcribed sheet */}
              <div className="flex min-h-0 flex-col">
                <TranscriptionPane
                  page={activePage}
                  zoom={zoom}
                  selectedWordId={null}
                  editedWords={editedWords}
                  acceptedWords={acceptedWords}
                  deletedWords={deletedWords}
                  canUndo={false}
                  readOnly
                  onSelectWord={handleSelectWord}
                  onEditWord={handleEditWord}
                  onAcceptWord={handleAcceptWord}
                  onDeleteWord={handleDeleteWord}
                  onUndo={handleUndo}
                  onJumpNextUncertain={handleJumpNextUncertain}
                  onStepWord={handleStepWord}
                  onBackToScan={() => setVerifiedPayload(null)}
                />
              </div>

              {/* Column 2 (Center): Vertical departments list + Wnioskodawca + Przedmiot + Save */}
              <div className="flex min-h-0 flex-col">
                <KnowledgeRecommendationCard
                  key={`${verifiedPayload.fileName}:${matchResult?.topMatch?.externalKey ?? "none"}:${matchResult?.scenario ?? "pending"}`}
                  verifiedPayload={verifiedPayload}
                  matching={matchingKb}
                  matchError={matchError}
                  matchResult={matchResult}
                />
              </div>

              {/* Column 3 (Rightmost): Approved request text */}
              <section
                aria-label={t("verified.title")}
                className="flex min-h-0 flex-col rounded-xl border border-emerald-600/40 bg-emerald-500/10 p-3.5"
              >
                <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-emerald-600/20 pb-2.5">
                  <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    <CheckCircle aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{t("verified.title")}</span>
                  </div>
                  <Button
                    size="sm"
                    tone="main-outline"
                    className="min-w-[106px] shrink-0 justify-center whitespace-nowrap"
                    onClick={() => void handleCopyVerifiedText()}
                  >
                    <ClipboardCheck aria-hidden="true" className="size-3.5 shrink-0" />
                    {copiedVerified ? t("verified.copied") : "Kopiuj"}
                  </Button>
                </div>
                <pre className="mt-2.5 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground">
                  {assembledPreview || verifiedPayload.verifiedText}
                </pre>
              </section>
            </>
          )}
        </div>
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
