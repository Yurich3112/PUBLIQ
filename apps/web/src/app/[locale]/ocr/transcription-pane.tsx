"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExclamationTriangle, PencilSquare } from "react-bootstrap-icons";
import type { OcrLine, OcrPage, OcrWord } from "@/schemas/ocr";
import { Button } from "@/ui/basic";
import { getWordDisplayText, isWordUncertain } from "./ocr-helpers";

interface RenderedLineGroup {
  lineId: string;
  zone: OcrLine["zone"];
  bbox: readonly [number, number, number, number];
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
    const charCount =
      words.reduce((sum, w) => sum + getWordDisplayText(w, editedWords).length, 0)
      + Math.max(0, words.length - 1);
    const lineWidthPct = (line.bbox[2] / page.width) * 100;
    const widthFitCqw =
      words.length >= 3 && charCount >= 12
        ? lineWidthPct / (charCount * 0.54)
        : ((medH * 0.56) / page.width) * 100;
    const heightFitCqw = ((medH * 0.56) / page.width) * 100;

    rawGroups.push({
      lineId: line.line_id,
      zone: line.zone,
      bbox: line.bbox,
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
      words: [orphan],
      medWordH: h,
      fitCqw: ((h * 0.56) / page.width) * 100,
    });
  }

  // Compute uniform body font size so all standard paragraph lines look clean and consistent.
  const bodyGroups = rawGroups.filter(g => g.zone !== "stamp");
  const pageMedWordH = median(bodyGroups.map(g => g.medWordH)) || 28;
  const standardBodyFits = bodyGroups
    .filter(g => g.medWordH >= pageMedWordH * 0.72 && g.medWordH <= pageMedWordH * 1.32)
    .map(g => g.fitCqw);
  const uniformBodyCqw = Math.max(
    0.85,
    Math.min(2.2, median(standardBodyFits) || ((pageMedWordH * 0.54) / page.width) * 100),
  );

  return rawGroups.map(group => {
    const ratio = group.medWordH / pageMedWordH;
    const fontCqw =
      group.zone !== "stamp" && ratio >= 0.72 && ratio <= 1.32
        ? uniformBodyCqw
        : Math.max(0.72, Math.min(2.5, uniformBodyCqw * Math.max(0.65, Math.min(1.35, ratio))));
    return {
      lineId: group.lineId,
      zone: group.zone,
      bbox: group.bbox,
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
  onSelectWord,
  onEditWord,
  onJumpNextUncertain,
  onStepWord,
}: {
  page: OcrPage;
  zoom: number;
  selectedWordId: string | null;
  editedWords: Readonly<Record<string, string>>;
  onSelectWord: (word: OcrWord) => void;
  onEditWord: (wordId: string, nextText: string) => void;
  onJumpNextUncertain: () => void;
  onStepWord: (direction: 1 | -1) => void;
}) {
  const t = useTranslations("ocr");
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetContainerRef = useRef<HTMLDivElement>(null);

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

      if (event.key === "ArrowRight") {
        event.preventDefault();
        onStepWord(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onStepWord(-1);
      } else if (event.key === "Enter" && selectedWordId) {
        const current = wordMap.get(selectedWordId);
        if (current) {
          event.preventDefault();
          setEditingWordId(current.id);
          setDraftValue(getWordDisplayText(current, editedWords));
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    onJumpNextUncertain,
    onStepWord,
    editingWordId,
    selectedWordId,
    wordMap,
    editedWords,
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

  const selectedWord = selectedWordId ? wordMap.get(selectedWordId) ?? null : null;

  return (
    <section
      aria-label={t("transcriptionPaneLabel")}
      className="flex min-h-[520px] flex-col rounded-xl border border-border bg-surface"
    >
      {/* Fixed min-h-12 header bar matching ScanCanvas so both document sheets sit at the exact same Y level */}
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <h2 className="font-semibold text-foreground">{t("transcriptionTitle")}</h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block size-2.5 rounded-xs border-2 border-red-600 bg-red-500/25" />
            {t("legend.low")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block size-2.5 rounded-xs border-2 border-blue-600 bg-blue-500/25" />
            {t("inspector.selected")}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {selectedWord && editingWordId !== selectedWord.id && (
            <Button size="sm" tone="ghost" onClick={() => beginEdit(selectedWord)}>
              <PencilSquare aria-hidden="true" className="size-3.5" />
              {t("editWord")}
            </Button>
          )}
          <Button size="sm" tone="main-outline" onClick={onJumpNextUncertain}>
            <ExclamationTriangle aria-hidden="true" className="size-3.5 text-red-600" />
            {t("nextUncertain")}
          </Button>
        </div>
      </div>

      {/* 1:1 Spatial Document Reproduction Canvas (same padding, width, and aspect-ratio as ScanCanvas) */}
      <div
        ref={sheetContainerRef}
        className="flex-1 overflow-auto bg-neutral-950/5 p-4 dark:bg-neutral-950/40"
      >
        {page.words.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("noBodyWords")}</p>
        ) : (
          <div
            className="relative mx-auto overflow-hidden rounded-xs border border-neutral-300 bg-white text-neutral-900 shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            style={{
              containerType: "inline-size",
              width: `${zoom}%`,
              maxWidth: `${Math.round((page.width * zoom) / 100)}px`,
              aspectRatio: `${page.width} / ${page.height}`,
            }}
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
                    fontSize: `clamp(9px, ${line.fontCqw}cqw, 22px)`,
                    lineHeight: 1.15,
                  }}
                  className="absolute flex flex-wrap items-baseline gap-x-[0.32em] gap-y-0.5"
                >
                  {line.words.map(word => {
                    const isSelected = word.id === selectedWordId;
                    const isLowConfidenceUnedited = isWordUncertain(word, editedWords);
                    const displayText = getWordDisplayText(word, editedWords);

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
                          className="z-30 rounded border-2 border-blue-600 bg-white px-1 py-0 font-medium text-neutral-950 shadow-md outline-none dark:bg-neutral-800 dark:text-white"
                        />
                      );
                    }

                    const stateClasses = isSelected
                      ? "z-20 rounded-xs border-2 border-blue-600 bg-blue-500/20 px-0.5 font-semibold text-blue-950 ring-2 ring-blue-600/35 dark:text-blue-100"
                      : isLowConfidenceUnedited
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
