"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowCounterclockwise, ArrowLeft, ArrowRight, CheckCircle, CheckLg, PencilSquare, Trash } from "react-bootstrap-icons";
import type { OcrLine, OcrPage, OcrWord } from "@/schemas/ocr";
import { Button, IconButton } from "@/ui/basic";
import { getWordDisplayText, needsWordApproval } from "./ocr-helpers";

interface RenderedLineGroup {
  lineId: string;
  zone: OcrLine["zone"];
  bbox: readonly [number, number, number, number];
  angleDeg: number;
  words: OcrWord[];
  fontCqw: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildAlignedLines(
  page: OcrPage,
  wordMap: ReadonlyMap<string, OcrWord>,
  editedWords: Readonly<Record<string, string>>,
): RenderedLineGroup[] {
  const seen = new Set<string>();
  const rawGroups: {
    lineId: string;
    zone: OcrLine["zone"];
    bbox: readonly [number, number, number, number];
    angleDeg: number;
    words: OcrWord[];
    medWordH: number;
    fitCqw: number;
  }[] = [];

  for (const line of page.lines) {
    const words = line.word_ids
      .map(id => wordMap.get(id))
      .filter((w): w is OcrWord => Boolean(w));
    if (!words.length) continue;
    for (const w of words) seen.add(w.id);

    const medH = median(words.map(w => w.bbox[3])) || line.bbox[3];
    const nonSpaceChars = words.reduce(
      (sum, w) => sum + getWordDisplayText(w, editedWords).length,
      0,
    );
    const estEmWidth = nonSpaceChars * 0.44 + Math.max(0, words.length - 1) * 0.28;
    const lineWidthPct = (line.bbox[2] / page.width) * 100;
    const heightFitCqw = ((medH * 1.04) / page.width) * 100;
    const widthFitCqw =
      words.length >= 3 && nonSpaceChars >= 12 && estEmWidth > 0
        ? lineWidthPct / estEmWidth
        : heightFitCqw;

    rawGroups.push({
      lineId: line.line_id,
      zone: line.zone,
      bbox: line.bbox,
      angleDeg: line.angle_deg ?? 0,
      words,
      medWordH: medH,
      fitCqw: Math.min(heightFitCqw, widthFitCqw),
    });
  }

  for (const orphan of page.words) {
    if (seen.has(orphan.id)) continue;
    const h = orphan.bbox[3];
    rawGroups.push({
      lineId: `orphan_${orphan.id}`,
      zone: orphan.zone,
      bbox: orphan.bbox,
      angleDeg: orphan.angle_deg ?? 0,
      words: [orphan],
      medWordH: h,
      fitCqw: ((h * 0.85) / page.width) * 100,
    });
  }

  // Compute uniform body font size so all standard paragraph lines match the scan 1:1.
  const bodyGroups = rawGroups.filter(g => g.zone !== "stamp");
  const pageMedWordH = median(bodyGroups.map(g => g.medWordH)) || 28;
  const standardBodyFits = bodyGroups
    .filter(g => g.medWordH >= pageMedWordH * 0.68 && g.medWordH <= pageMedWordH * 1.6)
    .map(g => g.fitCqw);
  const uniformBodyCqw = Math.max(
    1.65,
    Math.min(2.8, median(standardBodyFits) || ((pageMedWordH * 1.04) / page.width) * 100),
  );

  return rawGroups.map(group => {
    const ratio = group.medWordH / pageMedWordH;
    const fontCqw =
      group.zone !== "stamp" && ratio >= 0.68 && ratio <= 1.6
        ? uniformBodyCqw
        : Math.max(0.72, Math.min(2.5, uniformBodyCqw * Math.max(0.65, Math.min(1.35, ratio))));
    return {
      lineId: group.lineId,
      zone: group.zone,
      bbox: group.bbox,
      angleDeg: group.angleDeg,
      words: group.words,
      fontCqw,
    };
  });
}

export function TranscriptionPane({
  page,
  zoom,
  selectedWordId,
  editedWords,
  acceptedWords,
  deletedWords,
  canUndo,
  onSelectWord,
  onEditWord,
  onAcceptWord,
  onDeleteWord,
  onUndo,
  onJumpNextUncertain,
  onStepWord,
  onConfirmDocument,
  confirmDisabled = false,
  confirmDisabledReason,
  onBackToScan,
  readOnly = false,
}: {
  page: OcrPage;
  zoom: number;
  selectedWordId: string | null;
  editedWords: Readonly<Record<string, string>>;
  acceptedWords: ReadonlySet<string>;
  deletedWords: ReadonlySet<string>;
  canUndo: boolean;
  onSelectWord: (word: OcrWord) => void;
  onEditWord: (wordId: string, nextText: string) => void;
  onAcceptWord: (wordId: string) => void;
  onDeleteWord: (wordId: string) => void;
  onUndo: () => void;
  onJumpNextUncertain: () => void;
  onStepWord: (direction: 1 | -1) => void;
  onConfirmDocument?: () => void;
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
  onBackToScan?: () => void;
  readOnly?: boolean;
}) {
  const t = useTranslations("ocr");
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sheetContainerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewport({ w: Math.max(0, rect.width - 16), h: Math.max(0, rect.height - 16) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const wordMap = useMemo(
    () => new Map(page.words.map(word => [word.id, word])),
    [page.words],
  );

  const alignedLines = useMemo(
    () => buildAlignedLines(page, wordMap, editedWords),
    [page, wordMap, editedWords],
  );

  useEffect(() => {
    if (editingWordId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingWordId]);

  useEffect(() => {
    if (!selectedWordId || !sheetContainerRef.current) return;
    const target = sheetContainerRef.current.querySelector<HTMLElement>(
      `[data-word-token="${CSS.escape(selectedWordId)}"]`,
    );
    if (target) {
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, [selectedWordId]);

  useEffect(() => {
    if (readOnly) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setEditingWordId(null);
        onJumpNextUncertain();
        return;
      }

      const target = event.target as HTMLElement | null;
      const inTextField =
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target?.isContentEditable;
      if (inTextField || editingWordId) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedWordId) {
        event.preventDefault();
        onDeleteWord(selectedWordId);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onStepWord(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onStepWord(-1);
      } else if (event.key === "Enter" && selectedWordId) {
        const current = wordMap.get(selectedWordId);
        if (current && !deletedWords.has(current.id)) {
          event.preventDefault();
          setEditingWordId(current.id);
          setDraftValue(getWordDisplayText(current, editedWords));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    readOnly,
    onJumpNextUncertain,
    onStepWord,
    onDeleteWord,
    onUndo,
    editingWordId,
    selectedWordId,
    wordMap,
    editedWords,
    deletedWords,
  ]);

  function beginEdit(word: OcrWord) {
    onSelectWord(word);
    setEditingWordId(word.id);
    setDraftValue(getWordDisplayText(word, editedWords));
  }

  function handleClickWord(word: OcrWord) {
    if (selectedWordId === word.id) {
      beginEdit(word);
    } else {
      setEditingWordId(null);
      onSelectWord(word);
    }
  }

  function commitEdit(wordId: string) {
    const trimmed = draftValue.trim();
    if (trimmed) onEditWord(wordId, trimmed);
    setEditingWordId(null);
  }

  const selectedWord =
    selectedWordId && !deletedWords.has(selectedWordId)
      ? wordMap.get(selectedWordId) ?? null
      : null;
  const selectedNeedsApproval = selectedWord
    ? needsWordApproval(selectedWord, editedWords, acceptedWords, deletedWords)
    : false;
  const aspect = page.width / Math.max(1, page.height);
  const fitWidth = viewport
    ? Math.max(220, Math.floor(Math.min(viewport.w, viewport.h * aspect)))
    : null;
  const sheetWidth = fitWidth ? Math.round((fitWidth * zoom) / 100) : null;

  const flaggedCount = useMemo(
    () =>
      page.words.filter(w => needsWordApproval(w, editedWords, acceptedWords, deletedWords)).length,
    [page.words, editedWords, acceptedWords, deletedWords],
  );

  return (
    <section
      aria-label={t("transcriptionPaneLabel")}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface"
    >
      {/* Clean h-10 header bar matching ScanCanvas */}
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border px-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {onBackToScan && (
            <Button
              size="sm"
              tone="main-outline"
              className="h-7 shrink-0 px-2 text-[11px] whitespace-nowrap"
              onClick={onBackToScan}
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              Wróć do skanu
            </Button>
          )}
          {!readOnly && (
            <>
              <Button
                size="sm"
                tone={flaggedCount > 0 ? "danger-outline" : "ghost"}
                disabled={flaggedCount === 0}
                className="h-7 shrink-0 px-2 text-[11px] whitespace-nowrap"
                onClick={onJumpNextUncertain}
                title="Przejdź do kolejnego błędnego / czerwonego słowa (Alt+N)"
              >
                <span>
                  {flaggedCount > 0
                    ? `Kolejne do sprawdzenia (${flaggedCount})`
                    : "Wszystkie sprawdzone"}
                </span>
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Button>
              {selectedWord && selectedNeedsApproval && editingWordId !== selectedWord.id && (
                <button
                  type="button"
                  onClick={() => onAcceptWord(selectedWord.id)}
                  title="Zatwierdź słowo / zmianę"
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                >
                  <CheckLg aria-hidden="true" className="size-3.5" />
                  <span>Zatwierdź</span>
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {readOnly ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle aria-hidden="true" className="size-3.5" />
              Zatwierdzono
            </span>
          ) : (
            <>
              <IconButton
                tone="ghost"
                label={t("editWord")}
                disabled={!selectedWord || editingWordId === selectedWord.id}
                onClick={() => selectedWord && beginEdit(selectedWord)}
              >
                <PencilSquare aria-hidden="true" className="size-3.5" />
              </IconButton>
              <IconButton
                tone="ghost"
                label="Usuń słowo (Delete)"
                disabled={!selectedWord || editingWordId === selectedWord.id}
                onClick={() => selectedWord && onDeleteWord(selectedWord.id)}
                className="text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
              >
                <Trash aria-hidden="true" className="size-3.5" />
              </IconButton>
              <IconButton
                tone="ghost"
                label="Cofnij (Ctrl+Z)"
                disabled={!canUndo}
                onClick={onUndo}
              >
                <ArrowCounterclockwise aria-hidden="true" className="size-3.5" />
              </IconButton>
              {onConfirmDocument && (
                <Button
                  size="sm"
                  tone="primary"
                  disabled={confirmDisabled}
                  title={confirmDisabled ? confirmDisabledReason : undefined}
                  className="ml-1 h-7 shrink-0 px-2.5 text-[11px] whitespace-nowrap"
                  onClick={onConfirmDocument}
                >
                  <CheckCircle aria-hidden="true" className="size-3.5" />
                  {t("confirmButton")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* 1:1 Spatial Document Reproduction Canvas (exact same fit-to-height sizing as ScanCanvas) */}
      <div
        ref={sheetContainerRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-neutral-950/5 p-2 dark:bg-neutral-950/40"
      >
        {page.words.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("noBodyWords")}</p>
        ) : (
          <div
            className="relative m-auto shrink-0 overflow-hidden rounded-xs border border-neutral-300 bg-white text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            style={
              sheetWidth
                ? {
                    containerType: "inline-size",
                    width: `${sheetWidth}px`,
                    aspectRatio: `${page.width} / ${page.height}`,
                  }
                : {
                    containerType: "inline-size",
                    width: `${zoom}%`,
                    maxWidth: `${Math.round((page.width * zoom) / 100)}px`,
                    aspectRatio: `${page.width} / ${page.height}`,
                  }
            }
          >
            {alignedLines.map(line => {
              const [lx, ly, lw, lh] = line.bbox;
              const leftPct = (lx / page.width) * 100;
              const topPct = (ly / page.height) * 100;
              const minHeightPct = (lh / page.height) * 100;
              const maxWidthPct = Math.max((lw / page.width) * 100, 100 - leftPct);

              return (
                <div
                  key={line.lineId}
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    minHeight: `${minHeightPct}%`,
                    maxWidth: `${maxWidthPct}%`,
                    fontSize: `clamp(5px, ${line.fontCqw}cqw, 22px)`,
                    lineHeight: 1.08,
                    transform:
                      Math.abs(line.angleDeg) >= 1.5
                        ? `rotate(${line.angleDeg}deg)`
                        : undefined,
                    transformOrigin: "left center",
                  }}
                  className="absolute flex flex-nowrap items-baseline gap-x-[0.28em] whitespace-nowrap"
                >
                  {line.words.map(word => {
                    if (deletedWords.has(word.id)) return null;
                    const displayText = getWordDisplayText(word, editedWords);

                    if (readOnly) {
                      return (
                        <span
                          key={word.id}
                          className={`inline-flex items-baseline whitespace-nowrap select-text ${
                            word.zone === "stamp"
                              ? "text-neutral-500 dark:text-neutral-400"
                              : "text-neutral-900 dark:text-neutral-100"
                          }`}
                        >
                          {displayText}
                        </span>
                      );
                    }

                    const isSelected = word.id === selectedWordId;
                    const isFlaggedRed = needsWordApproval(word, editedWords, acceptedWords, deletedWords);

                    if (editingWordId === word.id) {
                      return (
                        <input
                          key={word.id}
                          ref={inputRef}
                          type="text"
                          value={draftValue}
                          aria-label={t("editWordInput", { word: word.text })}
                          onChange={event => setDraftValue(event.target.value)}
                          onBlur={() => commitEdit(word.id)}
                          onKeyDown={event => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitEdit(word.id);
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingWordId(null);
                            }
                          }}
                          style={{
                            width: `${Math.max(draftValue.length + 2, 5)}ch`,
                          }}
                          className="z-30 rounded border-2 border-red-600 bg-white px-1 py-0 font-medium text-neutral-950 shadow-md outline-none dark:bg-neutral-800 dark:text-white"
                        />
                      );
                    }

                    const stateClasses = isSelected
                      ? isFlaggedRed
                        ? "z-20 rounded-xs border-2 border-red-600 bg-red-500/25 px-0.5 font-semibold text-red-950 ring-2 ring-red-600/35 dark:text-red-100"
                        : "z-20 rounded-xs border-2 border-blue-600 bg-blue-500/20 px-0.5 font-semibold text-blue-950 ring-2 ring-blue-600/35 dark:text-blue-100"
                      : isFlaggedRed
                        ? "z-10 rounded-xs border border-red-600 bg-red-500/18 px-0.5 font-medium text-red-950 dark:border-red-500 dark:bg-red-500/25 dark:text-red-100"
                        : word.zone === "stamp"
                          ? "text-neutral-500 dark:text-neutral-400"
                          : "text-neutral-900 dark:text-neutral-100";

                    return (
                      <button
                        key={word.id}
                        type="button"
                        data-word-token={word.id}
                        onClick={() => handleClickWord(word)}
                        onDoubleClick={() => beginEdit(word)}
                        title={`${displayText} (${Math.round(word.confidence * 100)}%)`}
                        className={`inline-flex cursor-pointer items-baseline text-left whitespace-nowrap outline-none focus:outline-none select-none ${stateClasses}`}
                      >
                        <span>{displayText}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
