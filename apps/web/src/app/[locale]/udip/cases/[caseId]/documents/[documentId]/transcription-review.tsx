"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { udipDocumentDetailSchema, udipMaxTextChars } from "@/schemas/udip";

type Document = z.infer<typeof udipDocumentDetailSchema>;
const responseSchema = z.object({ document: udipDocumentDetailSchema });

const copy = {
  pl: {
    original: "Oryginał dokumentu", download: "Pobierz oryginał", previewError: "Nie można wyświetlić podglądu.",
    transcription: "Transkrypcja", ocr: "Ponów OCR", save: "Zapisz transkrypcję", revision: "Wersja",
    ocrUnavailable: "OCR jest niedostępny. Możesz przepisać dokument ręcznie.",
    conflict: "Dokument zmienił się. Skopiuj swoje poprawki i odśwież stronę.",
    failed: "Nie udało się zapisać transkrypcji.", saved: "Zapisano transkrypcję.",
    read: "Wczytano odczyt OCR. Możesz go poprawić.", working: "Trwa przetwarzanie…",
  },
  en: {
    original: "Original document", download: "Download original", previewError: "The preview could not be displayed.",
    transcription: "Transcription", ocr: "Retry OCR", save: "Save transcription", revision: "Revision",
    ocrUnavailable: "OCR is unavailable. You can transcribe the document manually.",
    conflict: "The document changed. Copy your edits and reload the page.",
    failed: "The transcription could not be saved.", saved: "Transcription saved.",
    read: "OCR text loaded. You can edit it.", working: "Processing…",
  },
};

function OriginalPreview({ url, pdf, labels }: { url: string; pdf: boolean; labels: typeof copy.pl }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!pdf) return;
    const request = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const response = await fetch(url, { cache: "no-store", signal: request.signal });
        if (!response.ok) throw new Error("Original unavailable");
        const bytes = await response.arrayBuffer();
        if (request.signal.aborted) return;
        if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Invalid PDF");
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setPreview(objectUrl);
      } catch {
        if (!request.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => {
      request.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdf, url]);

  return (
    <section className="min-w-0 space-y-2">
      <h2 className="text-lg font-semibold">{labels.original}</h2>
      <a className="underline" href={url}>{labels.download}</a>
      {preview && <iframe className="min-h-[65vh] w-full rounded border" src={preview} title={labels.original} />}
      {failed && <p role="status">{labels.previewError}</p>}
    </section>
  );
}

export function TranscriptionReview({ document, endpoint, polish }: { document: Document; endpoint: string; polish: boolean }) {
  const labels = polish ? copy.pl : copy.en;
  const [current, setCurrent] = useState(document);
  const [text, setText] = useState(document.extractedText ?? "");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const pdf = current.mediaType === "application/pdf";
  const edited = text !== (current.extractedText ?? "");

  async function update(operation: "save" | "ocr") {
    setWorking(true);
    setMessage("");
    try {
      const saving = operation === "save";
      const response = await fetch(saving ? endpoint : `${endpoint}/ocr`, saving ? {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, expectedRevision: current.textRevision }),
      } : { method: "POST" });
      if (response.status === 409) {
        setMessage(labels.conflict);
        return;
      }
      if (!response.ok) throw new Error("Document update failed");
      const result = responseSchema.parse(await response.json());
      setCurrent(result.document);
      setText(result.document.extractedText ?? "");
      setMessage(saving ? labels.saved : labels.read);
    } catch {
      setMessage(operation === "save" ? labels.failed : labels.ocrUnavailable);
    } finally {
      setWorking(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!working && edited && text.trim()) void update("save");
  }

  return (
    <main className="mx-auto max-w-screen-2xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">{current.fileName ?? labels.transcription}</h1>
      <div className={current.fileName ? "grid gap-6 lg:grid-cols-2" : "max-w-4xl"}>
        {current.fileName && <OriginalPreview url={`${endpoint}/original`} pdf={pdf} labels={labels} />}
        <form onSubmit={save} className="min-w-0 space-y-2" aria-busy={working}>
          <label htmlFor="udip-transcription" className="block text-lg font-semibold">{labels.transcription}</label>
          <p>{labels.revision} {current.textRevision}</p>
          <textarea id="udip-transcription" className="min-h-[55vh] w-full rounded border bg-transparent p-3"
            value={text} maxLength={udipMaxTextChars} disabled={working} required
            onChange={event => setText(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button className="rounded border px-3 py-2 disabled:opacity-50" type="submit"
              disabled={working || !edited || !text.trim()}>{labels.save}</button>
            {pdf && current.status === "failed" && (
              <button className="rounded border px-3 py-2 disabled:opacity-50" type="button" disabled={working || edited}
                onClick={() => void update("ocr")}>{labels.ocr}</button>
            )}
          </div>
          <p role="status">{working ? labels.working : message}</p>
        </form>
      </div>
    </main>
  );
}
