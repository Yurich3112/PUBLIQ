"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, CloudUpload, ExclamationTriangleFill, ZoomIn, ZoomOut } from "react-bootstrap-icons";
import type { OcrPage, OcrWord } from "@/schemas/ocr";
import { Button, IconButton } from "@/ui/basic";
import { getWordDisplayText, needsWordApproval } from "./ocr-helpers";

const ZOOM_STEPS = [50, 75, 100, 125, 150, 200] as const;

export function ScanCanvas({
  page,
  pageCount,
  zoom,
  onZoomChange,
  onPageChange,
  selectedWordId,
  editedWords,
  acceptedWords,
  deletedWords,
  onSelectWord,
  onUploadAnother,
  onIllegible,
  recommendClarification = false,
  loading = false,
}: {
  page: OcrPage;
  pageCount: number;
  zoom: number;
  onZoomChange: (next: number) => void;
  onPageChange: (nextIndex: number) => void;
  selectedWordId: string | null;
  editedWords: Readonly<Record<string, string>>;
  acceptedWords: ReadonlySet<string>;
  deletedWords: ReadonlySet<string>;
  onSelectWord: (word: OcrWord) => void;
  onUploadAnother?: () => void;
  onIllegible?: () => void;
  recommendClarification?: boolean;
  loading?: boolean;
}) {
  const t = useTranslations("ocr");
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
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

  const aspect = page.width / Math.max(1, page.height);
  const fitWidth = viewport
    ? Math.max(220, Math.floor(Math.min(viewport.w, viewport.h * aspect)))
    : null;
  const sheetWidth = fitWidth ? Math.round((fitWidth * zoom) / 100) : null;

  return (
    <section aria-label={t("scanPaneLabel")} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border px-2.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="shrink-0 whitespace-nowrap">{t("pageIndicator", { current: page.page_index + 1, total: pageCount })}</span>
          {page.grid_removed && (
            <span className="hidden shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 xl:inline-block">
              {t("gridErasedBadge")}
            </span>
          )}
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
            {t(`sourceMode.${page.source_mode}`)}
          </span>
          {onUploadAnother && (
            <Button
              size="sm"
              tone="main-outline"
              disabled={loading}
              onClick={onUploadAnother}
              className="h-7 shrink-0 px-2 text-[11px] whitespace-nowrap"
            >
              <CloudUpload aria-hidden="true" className="size-3.5" />
              {t("uploadAnother")}
            </Button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onIllegible && (
            <Button
              size="sm"
              tone={recommendClarification ? "error" : "danger-outline"}
              onClick={onIllegible}
              title={t("illegibleButton")}
              className="h-7 shrink-0 px-2 text-[11px] whitespace-nowrap"
            >
              <ExclamationTriangleFill aria-hidden="true" className="size-3" />
              Skan nieczytelny
            </Button>
          )}
          {pageCount > 1 && (
            <div className="flex items-center gap-0.5">
              <IconButton
                tone="ghost"
                label={t("prevPage")}
                disabled={page.page_index <= 0}
                onClick={() => onPageChange(page.page_index - 1)}
              >
                <ChevronLeft aria-hidden="true" className="size-3.5" />
              </IconButton>
              <IconButton
                tone="ghost"
                label={t("nextPage")}
                disabled={page.page_index >= pageCount - 1}
                onClick={() => onPageChange(page.page_index + 1)}
              >
                <ChevronRight aria-hidden="true" className="size-3.5" />
              </IconButton>
            </div>
          )}
          <IconButton
            tone="ghost"
            label={t("zoomOut")}
            disabled={!canZoomOut}
            onClick={() => canZoomOut && onZoomChange(ZOOM_STEPS[zoomIdx - 1])}
          >
            <ZoomOut aria-hidden="true" className="size-3.5" />
          </IconButton>
          <Button
            size="sm"
            tone="ghost"
            onClick={() => onZoomChange(100)}
            title={t("resetZoom")}
            className="h-7 min-w-[42px] px-1 text-[11px] tabular-nums"
          >
            {zoom}%
          </Button>
          <IconButton
            tone="ghost"
            label={t("zoomIn")}
            disabled={!canZoomIn}
            onClick={() => canZoomIn && onZoomChange(ZOOM_STEPS[zoomIdx + 1])}
          >
            <ZoomIn aria-hidden="true" className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-neutral-950/5 p-2 dark:bg-neutral-950/40"
      >
        <div
          className="relative m-auto shrink-0 overflow-hidden rounded-xs border border-neutral-300 bg-white shadow-sm dark:border-neutral-700"
          style={
            sheetWidth
              ? { width: `${sheetWidth}px`, aspectRatio: `${page.width} / ${page.height}` }
              : { width: `${zoom}%`, maxWidth: `${Math.round((page.width * zoom) / 100)}px`, aspectRatio: `${page.width} / ${page.height}` }
          }
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
              if (deletedWords.has(word.id)) return null;
              const [x, y, w, h] = word.bbox;
              const angle = word.angle_deg ?? 0;
              const isSelected = word.id === selectedWordId;
              const isFlaggedRed = needsWordApproval(word, editedWords, acceptedWords, deletedWords);
              const displayText = getWordDisplayText(word, editedWords);

              const fill = isSelected
                ? isFlaggedRed
                  ? "rgba(239, 68, 68, 0.30)"
                  : "rgba(37, 99, 235, 0.26)"
                : isFlaggedRed
                  ? "rgba(239, 68, 68, 0.20)"
                  : "transparent";
              const stroke = isSelected
                ? isFlaggedRed
                  ? "#b91c1c"
                  : "#1d4ed8"
                : isFlaggedRed
                  ? "#dc2626"
                  : "transparent";
              const strokeWidth = isSelected ? 3.5 : isFlaggedRed ? 2.5 : 0;
              const transform =
                Math.abs(angle) >= 1.5
                  ? `rotate(${angle} ${x + w / 2} ${y + h / 2})`
                  : undefined;

              return (
                <g key={word.id}>
                  <rect
                    data-word-box={word.id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={3}
                    transform={transform}
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
