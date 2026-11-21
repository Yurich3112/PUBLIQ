"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ExclamationTriangle, PencilSquare } from "react-bootstrap-icons";
import type { OcrPage, OcrWord } from "@/schemas/ocr";
import { Button, Input } from "@/ui/basic";
import { getWordDisplayText, isWordUncertain } from "./ocr-helpers";

export function TranscriptionPane({
  page,
  zoom,
  receivedDate,
  registryNumber,
  selectedWordId,
  editedWords,
  onReceivedDateChange,
  onRegistryNumberChange,
  onSelectWord,
  onEditWord,
  onJumpNextUncertain,
}: {
  page: OcrPage;
  zoom: number;
  receivedDate: string;
  registryNumber: string;
  selectedWordId: string | null;
  editedWords: Readonly<Record<string, string>>;
  onReceivedDateChange: (value: string) => void;
  onRegistryNumberChange: (value: string) => void;
  onSelectWord: (word: OcrWord) => void;
  onEditWord: (wordId: string, nextText: string) => void;
  onJumpNextUncertain: () => void;
}) {
  const t = useTranslations("ocr");
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetContainerRef = useRef<HTMLDivElement>(null);

  const wordMap = new Map(page.words.map(word => [word.id, word]));

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
        onJumpNextUncertain();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onJumpNextUncertain]);

  function handleClickWord(word: OcrWord) {
    onSelectWord(word);
    setEditingWordId(word.id);
    setDraftValue(getWordDisplayText(word, editedWords));
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">{t("transcriptionTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("transcriptionHint")}</p>
        </div>
        <Button size="sm" tone="main-outline" onClick={onJumpNextUncertain}>
          <ExclamationTriangle aria-hidden="true" className="size-3.5 text-red-600" />
          {t("nextUncertain")}
        </Button>
      </div>

      {/* Kancelaria stamp metadata chips */}
      <div className="grid grid-cols-1 gap-3 border-b border-border bg-blue-500/5 px-4 py-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-blue-900 dark:text-blue-200">
            {t("stamp.receivedDate")}
          </span>
          <Input
            type="date"
            value={receivedDate}
            onChange={event => onReceivedDateChange(event.target.value)}
            aria-label={t("stamp.receivedDate")}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-blue-900 dark:text-blue-200">
            {t("stamp.registryNumber")}
          </span>
          <Input
            type="text"
            value={registryNumber}
            placeholder="3468/2026"
            onChange={event => onRegistryNumberChange(event.target.value)}
            aria-label={t("stamp.registryNumber")}
          />
        </label>
      </div>

      {/* Selected word inspector bar */}
      {selectedWord && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t("inspector.selected")}:</span>
            <code className="rounded bg-background px-1.5 py-0.5 font-mono">
              {getWordDisplayText(selectedWord, editedWords)}
            </code>
            <span className="text-muted-foreground">
              ({t("inspector.original")}: {selectedWord.text} ·{" "}
              {Math.round(selectedWord.confidence * 100)}%)
            </span>
          </div>
          {editingWordId !== selectedWord.id && (
            <Button size="sm" tone="ghost" onClick={() => handleClickWord(selectedWord)}>
              <PencilSquare aria-hidden="true" className="size-3.5" />
              {t("editWord")}
            </Button>
          )}
        </div>
      )}

      {/* 1:1 Spatial Document Reproduction Canvas */}
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
            {page.words.map(word => {
              const [x, y, w, h] = word.bbox;
              const leftPct = (x / page.width) * 100;
              const topPct = (y / page.height) * 100;
              const widthPct = (w / page.width) * 100;
              const heightPct = (h / page.height) * 100;
              const fontCqw = Math.max(0.85, Math.min(2.6, ((h * 0.52) / page.width) * 100));

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
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      minWidth: `${Math.max(widthPct, 8)}%`,
                      minHeight: `${heightPct}%`,
                      fontSize: `clamp(11px, ${fontCqw}cqw, 22px)`,
                    }}
                    className="absolute z-30 rounded border-2 border-blue-600 bg-white px-1.5 py-0.5 font-medium text-neutral-950 shadow-lg outline-none dark:bg-neutral-800 dark:text-white"
                  />
                );
              }

              const stateClasses = isSelected
                ? "z-20 rounded-xs border-2 border-blue-600 bg-blue-500/20 px-0.5 font-semibold text-blue-950 ring-2 ring-blue-600/40 dark:text-blue-100"
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
                  title={`${displayText} (${Math.round(word.confidence * 100)}%)`}
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    minWidth: `${widthPct}%`,
                    minHeight: `${heightPct}%`,
                    fontSize: `clamp(9px, ${fontCqw}cqw, 22px)`,
                    lineHeight: 1.05,
                  }}
                  className={`absolute flex cursor-pointer items-center text-left whitespace-nowrap transition-shadow select-none ${stateClasses}`}
                >
                  <span>{displayText}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
