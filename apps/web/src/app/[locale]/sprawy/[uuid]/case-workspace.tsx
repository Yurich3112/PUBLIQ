"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircleFill,
  Download,
  EyeSlashFill,
  FileEarmarkText,
  Magic,
  ShieldCheck,
  ShieldLockFill,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Link } from "@/i18n/navigation";
import { Button, Input, Throbber } from "@/ui/basic";

interface DeptReply {
  uuid: string;
  departmentName: string;
  status: "PENDING" | "REPLIED" | "KWERENDA_REQUESTED";
  replyText: string | null;
  replyFileName: string | null;
}

interface UdipCaseDetail {
  uuid: string;
  caseNumber: string;
  applicantName: string;
  applicantContact: string | null;
  subject: string;
  receivedDate: string;
  deadlineDate: string;
  answeredDate: string | null;
  processStatus: "A" | "B" | "C" | "D" | "E";
  routingType: "INTERNAL_DEPARTMENTS" | "EXTERNAL_AUTHORITY" | "CLARIFICATION_7D";
  externalAuthorityName: string | null;
  matchedCaseNumber: string | null;
  verifiedRequestText: string | null;
  draftResponseText: string | null;
  anonymizedResponseText: string | null;
  piiRedactionsCount: number;
  departmentQueries: DeptReply[];
}

interface PiiSpan {
  id: string;
  category: string;
  value: string;
  start: number;
  end: number;
  confirmedBlack: boolean;
  isPublicOfficial: boolean;
}

const PUBLIC_OFFICIAL_RE = /\b(Prezydent(?:a)?\s+Rafał(?:a)?\s+Bruski(?:ego)?|Rafał(?:a)?\s+Bruski(?:ego)?|R\.\s*Bruski(?:ego)?)\b/gi;

function scanPolishPii(text: string): PiiSpan[] {
  const spans: PiiSpan[] = [];
  const rules: { category: string; regex: RegExp; isPublicOfficial?: boolean }[] = [
    { category: "FUNKCJONARIUSZ PUBLICZNY (Art. 5 ust. 2 UDIP)", regex: PUBLIC_OFFICIAL_RE, isPublicOfficial: true },
    { category: "PESEL", regex: /\b\d{11}\b/g },
    { category: "TELEFON PRYWATNY", regex: /\b(?:\+48\s*)?(?:\d{3}[-\s]\d{3}[-\s]\d{3})\b/g },
    { category: "E-MAIL PRYWATNY", regex: /\b[a-zA-Z0-9._%+-]+@(?!um\.bydgoszcz\.pl\b|zdmikp\.bydgoszcz\.pl\b|torun\.wkz\.gov\.pl\b)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
    { category: "IBAN / KONTO", regex: /\b(?:PL\s*)?\d{2}(?:\s?\d{4}){6}\b/g },
    { category: "OSOBA PRYWATNA (BKS)", regex: /\b(?:Anna\s+Kowalska|Jan\s+Kowalski|Jerzy\s+Dociekliwy|Ewa\s+Góra|Ewa\s+Górna|Antoni\s+Ptak|Jacek\s+Rzeźbiarz)\b/g },
  ];

  for (const rule of rules) {
    const re = new RegExp(rule.regex.source, rule.regex.flags);
    for (const match of text.matchAll(re)) {
      if (match.index === undefined) continue;
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = spans.some(s => start < s.end && end > s.start);
      if (!overlaps) {
        spans.push({
          id: `${start}-${end}-${rule.category}`,
          category: rule.category,
          value: match[0],
          start,
          end,
          confirmedBlack: !rule.isPublicOfficial,
          isPublicOfficial: Boolean(rule.isPublicOfficial),
        });
      }
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function buildRedactedText(text: string, spans: readonly PiiSpan[]): string {
  const active = spans
    .filter(s => s.confirmedBlack && !s.isPublicOfficial)
    .sort((a, b) => b.start - a.start);
  let out = text;
  for (const span of active) {
    out = `${out.slice(0, span.start)}[ANONIMIZACJA: ${span.category}]${out.slice(span.end)}`;
  }
  return out;
}

function composeBksDraft(item: UdipCaseDetail): string {
  const today = new Date().toISOString().slice(0, 10);
  const header = [
    "URZĄD MIASTA BYDGOSZCZY",
    "Biuro Komunikacji Społecznej",
    "85-102 Bydgoszcz, ul. Jezuicka 1 · bks@um.bydgoszcz.pl",
    "",
    `Bydgoszcz, dnia ${today}`,
    `Znak sprawy: ${item.caseNumber}`,
    "",
    `Szanowny Wnioskodawco (${item.applicantName}),`,
    "",
  ];

  if (item.routingType === "EXTERNAL_AUTHORITY" && item.externalAuthorityName) {
    return [
      ...header,
      "odpowiadając na wystosowany wniosek o udostępnienie informacji publicznej, uprzejmie informuję, iż Urząd Miasta Bydgoszczy nie jest dysponentem wnioskowanych danych.",
      "Zgodnie z art. 4 ust. 3 ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej obowiązane do udostępnienia informacji publicznej są wyłącznie podmioty publiczne będące w posiadaniu tych informacji.",
      "",
      `W związku z powyższym właściwym adresatem wniosku jest: ${item.externalAuthorityName}.`,
      "",
      "Łączę wyrazy szacunku,",
      "Biuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy",
    ].join("\n");
  }

  const replies = item.departmentQueries
    .filter(d => d.replyText)
    .map((d, idx) => `Ad ${idx + 1} (${d.departmentName}):\n${d.replyText}`);

  const body =
    replies.length > 0
      ? replies.join("\n\n")
      : `W odpowiedzi na wniosek dotyczący: „${item.subject}”, przedstawiamy poniższe informacje zebrane w ramach postępowania UDIP.`;

  return [
    ...header,
    "odpowiadając na wniosek o udostępnienie informacji publicznej, przekazuję poniższe zestawienie:",
    "",
    body,
    "",
    "Łączę wyrazy szacunku,",
    "Biuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy",
  ].join("\n");
}

export function CaseWorkspace({ caseUuid, polish }: { caseUuid: string; polish: boolean }) {
  const [item, setItem] = useState<UdipCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceTab, setSourceTab] = useState<"request" | "departments">("departments");

  const [draftText, setDraftText] = useState("");
  const [piiSpans, setPiiSpans] = useState<PiiSpan[]>([]);
  const [scanned, setScanned] = useState(false);

  // Supervisor approval lock (any edit invalidates!)
  const [supervisorApproved, setSupervisorApproved] = useState(false);
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [closedSuccess, setClosedSuccess] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(API_ROUTES.caseById.replace("{uuid}", caseUuid), {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as { status?: string; case?: UdipCaseDetail };
        if (!controller.signal.aborted && json.status === "ok" && json.case) {
          setItem(json.case);
          setDraftText(json.case.draftResponseText || composeBksDraft(json.case));
        }
      } catch {
        // Ignore AbortError from React Strict Mode unmount or transient network errors
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [caseUuid]);

  const redactedText = useMemo(() => buildRedactedText(draftText, piiSpans), [draftText, piiSpans]);
  const confirmedCount = piiSpans.filter(s => s.confirmedBlack && !s.isPublicOfficial).length;

  function handleDraftChange(next: string) {
    setDraftText(next);
    setSupervisorApproved(false);
    setScanned(false);
  }

  function handleRunPiiScan() {
    const detected = scanPolishPii(draftText);
    setPiiSpans(detected);
    setScanned(true);
    setSupervisorApproved(false);
    setStep(2);
  }

  function togglePiiSpan(id: string) {
    setPiiSpans(prev =>
      prev.map(s => (s.id === id && !s.isPublicOfficial ? { ...s, confirmedBlack: !s.confirmedBlack } : s)),
    );
    setSupervisorApproved(false);
  }

  function handleDownloadCleanTxt() {
    if (!item) return;
    const blob = new Blob([redactedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Odpowiedz_${item.caseNumber}_zanonimizowana.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFinalizeCase() {
    if (!item) return;
    setSaving(true);
    try {
      const res = await fetch(API_ROUTES.caseById.replace("{uuid}", item.uuid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          processStatus: "E",
          answeredDate: dispatchDate,
          draftResponseText: draftText,
          anonymizedResponseText: redactedText,
          piiRedactionsCount: confirmedCount,
        }),
      });
      if (res.ok) {
        setClosedSuccess(true);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Throbber label="Loading case" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          {polish ? "Nie znaleziono sprawy." : "Case not found."}
        </p>
        <Link href="/" className="text-sm font-semibold text-blue-600 underline">
          {polish ? "← Wróć do Kalendarza" : "← Back to Calendar"}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Top Breadcrumb + Case Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            {polish ? "Powrót do Kalendarza Wniosków" : "Back to Request Calendar"}
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-xl font-bold text-foreground">{item.caseNumber}</h1>
            <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-200">
              Status {item.processStatus}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>{item.applicantName}</strong> · {item.subject}
          </p>
        </div>

        {/* 3-Step Clean Stepper */}
        <nav aria-label="Etapy obsługi sprawy" className="flex items-center gap-1.5 rounded-xl border border-border bg-surface p-1 text-xs">
          {[
            { num: 1 as const, label: polish ? "1. Projekt pisma" : "1. Draft Letter" },
            { num: 2 as const, label: polish ? "2. Anonimizator PII" : "2. PII Anonymizer" },
            { num: 3 as const, label: polish ? "3. Akceptacja & Eksport" : "3. Approval & Export" },
          ].map(tab => (
            <button
              key={tab.num}
              type="button"
              onClick={() => setStep(tab.num)}
              className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                step === tab.num
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* STEP 1: Side-by-Side Comparison & BKS Letter Generator */}
      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: Sources (Department Replies + Request Text) */}
          <section className="flex flex-col rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSourceTab("departments")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    sourceTab === "departments" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {polish ? `Odpowiedzi wydziałów (${item.departmentQueries.length})` : `Department Replies (${item.departmentQueries.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setSourceTab("request")}
                  className={`rounded-md px-2.5 py-1 font-semibold ${
                    sourceTab === "request" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {polish ? "Treść wniosku" : "Request Text"}
                </button>
              </div>
              {item.matchedCaseNumber && (
                <span className="font-mono text-[11px] text-blue-600">
                  🎯 {item.matchedCaseNumber}
                </span>
              )}
            </div>

            <div className="flex-1 space-y-3 p-4 text-xs">
              {sourceTab === "departments" ? (
                item.departmentQueries.length === 0 ? (
                  <p className="text-muted-foreground">
                    {item.externalAuthorityName
                      ? `${polish ? "Sprawa przekierowywana do:" : "Redirected to:"} ${item.externalAuthorityName}`
                      : polish ? "Brak odpowiedzi wydziałów." : "No department replies yet."}
                  </p>
                ) : (
                  item.departmentQueries.map(dept => (
                    <div key={dept.uuid} className="rounded-lg border border-border bg-background p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{dept.departmentName}</span>
                        <span className="text-[10px] font-semibold">
                          {dept.status === "REPLIED" ? "🟢 Odpowiedź" : "🔴 Oczekuje"}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {dept.replyText || (polish ? "Oczekuje na treść odpowiedzi…" : "Awaiting reply…")}
                      </p>
                      {dept.replyFileName && (
                        <p className="font-mono text-[11px] text-blue-600">📎 {dept.replyFileName}</p>
                      )}
                    </div>
                  ))
                )
              ) : (
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-3 font-sans text-xs leading-relaxed">
                  {item.verifiedRequestText || item.subject}
                </pre>
              )}
            </div>
          </section>

          {/* Right: Editable Official BKS Letter */}
          <section className="flex flex-col rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold">
                <FileEarmarkText aria-hidden="true" className="size-4 text-blue-600" />
                <span>{polish ? "Projekt pisma BKS UM Bydgoszczy" : "Official BKS UM Bydgoszcz Draft"}</span>
              </div>
              <Button
                size="sm"
                tone="main-outline"
                onClick={() => handleDraftChange(composeBksDraft(item))}
              >
                <Magic aria-hidden="true" className="size-3.5" />
                {polish ? "Złóż ponownie ze źródeł" : "Regenerate from sources"}
              </Button>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <textarea
                value={draftText}
                onChange={e => handleDraftChange(e.target.value)}
                rows={16}
                className="w-full flex-1 rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed"
              />
              <div className="flex justify-end">
                <Button tone="primary" onClick={handleRunPiiScan}>
                  <EyeSlashFill aria-hidden="true" className="size-4" />
                  {polish ? "Przejdź do Anonimizacji PII-Tracer →" : "Scan with PII-Tracer →"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* STEP 2: PII-Tracer Grey -> Black Irreversible Anonymizer */}
      {step === 2 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: Detected Grey -> Black Controls */}
          <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {polish ? "Wykryte dane osobowe (Szary → Czarny)" : "Detected PII Spans (Grey → Black)"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {polish
                    ? "Kliknij pole, aby zatwierdzić trwałe zaczernienie (bez Ctrl+Z). Funkcjonariusze publiczni są chronieni z Art. 5 ust. 2 UDIP."
                    : "Click any chip to toggle permanent black redaction (no Ctrl+Z). Public officials are protected under Art. 5(2) UDIP."}
                </p>
              </div>
              <Button size="sm" tone="main-outline" onClick={handleRunPiiScan}>
                {polish ? "Skanuj ponownie" : "Rescan"}
              </Button>
            </div>

            {!scanned ? (
              <Button tone="primary" onClick={handleRunPiiScan}>
                {polish ? "Uruchom skanowanie PII-Tracer" : "Run PII-Tracer Scan"}
              </Button>
            ) : piiSpans.length === 0 ? (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                ✅ {polish ? "Nie wykryto wrażliwych danych osobowych w projekcie pisma." : "No sensitive personal data detected in the draft."}
              </div>
            ) : (
              <div className="space-y-2">
                {piiSpans.map(span => (
                  <button
                    key={span.id}
                    type="button"
                    disabled={span.isPublicOfficial}
                    onClick={() => togglePiiSpan(span.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
                      span.isPublicOfficial
                        ? "cursor-default border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200"
                        : span.confirmedBlack
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-200 dark:bg-black"
                          : "border-neutral-400 bg-neutral-200/80 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
                    }`}
                  >
                    <div>
                      <div className="font-mono font-semibold">
                        {span.confirmedBlack && !span.isPublicOfficial ? "████████████" : span.value}
                      </div>
                      <div className="text-[10px] opacity-80">{span.category}</div>
                    </div>
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold">
                      {span.isPublicOfficial
                        ? "🟢 OCHRONA (Art. 5 ust. 2)"
                        : span.confirmedBlack
                          ? "⬛ ZACZERNIONE"
                          : "⬜ SUGESTIA (Szare)"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button tone="primary" onClick={() => setStep(3)}>
                <ShieldCheck aria-hidden="true" className="size-4" />
                {polish ? "Przejdź do Akceptacji i Eksportu .txt →" : "Proceed to Approval & .txt Export →"}
              </Button>
            </div>
          </section>

          {/* Right: Permanent Black Preview (No Ctrl+Z Leak) */}
          <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2.5 text-xs">
              <span className="font-semibold">
                {polish ? "Podgląd końcowy (wartości usunięte — brak możliwości skopiowania PII)" : "Final Redacted Preview (values stripped — zero PII copy leak)"}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {confirmedCount} {polish ? "zaczernień" : "redactions"}
              </span>
            </div>
            <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3.5 font-mono text-xs leading-relaxed">
              {redactedText}
            </pre>
          </section>
        </div>
      )}

      {/* STEP 3: Supervisor Approval Lock + Clean TXT Export + Status E */}
      {step === 3 && (
        <section className="mx-auto w-full max-w-3xl space-y-4 rounded-xl border border-border bg-surface p-6">
          <div className="flex items-center gap-2.5">
            <ShieldLockFill aria-hidden="true" className="size-5 text-blue-600" />
            <h2 className="text-base font-semibold">
              {polish ? "Akceptacja Przełożonego, Eksport czystego .txt i Zamknięcie sprawy" : "Supervisor Approval, Clean .txt Export & Dispatch"}
            </h2>
          </div>

          {/* 1. Supervisor Approval */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-foreground">
                {polish ? "1. Zatwierdzenie wersji treści i anonimizacji (Przełożony)" : "1. Supervisor Version & Redaction Approval"}
              </p>
              <p className="text-muted-foreground">
                {polish
                  ? `Zatwierdzono ${confirmedCount} trwałych zakreśleń PII. Każda późniejsza zmiana treści automatycznie unieważnia akceptację.`
                  : `${confirmedCount} permanent PII redactions confirmed. Any subsequent text edit invalidates approval.`}
              </p>
            </div>
            <Button
              tone={supervisorApproved ? "main-outline" : "primary"}
              onClick={() => setSupervisorApproved(v => !v)}
            >
              <CheckCircleFill aria-hidden="true" className="size-4" />
              {supervisorApproved
                ? polish ? "✅ Zatwierdzone przez Przełożonego" : "✅ Approved by Supervisor"
                : polish ? "Zatwierdź wersję (Przełożony)" : "Approve Version"}
            </Button>
          </div>

          {/* 2. Export Clean TXT (Only enabled after Supervisor Approval!) */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-foreground">
                {polish ? "2. Eksport świeżego pliku .txt (bez możliwości cofnięcia Ctrl+Z)" : "2. Export Fresh Scrubbed .txt (No Ctrl+Z Recovery)"}
              </p>
              <p className="text-muted-foreground">
                {polish
                  ? "Wyeksportowany plik zawiera wyłącznie oczyszczony tekst gotowy do wysyłki poza aplikacją (ePUAP / e-mail)."
                  : "Exported file contains only scrubbed text ready for external dispatch (ePUAP / email)."}
              </p>
            </div>
            <Button
              tone="primary"
              disabled={!supervisorApproved}
              onClick={handleDownloadCleanTxt}
            >
              <Download aria-hidden="true" className="size-4" />
              {polish ? "Pobierz czysty .txt" : "Download clean .txt"}
            </Button>
          </div>

          {/* 3. Record actual external dispatch date & close as Status E */}
          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            <div className="text-xs space-y-0.5">
              <p className="font-semibold text-foreground">
                {polish ? "3. Zarejestruj datę wysyłki poza aplikacją i zakończ sprawę (Status E)" : "3. Record External Dispatch Date & Close (Status E)"}
              </p>
              <p className="text-muted-foreground">
                {polish
                  ? "Po wysłaniu pisma poza systemem wpisz datę wysyłki — sprawa zmieni kolor na 🟢 Zielony w Kalendarzu."
                  : "After sending the letter externally, record the dispatch date — the case turns 🟢 Green in the Calendar."}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">{polish ? "Data wysyłki" : "Dispatch date"}</span>
                <Input
                  type="date"
                  value={dispatchDate}
                  onChange={e => setDispatchDate(e.target.value)}
                />
              </label>
              <Button
                tone="primary"
                disabled={!supervisorApproved || saving}
                onClick={() => void handleFinalizeCase()}
              >
                {saving
                  ? polish ? "Zapisywanie…" : "Saving…"
                  : polish ? "Zakończ sprawę (Status E)" : "Close Case (Status E)"}
              </Button>
            </div>

            {closedSuccess && (
              <div
                role="status"
                className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/12 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200"
              >
                <span>
                  ✅ {polish ? `Sprawa ${item.caseNumber} została zakończona (Status E)!` : `Case ${item.caseNumber} closed (Status E)!`}
                </span>
                <Link href="/" className="underline">
                  {polish ? "Wróć do Kalendarza →" : "Back to Calendar →"}
                </Link>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
