"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircleFill,
  ClipboardCheck,
  Download,
  FileEarmarkPdf,
  FileEarmarkText,
  Paperclip,
  XLg,
} from "react-bootstrap-icons";
import { Button } from "@/ui/basic";

export interface DepartmentDocPreviewData {
  caseUuid?: string;
  caseNumber: string;
  departmentName: string;
  replyFileName: string | null;
  replyText: string | null;
  repliedAt?: string | null;
  previewUrl?: string | null;
  previewMime?: string | null;
}

export function DepartmentDocPreviewModal({
  doc,
  polish,
  onClose,
}: {
  doc: DepartmentDocPreviewData | null;
  polish: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [serverPdfAvailable, setServerPdfAvailable] = useState(false);

  const serverPdfUrl = doc?.caseUuid ? `/api/v1/cases/${doc.caseUuid}/preview` : null;

  useEffect(() => {
    if (!doc) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, onClose]);

  useEffect(() => {
    if (!doc || doc.previewUrl || !serverPdfUrl) return;
    const controller = new AbortController();
    async function checkPdf() {
      try {
        const res = await fetch(serverPdfUrl!, {
          method: "HEAD",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setServerPdfAvailable(res.ok);
        }
      } catch {
        if (!controller.signal.aborted) {
          setServerPdfAvailable(false);
        }
      }
    }
    void checkPdf();
    return () => {
      controller.abort();
      setServerPdfAvailable(false);
    };
  }, [doc, serverPdfUrl]);

  if (!doc || typeof document === "undefined") return null;

  const activePdfUrl =
    doc.previewUrl &&
    (doc.previewMime === "application/pdf" || doc.replyFileName?.toLowerCase().endsWith(".pdf"))
      ? doc.previewUrl
      : serverPdfAvailable
        ? serverPdfUrl
        : null;

  const isImageBlob = Boolean(doc.previewUrl && doc.previewMime?.startsWith("image/"));

  async function handleCopy() {
    if (!doc?.replyText) return;
    await navigator.clipboard.writeText(doc.replyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleDownload() {
    if (!doc) return;
    const directUrl = activePdfUrl || doc.previewUrl;
    if (directUrl) {
      const a = document.createElement("a");
      a.href = directUrl;
      a.download = doc.replyFileName || `odpowiedz_${doc.caseNumber}.pdf`;
      a.click();
      return;
    }
    const content = [
      `Znak sprawy: ${doc.caseNumber}`,
      `Wydział: ${doc.departmentName}`,
      doc.replyFileName ? `Załącznik: ${doc.replyFileName}` : null,
      doc.repliedAt ? `Data odpowiedzi: ${doc.repliedAt.slice(0, 10)}` : null,
      "",
      doc.replyText || "",
    ]
      .filter(line => line !== null)
      .join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.replyFileName ? doc.replyFileName.replace(/\.[^.]+$/, "") : doc.departmentName}_${doc.caseNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dept-doc-preview-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        {/* Window Header */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface px-5 py-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              {activePdfUrl ? (
                <FileEarmarkPdf aria-hidden="true" className="size-4 shrink-0 text-red-600" />
              ) : (
                <FileEarmarkText aria-hidden="true" className="size-4 shrink-0 text-primary" />
              )}
              <h2 id="dept-doc-preview-title" className="truncate text-sm font-semibold text-foreground">
                {doc.replyFileName || (polish ? "Odpowiedź merytoryczna wydziału" : "Department Reply Document")}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircleFill aria-hidden="true" className="size-2.5" />
                {polish ? "Odpowiedź wydziału" : "Department Reply"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{doc.departmentName}</strong> ·{" "}
              <span className="font-mono">{doc.caseNumber}</span>
              {doc.repliedAt && <span> · {doc.repliedAt.slice(0, 10)}</span>}
            </p>
          </div>

          <button
            type="button"
            aria-label={polish ? "Zamknij podgląd" : "Close preview"}
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XLg aria-hidden="true" className="size-4" />
          </button>
        </header>

        {/* Document Preview Surface */}
        <div className="min-h-0 flex-1 overflow-auto bg-neutral-950/8 p-4 dark:bg-neutral-950/50">
          {activePdfUrl ? (
            <iframe
              src={activePdfUrl}
              title={doc.replyFileName || doc.departmentName}
              className="h-[74vh] w-full rounded-lg border border-border bg-white shadow-sm"
            />
          ) : isImageBlob && doc.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.previewUrl}
              alt={doc.replyFileName || doc.departmentName}
              className="mx-auto max-h-[74vh] rounded-lg border border-border bg-white object-contain shadow-sm"
            />
          ) : (
            <article className="mx-auto max-w-2xl space-y-4 rounded-lg border border-border bg-white p-6 text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100">
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 text-xs">
                <div>
                  <p className="font-semibold uppercase tracking-wide text-primary">
                    Urząd Miasta Bydgoszczy
                  </p>
                  <p className="font-semibold text-foreground">{doc.departmentName}</p>
                </div>
                <div className="text-right font-mono text-[11px] text-muted-foreground">
                  <p>{doc.caseNumber}</p>
                  {doc.repliedAt && <p>{doc.repliedAt.slice(0, 10)}</p>}
                </div>
              </div>

              {doc.replyFileName && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                  <Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                  <span className="font-mono font-medium text-foreground">{doc.replyFileName}</span>
                </div>
              )}

              <div className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                {doc.replyText ||
                  (polish
                    ? "Załącznik przesłany przez wydział merytoryczny. Brak dodatkowej treści tekstowej w wiadomości."
                    : "Attachment submitted by the department. No additional plain-text body recorded.")}
              </div>
            </article>
          )}
        </div>

        {/* Modal Footer Actions */}
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-5 py-2.5">
          <span className="text-[11px] text-muted-foreground">
            {polish
              ? "Podgląd dokumentu źródłowego przekazanego przez wydział (ESC aby zamknąć)."
              : "Source department document preview (press ESC to close)."}
          </span>
          <div className="flex items-center gap-2">
            {doc.replyText && (
              <Button size="sm" tone="main-outline" onClick={() => void handleCopy()}>
                <ClipboardCheck aria-hidden="true" className="size-3.5" />
                {copied ? (polish ? "Skopiowano" : "Copied") : (polish ? "Kopiuj treść" : "Copy text")}
              </Button>
            )}
            <Button size="sm" tone="primary" onClick={handleDownload}>
              <Download aria-hidden="true" className="size-3.5" />
              {polish ? "Pobierz" : "Download"}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
