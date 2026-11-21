"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ClipboardCheck, Download, X } from "react-bootstrap-icons";
import { Button, IconButton, Textarea } from "@/ui/basic";

export function ClarificationDraftModal({
  open,
  initialDraft,
  onClose,
}: {
  open: boolean;
  initialDraft: string;
  onClose: () => void;
}) {
  const t = useTranslations("ocr.clarification");
  const [draft, setDraft] = useState(initialDraft);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleCopy() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Wezwanie-do-uzupelnienia-UDIP-7dni.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clarification-draft-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
    >
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 id="clarification-draft-title" className="text-base font-semibold">
              {t("title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
          <IconButton label={t("close")} tone="ghost" onClick={onClose}>
            <X aria-hidden="true" className="size-5" />
          </IconButton>
        </div>

        <div className="p-5">
          <Textarea
            rows={16}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            aria-label={t("editorLabel")}
            className="w-full font-mono text-xs leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button tone="ghost" onClick={onClose}>
            {t("close")}
          </Button>
          <Button tone="main-outline" onClick={() => void handleCopy()}>
            <ClipboardCheck aria-hidden="true" className="size-4" />
            {copied ? t("copied") : t("copy")}
          </Button>
          <Button tone="primary" onClick={handleDownload}>
            <Download aria-hidden="true" className="size-4" />
            {t("downloadTxt")}
          </Button>
        </div>
      </div>
    </div>
  );
}
