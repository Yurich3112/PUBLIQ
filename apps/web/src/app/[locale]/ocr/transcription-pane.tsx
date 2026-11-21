"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check2Circle, ExclamationTriangle, PencilSquare } from "react-bootstrap-icons";
import type { OcrPage, OcrWord } from "@/schemas/ocr";
import { Button, Input } from "@/ui/basic";
import { getWordDisplayText, getWordTier, type ConfidenceTier } from "./ocr-helpers";

const chipStyles: Record<ConfidenceTier, string> = {
  high: "border-emerald-600/40 bg-emerald-500/10 text-foreground hover:border-emerald-600",
  verified: "border-teal-600/60 bg-teal-500/15 text-foreground font-medium",
  medium: "border-dashed border-amber-600 bg-amber-500/15 text-foreground hover:bg-amber-500/25",
  low: "border-2 border-red-600 bg-red-500/15 text-foreground hover:bg-red-500/25",
  stamp: "border-dotted border-blue-600/60 bg-blue-500/10 text-blue-900 dark:text-blue-200",
};

export function TranscriptionPane({
  page,
  receivedDate,
  registryNumber,
  rawStampLines,
  hoveredWordId,
  selectedWordId,
  editedWords,
  onReceivedDateChange,
  onRegistryNumberChange,
  onHoverWord,
  onSelectWord,
  onEditWord,
  onJumpNextUncertain,
}: {
  page: OcrPage;
  receivedDate: string;
  registryNumber: string;
  rawStampLines: readonly string[];
  hoveredWordId: string | null;
  selectedWordId: string | null;
  editedWords: Readonly<Record<string, string>>;
  onReceivedDateChange: (value: string) => void;
  onRegistryNumberChange: (value: string) => void;
  onHoverWord: (wordId: string | null) => void;
  onSelectWord: (word: OcrWord) => void;
  onEditWord: (wordId: string, nextText: string) => void;
  onJumpNextUncertain: () => void;
}) {
  const t = useTranslations("ocr");
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [showStampLines, setShowStampLines] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const wordMap = new Map(page.words.map(word => [word.id, word]));
  const bodyLines = page.lines.filter(line => line.zone !== "stamp");
  const stampLines = page.lines.filter(line => line.zone === "stamp");

  useEffect(() => {
    if (editingWordId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingWordId]);

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

  function beginEdit(word: OcrWord) {
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
    <section aria-label={t("transcriptionPaneLabel")} className="flex min-h-[520px] flex-col rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 className="text-sm font-semibold">{t("transcriptionTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("transcriptionHint")}</p>
        </div>
        <Button size="sm" tone="main-outline" onClick={onJumpNextUncertain}>
          <ExclamationTriangle aria-hidden="true" className="size-3.5 text-amber-600" />
          {t("nextUncertain")}
        </Button>
      </div>

      {/* Kancelaria stamp metadata chips */}
      <div className="grid grid-cols-1 gap-3 border-b border-border bg-blue-500/5 px-4 py-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-blue-900 dark:text-blue-200">{t("stamp.receivedDate")}</span>
          <Input
            type="date"
            value={receivedDate}
            onChange={event => onReceivedDateChange(event.target.value)}
            aria-label={t("stamp.receivedDate")}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-blue-900 dark:text-blue-200">{t("stamp.registryNumber")}</span>
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
              ({t("inspector.original")}: {selectedWord.text} · {Math.round(selectedWord.confidence * 100)}%)
            </span>
          </div>
          {editingWordId !== selectedWord.id && (
            <Button size="sm" tone="ghost" onClick={() => beginEdit(selectedWord)}>
              <PencilSquare aria-hidden="true" className="size-3.5" />
              {t("editWord")}
            </Button>
          )}
        </div>
      )}

      {/* Body lines with 1:1 interactive word tokens */}
      <div className="flex-1 space-y-2.5 overflow-auto p-4">
        {bodyLines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBodyWords")}</p>
        ) : (
          bodyLines.map((line, lineIdx) => (
            <div key={line.line_id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 p-2">
              <span className="mr-1 select-none font-mono text-[11px] text-muted-foreground">
                {lineIdx + 1}.
              </span>
              {line.word_ids.map(wordId => {
                const word = wordMap.get(wordId);
                if (!word) return null;
                const tier = getWordTier(word, editedWords);
                const isActive = word.id === selectedWordId || word.id === hoveredWordId;
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
                      className="min-w-[80px] rounded-md border-2 border-primary bg-background px-2 py-0.5 text-sm font-medium outline-none"
                    />
                  );
                }

                return (
                  <button
                    key={word.id}
                    type="button"
                    data-word-token={word.id}
                    onMouseEnter={() => onHoverWord(word.id)}
                    onMouseLeave={() => onHoverWord(null)}
                    onFocus={() => onHoverWord(word.id)}
                    onBlur={() => onHoverWord(null)}
                    onClick={() => beginEdit(word)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm transition ${chipStyles[tier]} ${
                      isActive ? "ring-2 ring-blue-600 ring-offset-1" : ""
                    }`}
                  >
                    <span>{displayText}</span>
                    {tier === "verified" && (
                      <Check2Circle aria-hidden="true" className="size-3.5 text-teal-700 dark:text-teal-300" />
                    )}
                    {(tier === "medium" || tier === "low") && (
                      <span className="text-[10px] font-semibold opacity-80">
                        {Math.round(word.confidence * 100)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}

        {(stampLines.length > 0 || rawStampLines.length > 0) && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowStampLines(prev => !prev)}
              className="text-xs font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
            >
              {showStampLines ? t("stamp.hideRaw") : t("stamp.showRaw", { count: Math.max(stampLines.length, rawStampLines.length) })}
            </button>
            {showStampLines && (
              <div className="mt-2 space-y-1 rounded-lg border border-blue-500/30 bg-blue-500/5 p-2.5 text-xs text-muted-foreground">
                {stampLines.length > 0
                  ? stampLines.map(line => (
                      <div key={line.line_id} className="flex flex-wrap gap-1">
                        {line.word_ids.map(id => {
                          const w = wordMap.get(id);
                          if (!w) return null;
                          return (
                            <button
                              key={w.id}
                              type="button"
                              onMouseEnter={() => onHoverWord(w.id)}
                              onMouseLeave={() => onHoverWord(null)}
                              onClick={() => onSelectWord(w)}
                              className="rounded border border-dotted border-blue-600/50 px-1.5 py-0.5 text-blue-900 dark:text-blue-200"
                            >
                              {w.text}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  : rawStampLines.map((raw, idx) => <div key={idx}>{raw}</div>)}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
