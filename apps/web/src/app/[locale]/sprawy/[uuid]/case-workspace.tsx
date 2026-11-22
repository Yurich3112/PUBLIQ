"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarEvent,
  CheckCircleFill,
  Download,
  Eye,
  EyeSlashFill,
  FileEarmarkText,
  Magic,
  PlusCircle,
  ShieldCheck,
  ShieldLockFill,
  Trash,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, Input, Throbber } from "@/ui/basic";
import {
  DepartmentDocPreviewModal,
  type DepartmentDocPreviewData,
} from "../../department-doc-preview-modal";

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
  assigneeName?: string;
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

type BksTemplateKind = "MERIT" | "KWERENDA" | "CLARIFICATION" | "EXTERNAL";

interface PiiSpan {
  id: string;
  category: string;
  value: string;
  start: number;
  end: number;
  confirmedBlack: boolean;
  isPublicOfficial: boolean;
}

const PUBLIC_OFFICIAL_RE = /\b(Prezydent(?:a|owi|em)?\s+Rafał(?:a|owi|em)?\s+Bruski(?:ego|emu|m)?|Rafał(?:a|owi|em)?\s+Bruski(?:ego|emu|m)?|R\.\s*Bruski(?:ego)?|Łukasz(?:a)?\s+Okoński(?:ego)?)\b/gi;

function scanPolishPii(text: string, customTerms: readonly string[] = []): PiiSpan[] {
  const spans: PiiSpan[] = [];
  const rules: { category: string; regex: RegExp; isPublicOfficial?: boolean }[] = [
    { category: "FUNKCJONARIUSZ PUBLICZNY (Art. 5 ust. 2 UDIP)", regex: PUBLIC_OFFICIAL_RE, isPublicOfficial: true },
    { category: "PESEL", regex: /\b\d{11}\b/g },
    { category: "NIP", regex: /\b\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}\b/g },
    { category: "DOWÓD OSOBISTY", regex: /\b[A-Z]{3}\s?\d{6}\b/g },
    { category: "TELEFON PRYWATNY", regex: /\b(?:\+48\s*)?(?:\d{3}[-\s]\d{3}[-\s]\d{3})\b/g },
    { category: "E-MAIL PRYWATNY", regex: /\b[a-zA-Z0-9._%+-]+@(?!um\.bydgoszcz\.pl\b|zdmikp\.bydgoszcz\.pl\b|torun\.wkz\.gov\.pl\b)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g },
    { category: "IBAN / KONTO", regex: /\b(?:PL\s*)?\d{2}(?:\s?\d{4}){6}\b/g },
    { category: "KSIĘGA WIECZYSTA / DZIAŁKA", regex: /\b(?:BY1B\/\d{8}\/\d|dz\.?\s*nr\s*\d+(?:\/\d+)?)\b/gi },
    { category: "ADRES ZAMIESZKANIA", regex: /\b(?:ul\.\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+\s+\d+[a-zA-Z]?(?:\/\d+)?)\b/g },
    { category: "OSOBA PRYWATNA (BKS)", regex: /\b(?:Anna\s+Kowalska|Jan\s+Kowalski|Jerzy\s+Dociekliwy|Ewa\s+Góra|Ewa\s+Górna|Antoni\s+Ptak|Jacek\s+Rzeźbiarz)\b/g },
  ];

  for (const term of customTerms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (escaped.trim()) {
      rules.push({ category: "RĘCZNE ZAKREŚLENIE (URZĘDNIK)", regex: new RegExp(escaped, "gi") });
    }
  }

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

function composeBksDraft(item: UdipCaseDetail, template: BksTemplateKind): string {
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

  if (template === "EXTERNAL") {
    return [
      ...header,
      "odpowiadając na wystosowany wniosek o udostępnienie informacji publicznej, uprzejmie informuję, iż Urząd Miasta Bydgoszczy nie jest dysponentem wnioskowanych danych.",
      "Zgodnie z art. 4 ust. 3 ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej obowiązane do udostępnienia informacji publicznej są wyłącznie podmioty publiczne będące w posiadaniu tych informacji.",
      "",
      `W związku z powyższym właściwym adresatem wniosku jest: ${item.externalAuthorityName || "[wskazać właściwy organ / instytucję, np. ZUS / ZDMiKP / WKZ]"}.`,
      "",
      "Łączę wyrazy szacunku,",
      "Biuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy",
    ].join("\n");
  }

  if (template === "KWERENDA") {
    const extendedDate = new Date(new Date(item.deadlineDate).getTime() + 14 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return [
      ...header,
      "działając na podstawie art. 13 ust. 2 ustawy z dnia 6 września 2001 r. o dostępie do informacji publicznej, zawiadamiam, że rozpatrzenie wniosku w terminie 14 dni nie jest możliwe ze względu na konieczność przeprowadzenia szczegółowej kwerendy dokumentacji w kilku wydziałach merytorycznych Urzędu Miasta Bydgoszczy.",
      "",
      `Nowy termin udzielenia odpowiedzi wyznacza się do dnia: ${extendedDate}.`,
      "",
      "Łączę wyrazy szacunku,",
      "Biuro Komunikacji Społecznej Urzędu Miasta Bydgoszczy",
    ].join("\n");
  }

  if (template === "CLARIFICATION") {
    return [
      ...header,
      "w związku z wpływem wniosku o udostępnienie informacji publicznej uprzejmie proszę o doprecyzowanie zakresu żądanych informacji (w szczególności okresu, którego dotyczy zapytanie, oraz konkretnych dokumentów) w terminie 7 dni od dnia otrzymania niniejszego wezwania.",
      "",
      "Brak doprecyzowania w wyznaczonym terminie może uniemożliwić merytoryczne rozpatrzenie wniosku.",
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

function defaultTemplateForCase(item: UdipCaseDetail): BksTemplateKind {
  if (item.routingType === "EXTERNAL_AUTHORITY") return "EXTERNAL";
  if (item.routingType === "CLARIFICATION_7D") return "CLARIFICATION";
  return "MERIT";
}

export function CaseWorkspace({
  caseUuid,
  polish,
  isAdmin = false,
}: {
  caseUuid: string;
  polish: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [item, setItem] = useState<UdipCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [sourceTab, setSourceTab] = useState<"departments" | "request">("departments");
  const [templateKind, setTemplateKind] = useState<BksTemplateKind>("MERIT");

  const [draftText, setDraftText] = useState("");
  const [piiSpans, setPiiSpans] = useState<PiiSpan[]>([]);
  const [customTerms, setCustomTerms] = useState<string[]>([]);
  const [customTermInput, setCustomTermInput] = useState("");
  const [scanned, setScanned] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DepartmentDocPreviewData | null>(null);

  // Supervisor approval lock (any edit invalidates!)
  const [supervisorApproved, setSupervisorApproved] = useState(false);
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loadedAtMs] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [closedSuccess, setClosedSuccess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
          const initialTemplate = defaultTemplateForCase(json.case);
          setItem(json.case);
          setTemplateKind(initialTemplate);
          setDraftText(json.case.draftResponseText || composeBksDraft(json.case, initialTemplate));
        }
      } catch {
        // Ignore AbortError from unmount
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [caseUuid]);

  const redactedText = useMemo(() => buildRedactedText(draftText, piiSpans), [draftText, piiSpans]);
  const confirmedCount = piiSpans.filter(s => s.confirmedBlack && !s.isPublicOfficial).length;
  const protectedCount = piiSpans.filter(s => s.isPublicOfficial).length;

  const daysLeft = useMemo(() => {
    if (!item) return 0;
    const ms = new Date(item.deadlineDate).getTime() - loadedAtMs;
    return Math.ceil(ms / 86_400_000);
  }, [item, loadedAtMs]);

  function handleDraftChange(next: string) {
    setDraftText(next);
    setSupervisorApproved(false);
    setScanned(false);
  }

  function handleSelectTemplate(nextKind: BksTemplateKind) {
    if (!item) return;
    setTemplateKind(nextKind);
    handleDraftChange(composeBksDraft(item, nextKind));
  }

  function handleRunPiiScan(nextCustomTerms = customTerms) {
    const detected = scanPolishPii(draftText, nextCustomTerms);
    setPiiSpans(detected);
    setScanned(true);
    setSupervisorApproved(false);
    setStep(2);
  }

  function handleAddCustomTerm() {
    const term = customTermInput.trim();
    if (!term || customTerms.includes(term)) return;
    const next = [...customTerms, term];
    setCustomTerms(next);
    setCustomTermInput("");
    handleRunPiiScan(next);
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

  async function handleDeleteCase() {
    if (!item || !isAdmin) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(API_ROUTES.caseById.replace("{uuid}", item.uuid), {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        setDeleteError(polish ? "Nie udało się usunąć sprawy." : "Failed to delete case.");
        return;
      }
      router.push("/kalendarz");
    } catch {
      setDeleteError(polish ? "Błąd połączenia podczas usuwania." : "Connection error while deleting.");
    } finally {
      setDeleting(false);
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
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          {polish ? "Nie znaleziono sprawy." : "Case not found."}
        </p>
        <Link href="/kalendarz" className="text-sm font-semibold text-primary underline">
          {polish ? "← Wróć do Kalendarza" : "← Back to Calendar"}
        </Link>
      </div>
    );
  }

  const repliedDepts = item.departmentQueries.filter(d => d.status === "REPLIED").length;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-5 sm:px-6">
      {/* Top Case Header + 3-Step Stepper */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <Link
            href="/kalendarz"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            {polish ? "Powrót do Kalendarza Wniosków" : "Back to Request Calendar"}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-xl font-bold tabular-nums text-foreground">{item.caseNumber}</h1>
            <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-primary">
              Status {item.processStatus}
            </span>
            {item.matchedCaseNumber && (
              <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                {polish ? `Bliźniacza: ${item.matchedCaseNumber}` : `Twin: ${item.matchedCaseNumber}`}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">{item.applicantName}</strong> · {item.subject}
          </p>
        </div>

        {/* 3-Step Clean Stepper */}
        <nav aria-label="Etapy obsługi sprawy" className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 text-xs">
          {[
            { num: 1 as const, label: polish ? "1. Projekt pisma" : "1. Draft Letter" },
            { num: 2 as const, label: polish ? "2. Redakcja" : "2. Redaction" },
            { num: 3 as const, label: polish ? "3. Zarządzanie" : "3. Management" },
          ].map(tab => (
            <button
              key={tab.num}
              type="button"
              onClick={() => setStep(tab.num)}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                step === tab.num
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Compact Case Metadata Strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-xs">
        <div className="flex items-center gap-1.5">
          <CalendarEvent aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{polish ? "Wpływ:" : "Received:"}</span>
          <strong className="tabular-nums">{item.receivedDate.slice(0, 10)}</strong>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{polish ? "Termin:" : "Deadline:"}</span>
          <strong className="tabular-nums">{item.deadlineDate.slice(0, 10)}</strong>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
              item.processStatus === "E"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : daysLeft <= 2
                  ? "bg-red-500/15 text-red-700 dark:text-red-300"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {item.processStatus === "E"
              ? polish ? "Wysłano" : "Dispatched"
              : daysLeft < 0
                ? polish ? `Po terminie (${Math.abs(daysLeft)} dni)` : `Overdue (${Math.abs(daysLeft)}d)`
                : polish ? `${daysLeft} dni` : `${daysLeft}d left`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{polish ? "Wydziały:" : "Departments:"}</span>
          <strong className="tabular-nums">
            {repliedDepts}/{item.departmentQueries.length}
          </strong>
        </div>
        {item.externalAuthorityName && (
          <div className="flex items-center gap-1.5 text-primary">
            <span>{polish ? "Podmiot zewn.:" : "External:"}</span>
            <strong>{item.externalAuthorityName}</strong>
          </div>
        )}
      </div>

      {/* STEP 1: Side-by-Side Comparison & Official 4-Template BKS Letter Generator */}
      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: Sources (Department Replies + Request Text) */}
          <section className="flex flex-col rounded-lg border border-border bg-surface">
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
                <span className="font-mono text-[11px] text-primary">
                  {item.matchedCaseNumber}
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
                    <div key={dept.uuid} className="space-y-1.5 rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{dept.departmentName}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            dept.status === "REPLIED"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-red-500/15 text-red-700 dark:text-red-300"
                          }`}
                        >
                          {dept.status === "REPLIED"
                            ? polish ? "Odpowiedź" : "Replied"
                            : polish ? "Oczekuje" : "Pending"}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">
                        {dept.replyText || (polish ? "Oczekuje na treść odpowiedzi…" : "Awaiting reply…")}
                      </p>
                      {dept.replyFileName && (
                        <div className="flex flex-nowrap items-center justify-between gap-2 pt-1">
                          <span className="truncate font-mono text-[11px] text-primary">{dept.replyFileName}</span>
                          <Button
                            size="sm"
                            tone="main-outline"
                            className="shrink-0 whitespace-nowrap"
                            onClick={() =>
                              setPreviewDoc({
                                caseUuid: item.uuid,
                                caseNumber: item.caseNumber,
                                departmentName: dept.departmentName,
                                replyFileName: dept.replyFileName,
                                replyText: dept.replyText,
                              })
                            }
                          >
                            <Eye aria-hidden="true" className="size-3.5" />
                            {polish ? "Podgląd dokumentu" : "Preview document"}
                          </Button>
                        </div>
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

          {/* Right: Editable Official BKS Letter with 4 Template Switcher */}
          <section className="flex flex-col rounded-lg border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold">
                <FileEarmarkText aria-hidden="true" className="size-4 text-primary" />
                <span>{polish ? "Projekt pisma BKS UM Bydgoszczy" : "Official BKS UM Bydgoszcz Draft"}</span>
              </div>
              <Button
                size="sm"
                tone="main-outline"
                onClick={() => handleDraftChange(composeBksDraft(item, templateKind))}
              >
                <Magic aria-hidden="true" className="size-3.5" />
                {polish ? "Złóż ponownie" : "Regenerate"}
              </Button>
            </div>

            {/* 4 Official BKS Templates */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-4 py-2">
              {(
                [
                  { id: "MERIT", pl: "Odpowiedź merytoryczna", en: "Merit Reply" },
                  { id: "KWERENDA", pl: "Kwerenda (Art. 13 ust. 2)", en: "Kwerenda (Art. 13(2))" },
                  { id: "CLARIFICATION", pl: "Doprecyzowanie (7 dni)", en: "Clarification (7d)" },
                  { id: "EXTERNAL", pl: "Brak dysponenta (Art. 4 ust. 3)", en: "External Redirect" },
                ] as const
              ).map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tpl.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    templateKind === tpl.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {polish ? tpl.pl : tpl.en}
                </button>
              ))}
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
              <textarea
                value={draftText}
                onChange={e => handleDraftChange(e.target.value)}
                rows={16}
                className="w-full flex-1 rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed"
              />
              <div className="flex justify-end">
                <Button tone="primary" onClick={() => handleRunPiiScan()}>
                  <EyeSlashFill aria-hidden="true" className="size-4" />
                  {polish ? "Skanuj i anonimizuj (PII-Tracer)" : "Scan & Anonymize (PII-Tracer)"}
                </Button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* STEP 2: PII-Tracer Grey -> Black Irreversible Anonymizer */}
      {step === 2 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: Detected Grey -> Black Controls + Manual Fallback */}
          <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {polish ? "Wykryte dane osobowe (Szary → Czarny)" : "Detected PII Spans (Grey → Black)"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {polish
                    ? "Kliknij pozycję, aby przełączyć trwałe zaczernienie (bez Ctrl+Z). Funkcjonariusze publiczni są chronieni (Art. 5 ust. 2 UDIP)."
                    : "Click any span to toggle permanent black redaction (no Ctrl+Z). Public officials are protected (Art. 5(2) UDIP)."}
                </p>
              </div>
              <Button size="sm" tone="main-outline" onClick={() => handleRunPiiScan()}>
                {polish ? "Skanuj ponownie" : "Rescan"}
              </Button>
            </div>

            {/* Manual Redaction Fallback */}
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={customTermInput}
                onChange={e => setCustomTermInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomTerm();
                  }
                }}
                placeholder={polish ? "Dodaj ręcznie frazę do zaczernienia (np. nazwisko, adres)…" : "Manually add phrase to redact…"}
                className="flex-1 text-xs"
              />
              <Button size="sm" tone="main-outline" onClick={handleAddCustomTerm}>
                <PlusCircle aria-hidden="true" className="size-3.5" />
                {polish ? "Dodaj" : "Add"}
              </Button>
            </div>

            {!scanned ? (
              <Button tone="primary" onClick={() => handleRunPiiScan()}>
                {polish ? "Uruchom skanowanie PII-Tracer" : "Run PII-Tracer Scan"}
              </Button>
            ) : piiSpans.length === 0 ? (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                {polish ? "Nie wykryto wrażliwych danych osobowych w projekcie pisma." : "No sensitive personal data detected in the draft."}
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
                        ? polish ? "OCHRONA (Art. 5 ust. 2)" : "PROTECTED (Art. 5(2))"
                        : span.confirmedBlack
                          ? polish ? "ZACZERNIONE" : "REDACTED"
                          : polish ? "SUGESTIA (Szare)" : "SUGGESTED"}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-[11px] text-muted-foreground">
                {polish
                  ? `Zaczernione: ${confirmedCount} · Chronione (Art. 5 ust. 2): ${protectedCount}`
                  : `Redacted: ${confirmedCount} · Protected (Art. 5(2)): ${protectedCount}`}
              </span>
              <Button tone="primary" onClick={() => setStep(3)}>
                <ShieldCheck aria-hidden="true" className="size-4" />
                {polish ? "Akceptacja i eksport .txt" : "Approval & .txt Export"}
              </Button>
            </div>
          </section>

          {/* Right: Permanent Black Preview (No Ctrl+Z Leak) */}
          <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between border-b border-border pb-2.5 text-xs">
              <span className="font-semibold">
                {polish ? "Podgląd końcowy (wartości trwale usunięte — bez Ctrl+Z)" : "Final Redacted Preview (values permanently stripped)"}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {confirmedCount} {polish ? "zaczernień" : "redactions"}
              </span>
            </div>
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3.5 font-mono text-xs leading-relaxed">
              {redactedText}
            </pre>
          </section>
        </div>
      )}

      {/* STEP 3: Zarządzanie — Horizontal Tiles (Approval, Export, Dispatch, Admin Delete) */}
      {step === 3 && (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2.5 border-b border-border pb-3">
            <ShieldLockFill aria-hidden="true" className="size-5 shrink-0 text-primary" />
            <div>
              <h2 className="text-base font-semibold">
                {polish ? "Zarządzanie sprawą — Akceptacja, Eksport i Zamknięcie" : "Case Management — Approval, Export & Closure"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {polish
                  ? "Każda edycja treści pisma lub zakresu zaczernień unieważnia akceptację i wymaga ponownego zatwierdzenia."
                  : "Any edit to the letter text or redactions invalidates approval and requires re-confirmation."}
              </p>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${
              isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"
            }`}
          >
            {/* Tile 1: Supervisor Approval */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-background p-4">
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-foreground">
                  {polish ? "1. Zatwierdzenie wersji (Przełożony)" : "1. Supervisor Version Approval"}
                </p>
                <p className="leading-relaxed text-muted-foreground">
                  {polish
                    ? `Zatwierdzono ${confirmedCount} trwałych zakreśleń PII (chronionych funkcjonariuszy publicznych: ${protectedCount}).`
                    : `${confirmedCount} permanent PII redactions confirmed (${protectedCount} public officials protected).`}
                </p>
              </div>
              <Button
                tone={supervisorApproved ? "main-outline" : "primary"}
                className="w-full justify-center"
                onClick={() => setSupervisorApproved(v => !v)}
              >
                <CheckCircleFill aria-hidden="true" className="size-4" />
                {supervisorApproved
                  ? polish ? "Zatwierdzone (Przełożony)" : "Approved by Supervisor"
                  : polish ? "Zatwierdź wersję" : "Approve Version"}
              </Button>
            </div>

            {/* Tile 2: Export Clean TXT */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-background p-4">
              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-foreground">
                  {polish ? "2. Eksport czystego .txt" : "2. Export Clean .txt"}
                </p>
                <p className="leading-relaxed text-muted-foreground">
                  {polish
                    ? "Świeży plik bez możliwości cofnięcia Ctrl+Z — zawiera wyłącznie oczyszczony tekst gotowy do wysyłki (ePUAP / e-mail)."
                    : "Fresh scrubbed file with no Ctrl+Z recovery — ready for external dispatch (ePUAP / email)."}
                </p>
              </div>
              <Button
                tone="primary"
                disabled={!supervisorApproved}
                className="w-full justify-center"
                onClick={handleDownloadCleanTxt}
              >
                <Download aria-hidden="true" className="size-4" />
                {polish ? "Pobierz czysty .txt" : "Download clean .txt"}
              </Button>
            </div>

            {/* Tile 3: Record External Dispatch Date & Close */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-background p-4">
              <div className="space-y-2 text-xs">
                <p className="font-semibold text-foreground">
                  {polish ? "3. Wysyłka i zamknięcie (Status E)" : "3. Dispatch & Close (Status E)"}
                </p>
                <p className="leading-relaxed text-muted-foreground">
                  {polish
                    ? "Po wysłaniu pisma poza systemem wpisz datę wysyłki — sprawa zmieni kolor na zielony w Kalendarzu."
                    : "After sending externally, record the dispatch date — the case turns green in the Calendar."}
                </p>
                <label className="flex flex-col gap-1 pt-1">
                  <span className="text-muted-foreground">{polish ? "Data wysyłki" : "Dispatch date"}</span>
                  <Input
                    type="date"
                    value={dispatchDate}
                    onChange={e => setDispatchDate(e.target.value)}
                  />
                </label>
              </div>
              <Button
                tone="primary"
                disabled={!supervisorApproved || saving}
                className="w-full justify-center"
                onClick={() => void handleFinalizeCase()}
              >
                {saving
                  ? polish ? "Zapisywanie…" : "Saving…"
                  : polish ? "Zakończ sprawę (Status E)" : "Close Case (Status E)"}
              </Button>
            </div>

            {/* Tile 4: Admin-Only Red Delete Tile */}
            {isAdmin && (
              <div className="flex flex-col justify-between gap-4 rounded-xl border border-red-500/45 bg-red-500/8 p-4 dark:bg-red-950/25">
                <div className="space-y-1.5 text-xs">
                  <p className="font-semibold text-red-700 dark:text-red-300">
                    {polish ? "4. Usuń sprawę" : "4. Delete Case"}
                  </p>
                  <p className="leading-relaxed text-red-900/80 dark:text-red-200/80">
                    {polish
                      ? `Trwale usuwa wniosek ${item.caseNumber} oraz wszystkie powiązane zapytania do wydziałów z Kalendarza. Tej operacji nie można cofnąć.`
                      : `Permanently deletes case ${item.caseNumber} and all linked department queries. This cannot be undone.`}
                  </p>
                  {deleteError && (
                    <p role="alert" className="font-semibold text-red-700 dark:text-red-300">
                      {deleteError}
                    </p>
                  )}
                </div>

                {confirmDelete ? (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => void handleDeleteCase()}
                      className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash aria-hidden="true" className="size-3.5" />
                      {deleting
                        ? polish ? "Usuwanie…" : "Deleting…"
                        : polish ? "Potwierdź usunięcie" : "Confirm Deletion"}
                    </button>
                    <Button
                      size="sm"
                      tone="main-outline"
                      disabled={deleting}
                      className="w-full justify-center"
                      onClick={() => setConfirmDelete(false)}
                    >
                      {polish ? "Anuluj" : "Cancel"}
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
                  >
                    <Trash aria-hidden="true" className="size-3.5" />
                    {polish ? "Usuń wniosek" : "Delete Case"}
                  </button>
                )}
              </div>
            )}
          </div>

          {closedSuccess && (
            <div
              role="status"
              className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/12 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200"
            >
              <span>
                {polish ? `Sprawa ${item.caseNumber} została zakończona (Status E).` : `Case ${item.caseNumber} closed (Status E).`}
              </span>
              <Link href="/kalendarz" className="underline">
                {polish ? "Wróć do Kalendarza →" : "Back to Calendar →"}
              </Link>
            </div>
          )}
        </section>
      )}
      <DepartmentDocPreviewModal
        doc={previewDoc}
        polish={polish}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
}
