"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "react-bootstrap-icons";
import type { OcrPage, OcrWord } from "@/schemas/ocr";
import { Button, IconButton } from "@/ui/basic";
import { getWordDisplayText, isWordUncertain } from "./ocr-helpers";

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;

export function ScanCanvas({
  page,
  pageCount,
  zoom,
  onZoomChange,
  onPageChange,
  selectedWordId,
  editedWords,
  onSelectWord,
}: {
  page: OcrPage;
  pageCount: number;
  zoom: number;
  onZoomChange: (next: number) => void;
  onPageChange: (nextIndex: number) => void;
  selectedWordId: string | null;
  editedWords: Readonly<Record<string, string>>;
  onSelectWord: (word: OcrWord) => void;
}) {
  const t = useTranslations("ocr");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedWordId || !containerRef.current) return;
    const target = containerRef.current.querySelector<SVGRectElement>(
      `[data-word-box="${CSS.escape(selectedWordId)}"]`,
    );
    if (target) {
      target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, [selectedWordId]);

  const zoomIdx = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
  const canZoomOut = zoomIdx > 0;
  const canZoomIn = zoomIdx !== -1 && zoomIdx < ZOOM_STEPS.length - 1;

  return (
    <section aria-label={t("scanPaneLabel")} className="flex min-h-[520px] flex-col rounded-xl border border-border bg-surface">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>{t("pageIndicator", { current: page.page_index + 1, total: pageCount })}</span>
          {page.grid_removed && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
              {t("gridErasedBadge")}
            </span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
            {t(`sourceMode.${page.source_mode}`)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {pageCount > 1 && (
            <div className="mr-2 flex items-center gap-1">
              <IconButton
                tone="main-outline"
                label={t("prevPage")}
                disabled={page.page_index <= 0}
                onClick={() => onPageChange(page.page_index - 1)}
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </IconButton>
              <IconButton
                tone="main-outline"
                label={t("nextPage")}
                disabled={page.page_index >= pageCount - 1}
                onClick={() => onPageChange(page.page_index + 1)}
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </IconButton>
            </div>
          )}
          <IconButton
            tone="main-outline"
            label={t("zoomOut")}
            disabled={!canZoomOut}
            onClick={() => canZoomOut && onZoomChange(ZOOM_STEPS[zoomIdx - 1])}
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </IconButton>
          <Button
            size="sm"
            tone="ghost"
            onClick={() => onZoomChange(100)}
            title={t("resetZoom")}
            className="min-w-[54px] tabular-nums"
          >
            {zoom}%
          </Button>
          <IconButton
            tone="main-outline"
            label={t("zoomIn")}
            disabled={!canZoomIn}
            onClick={() => canZoomIn && onZoomChange(ZOOM_STEPS[zoomIdx + 1])}
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </IconButton>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-950/5 p-4 dark:bg-neutral-950/40">
        <div
          className="relative mx-auto shadow-md"
          style={{
            width: `${zoom}%`,
            maxWidth: `${Math.round((page.width * zoom) / 100)}px`,
            aspectRatio: `${page.width} / ${page.height}`,
          }}
        >
          {page.preview_image_data_url ? (
            // Preview is an in-memory base64 data URL rendered directly from the OCR response.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.preview_image_data_url}
              alt={t("scanAlt", { page: page.page_index + 1 })}
              className="block size-full select-none rounded-xs bg-white object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex size-full items-center justify-center rounded-xs bg-white text-sm text-muted-foreground">
              {t("noPreviewImage")}
            </div>
          )}

          <svg
            viewBox={`0 0 ${page.width} ${page.height}`}
            preserveAspectRatio="none"
            aria-label={t("overlayAriaLabel")}
            className="absolute inset-0 size-full"
          >
            {page.words.map(word => {
              const [x, y, w, h] = word.bbox;
              const isSelected = word.id === selectedWordId;
              const isLowConfidenceUnedited = isWordUncertain(word, editedWords);
              const displayText = getWordDisplayText(word, editedWords);

              const fill = isSelected
                ? "rgba(37, 99, 235, 0.26)"
                : isLowConfidenceUnedited
                  ? "rgba(239, 68, 68, 0.20)"
                  : "transparent";
              const stroke = isSelected
                ? "#1d4ed8"
                : isLowConfidenceUnedited
                  ? "#dc2626"
                  : "transparent";
              const strokeWidth = isSelected ? 3.5 : isLowConfidenceUnedited ? 2.5 : 0;

              return (
                <g key={word.id}>
                  <rect
                    data-word-box={word.id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={3}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    vectorEffect="non-scaling-stroke"
                    className="cursor-pointer"
                    onClick={() => onSelectWord(word)}
                  >
                    <title>{`${displayText} (${Math.round(word.confidence * 100)}%)`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
