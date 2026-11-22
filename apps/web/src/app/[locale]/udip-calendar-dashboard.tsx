"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  CalendarEvent,
  CheckCircleFill,
  ChevronDown,
  ChevronRight,
  ClockHistory,
  ExclamationTriangleFill,
  FileEarmarkPlus,
  LightningChargeFill,
  PlusCircle,
  Search,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Link } from "@/i18n/navigation";
import { Button, Input, Throbber } from "@/ui/basic";

interface DepartmentQueryRow {
  uuid: string;
  departmentName: string;
  departmentEmail: string | null;
  status: "PENDING" | "REPLIED" | "KWERENDA_REQUESTED";
  questionText: string | null;
  replyText: string | null;
  replyFileName: string | null;
  repliedAt: string | null;
}

interface UdipCaseRow {
  uuid: string;
  caseNumber: string;
  year: number;
  sequenceNumber: number;
  registryNumber: string | null;
  applicantName: string;
  subject: string;
  receivedDate: string;
  deadlineDate: string;
  deadlineNote: string | null;
  answeredDate: string | null;
  assigneeName: string;
  assigneeInitials: string;
  processStatus: "A" | "B" | "C" | "D" | "E";
  isMultiDepartment: boolean;
  matchedCaseNumber: string | null;
  matchSimilarity: number | null;
  routingType: "INTERNAL_DEPARTMENTS" | "EXTERNAL_AUTHORITY" | "CLARIFICATION_7D";
  externalAuthorityName: string | null;
  daysRemaining: number;
  healthColor: "GREEN" | "RED";
  alerts: string[];
  departmentQueries: DepartmentQueryRow[];
}

interface CasesApiResponse {
  status: "ok";
  total: number;
  greenCount: number;
  redCount: number;
  multiDepartmentCount: number;
  cases: UdipCaseRow[];
}

const STATUS_LABELS_PL: Record<UdipCaseRow["processStatus"], string> = {
  A: "A — Brak działań",
  B: "B — Zapytania do wydziałów",
  C: "C — Kwerenda / Doprecyzowanie",
  D: "D — Przygotowana odpowiedź",
  E: "E — Odpowiedź wysłana",
};

const STATUS_LABELS_EN: Record<UdipCaseRow["processStatus"], string> = {
  A: "A — No action yet",
  B: "B — Queries sent to depts",
  C: "C — Kwerenda / Clarification",
  D: "D — Draft reply ready",
  E: "E — Reply dispatched",
};

export function UdipCalendarDashboard({ polish }: { polish: boolean }) {
  const [data, setData] = useState<CasesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState(false);

  // Filters
  const [yearFilter, setYearFilter] = useState<"ALL" | 2026 | 2025>("ALL");
  const [healthFilter, setHealthFilter] = useState<"ALL" | "GREEN" | "RED" | "MULTI">("ALL");
  const [search, setSearch] = useState("");

  // Expandable row + inline department reply composer
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);
  const [replyTargetDeptUuid, setReplyTargetDeptUuid] = useState<string | null>(null);
  const [replyTextDraft, setReplyTextDraft] = useState("");
  const [replyFileNameDraft, setReplyFileNameDraft] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [updatingCaseUuid, setUpdatingCaseUuid] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    try {
      const response = await fetch(API_ROUTES.cases, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.status === 401 || response.status === 403) {
        setUnauthorized(true);
        return;
      }
      if (!response.ok) {
        setError(true);
        return;
      }
      const json = (await response.json()) as CasesApiResponse;
      if (json.status === "ok") {
        setData(json);
        setUnauthorized(false);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function init() {
      try {
        const response = await fetch(API_ROUTES.cases, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setUnauthorized(true);
          return;
        }
        if (!response.ok) {
          setError(true);
          return;
        }
        const json = (await response.json()) as CasesApiResponse;
        if (!controller.signal.aborted && json.status === "ok") {
          setData(json);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void init();
    return () => controller.abort();
  }, []);

  const filteredCases = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.cases.filter(item => {
      if (yearFilter !== "ALL" && item.year !== yearFilter) return false;
      if (healthFilter === "GREEN" && item.healthColor !== "GREEN") return false;
      if (healthFilter === "RED" && item.healthColor !== "RED") return false;
      if (healthFilter === "MULTI" && !item.isMultiDepartment) return false;
      if (q) {
        const hay = `${item.caseNumber} ${item.applicantName} ${item.subject} ${item.externalAuthorityName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, yearFilter, healthFilter, search]);

  async function handleStatusChange(caseUuid: string, nextStatus: UdipCaseRow["processStatus"]) {
    setUpdatingCaseUuid(caseUuid);
    try {
      await fetch(API_ROUTES.caseById.replace("{uuid}", caseUuid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ processStatus: nextStatus }),
      });
      await loadCases();
    } finally {
      setUpdatingCaseUuid(null);
    }
  }

  async function handleQuickKwerenda(item: UdipCaseRow) {
    setUpdatingCaseUuid(item.uuid);
    try {
      const currentDeadline = new Date(item.deadlineDate);
      const extended = new Date(currentDeadline.getTime() + 14 * 86_400_000);
      await fetch(API_ROUTES.caseById.replace("{uuid}", item.uuid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          processStatus: "C",
          deadlineDate: extended.toISOString(),
          deadlineNote: "Kwerenda (+14 dni, Art. 13 ust. 2 UDIP)",
        }),
      });
      await loadCases();
    } finally {
      setUpdatingCaseUuid(null);
    }
  }

  async function handleSubmitDepartmentReply(event: FormEvent, caseUuid: string) {
    event.preventDefault();
    if (!replyTargetDeptUuid || (!replyTextDraft.trim() && !replyFileNameDraft.trim())) return;
    setSubmittingReply(true);
    try {
      const res = await fetch(API_ROUTES.caseDepartments.replace("{uuid}", caseUuid), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          departmentQueryUuid: replyTargetDeptUuid,
          status: "REPLIED",
          replyText: replyTextDraft.trim() || null,
          replyFileName: replyFileNameDraft.trim() || null,
        }),
      });
      if (res.ok) {
        setReplyTargetDeptUuid(null);
        setReplyTextDraft("");
        setReplyFileNameDraft("");
        await loadCases();
      }
    } finally {
      setSubmittingReply(false);
    }
  }

  const statusLabels = polish ? STATUS_LABELS_PL : STATUS_LABELS_EN;

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1440px] flex-col items-center justify-center gap-3 px-4">
        <Throbber label={polish ? "Ładowanie kalendarza wniosków…" : "Loading UDIP calendar…"} />
        <p className="text-sm text-muted-foreground">
          {polish ? "Ładowanie rejestru spraw BKS UM Bydgoszczy…" : "Loading UM Bydgoszcz BKS case registry…"}
        </p>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-blue-600/12 text-blue-600">
          <CalendarEvent aria-hidden="true" className="size-7" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {polish ? "Inteligentny Asystent Urzędnika — UM Bydgoszcz (UDIP)" : "Intelligent Clerk Assistant — UM Bydgoszcz (UDIP)"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {polish
            ? "Zaloguj się kontem urzędnika (prawy górny róg), aby otworzyć Kalendarz Wniosków UDIP, Weryfikator OCR i generator odpowiedzi BKS."
            : "Sign in with your clerk account (top right) to open the UDIP Request Calendar, OCR Verifier, and BKS response generator."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-4 py-6 sm:px-6">
      {/* Clean Clerk Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <CalendarEvent aria-hidden="true" className="size-3.5" />
            <span>{polish ? "Urząd Miasta Bydgoszczy · Biuro Komunikacji Społecznej" : "City Hall of Bydgoszcz · Public Communication Office"}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {polish ? "Kalendarz i Rejestr Wniosków UDIP" : "UDIP Request Calendar & Organizer"}
          </h1>
        </div>

        <Link
          href="/ocr"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-blue-700"
        >
          <FileEarmarkPlus aria-hidden="true" className="size-4" />
          {polish ? "+ Nowy Wniosek (PDF / Skan OCR)" : "+ New Request (PDF / Scan OCR)"}
        </Link>
      </header>

      {/* 4 Clickable KPI Filter Cards */}
      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setHealthFilter("ALL")}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
              healthFilter === "ALL"
                ? "border-blue-600 bg-blue-500/8 ring-1 ring-blue-600/30"
                : "border-border bg-surface hover:bg-muted/40"
            }`}
          >
            <span className="text-xs font-medium text-muted-foreground">
              {polish ? "Wszystkie sprawy w rejestrze" : "All active & archival cases"}
            </span>
            <span className="mt-1 text-2xl font-bold tabular-nums text-foreground">{data.total}</span>
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter(healthFilter === "GREEN" ? "ALL" : "GREEN")}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
              healthFilter === "GREEN"
                ? "border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600/30"
                : "border-border bg-surface hover:bg-muted/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircleFill aria-hidden="true" className="size-3.5" />
              {polish ? "W terminie / Zakończone" : "On Track / Completed"}
            </span>
            <span className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {data.greenCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter(healthFilter === "RED" ? "ALL" : "RED")}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
              healthFilter === "RED"
                ? "border-red-600 bg-red-500/10 ring-1 ring-red-600/30"
                : "border-border bg-surface hover:bg-muted/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
              <ExclamationTriangleFill aria-hidden="true" className="size-3.5" />
              {polish ? "Pilne / Po terminie / Kwerenda" : "Urgent / Overdue / Kwerenda"}
            </span>
            <span className="mt-1 text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">
              {data.redCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter(healthFilter === "MULTI" ? "ALL" : "MULTI")}
            className={`flex flex-col items-start rounded-xl border p-4 text-left transition ${
              healthFilter === "MULTI"
                ? "border-amber-600 bg-amber-500/10 ring-1 ring-amber-600/30"
                : "border-border bg-surface hover:bg-muted/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
              <LightningChargeFill aria-hidden="true" className="size-3.5" />
              {polish ? "Sprawy wielo-wydziałowe" : "Multi-Department Cases"}
            </span>
            <span className="mt-1 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {data.multiDepartmentCount}
            </span>
          </button>
        </div>
      )}

      {/* Clean Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-1.5">
          {(["ALL", 2026, 2025] as const).map(yr => (
            <button
              key={String(yr)}
              type="button"
              onClick={() => setYearFilter(yr)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                yearFilter === yr
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              {yr === "ALL" ? (polish ? "Wszystkie lata" : "All years") : yr}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={polish ? "Szukaj sygnatury, wnioskodawcy lub tematu…" : "Search signature, applicant, or subject…"}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700">
          {polish ? "Nie udało się pobrać spraw z bazy danych." : "Failed to load cases from database."}
        </div>
      )}

      {/* Main Calendar Table with Expandable Per-Department Rows */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-3 py-3 text-center">Lp.</th>
                <th className="px-3 py-3">{polish ? "Sygnatura" : "Case ID"}</th>
                <th className="px-3 py-3">{polish ? "Wnioskodawca i przedmiot zapytania" : "Applicant & Subject"}</th>
                <th className="px-3 py-3">{polish ? "Termin / Pozostało" : "Deadline"}</th>
                <th className="px-3 py-3 text-center">{polish ? "Os." : "Clerk"}</th>
                <th className="px-3 py-3">{polish ? "Status procesu (A–E)" : "Process Status"}</th>
                <th className="px-3 py-3 text-right">{polish ? "Akcja" : "Action"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCases.map((item, idx) => {
                const isExpanded = expandedUuid === item.uuid;
                const isRed = item.healthColor === "RED";
                const repliedCount = item.departmentQueries.filter(d => d.status === "REPLIED").length;
                const totalDepts = item.departmentQueries.length;

                return (
                  <FragmentRow key={item.uuid}>
                    <tr
                      onClick={() => setExpandedUuid(isExpanded ? null : item.uuid)}
                      className={`cursor-pointer transition ${
                        isRed
                          ? "border-l-4 border-l-red-500 bg-red-500/[0.03] hover:bg-red-500/[0.07]"
                          : "border-l-4 border-l-emerald-500 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.06]"
                      }`}
                    >
                      <td className="px-3 py-3.5 text-center font-mono text-muted-foreground">
                        <div className="inline-flex items-center gap-1">
                          {isExpanded ? (
                            <ChevronDown aria-hidden="true" className="size-3.5" />
                          ) : (
                            <ChevronRight aria-hidden="true" className="size-3.5" />
                          )}
                          <span>{idx + 1}</span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3.5">
                        <div className="font-mono font-semibold text-foreground">{item.caseNumber}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {polish ? "Wpływ:" : "In:"} {item.receivedDate.slice(0, 10)}
                        </div>
                      </td>

                      <td className="max-w-md px-3 py-3.5">
                        <div className="font-semibold text-foreground">{item.applicantName}</div>
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground">{item.subject}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {item.isMultiDepartment && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                              ⚠️ {polish ? `Wielo-wydziałowy (${repliedCount}/${totalDepts})` : `Multi-dept (${repliedCount}/${totalDepts})`}
                            </span>
                          )}
                          {item.routingType === "EXTERNAL_AUTHORITY" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-800 dark:text-purple-200">
                              ⚡ {polish ? "Brak dysponenta (Art. 4 ust. 3)" : "External Authority"}
                            </span>
                          )}
                          {item.matchedCaseNumber && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:text-blue-200">
                              🎯 {polish ? `Bliźniacza: ${item.matchedCaseNumber}` : `Twin: ${item.matchedCaseNumber}`}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3.5">
                        <div className="font-medium text-foreground">{item.deadlineDate.slice(0, 10)}</div>
                        <span
                          className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.processStatus === "E"
                              ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                              : isRed
                                ? "bg-red-500/15 text-red-800 dark:text-red-200"
                                : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
                          }`}
                        >
                          {item.processStatus === "E"
                            ? polish ? "Wysłano w terminie" : "Sent on time"
                            : item.daysRemaining < 0
                              ? polish ? `Po terminie (${Math.abs(item.daysRemaining)} dni)` : `Overdue (${Math.abs(item.daysRemaining)}d)`
                              : item.daysRemaining === 0
                                ? polish ? "Termin DZISIAJ!" : "Due TODAY!"
                                : polish ? `Pozostało ${item.daysRemaining} dni` : `${item.daysRemaining}d left`}
                        </span>
                      </td>

                      <td className="px-3 py-3.5 text-center">
                        <span
                          title={item.assigneeName}
                          className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-background font-mono text-[11px] font-bold text-foreground"
                        >
                          {item.assigneeInitials}
                        </span>
                      </td>

                      <td
                        className="px-3 py-3.5"
                        onClick={event => event.stopPropagation()}
                      >
                        <select
                          value={item.processStatus}
                          disabled={updatingCaseUuid === item.uuid}
                          onChange={e =>
                            void handleStatusChange(
                              item.uuid,
                              e.target.value as UdipCaseRow["processStatus"],
                            )
                          }
                          className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground"
                        >
                          {(["A", "B", "C", "D", "E"] as const).map(code => (
                            <option key={code} value={code}>
                              {statusLabels[code]}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td
                        className="whitespace-nowrap px-3 py-3.5 text-right"
                        onClick={event => event.stopPropagation()}
                      >
                        <Link
                          href={`/sprawy/${item.uuid}` as "/"}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition hover:border-blue-600 hover:text-blue-600"
                        >
                          {polish ? "Otwórz" : "Open"}
                          <ArrowRight aria-hidden="true" className="size-3" />
                        </Link>
                      </td>
                    </tr>

                    {/* Expanded Inline Drawer: Queried Departments + Paste Email / Kwerenda */}
                    {isExpanded && (
                      <tr className="bg-muted/20">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h3 className="text-xs font-semibold text-foreground">
                                  {polish
                                    ? `Status zapytań do wydziałów UM Bydgoszcz (${repliedCount} z ${totalDepts} odpowiedzi)`
                                    : `UM Bydgoszcz Department Replies (${repliedCount} of ${totalDepts} received)`}
                                </h3>
                                {item.externalAuthorityName && (
                                  <p className="mt-0.5 text-[11px] text-purple-700 dark:text-purple-300">
                                    {polish ? "Właściwy podmiot zewnętrzny:" : "External authority:"}{" "}
                                    <strong>{item.externalAuthorityName}</strong>
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  tone="main-outline"
                                  disabled={updatingCaseUuid === item.uuid}
                                  onClick={() => void handleQuickKwerenda(item)}
                                >
                                  <ClockHistory aria-hidden="true" className="size-3.5" />
                                  {polish ? "Kwerenda (+14 dni)" : "Kwerenda (+14d)"}
                                </Button>
                                <Link
                                  href={`/sprawy/${item.uuid}` as "/"}
                                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                                >
                                  {polish ? "Generator pisma i Anonimizator PII →" : "Draft Letter & PII Anonymizer →"}
                                </Link>
                              </div>
                            </div>

                            {item.departmentQueries.length === 0 ? (
                              <p className="rounded-lg border border-dashed border-border bg-background/60 px-3 py-2.5 text-xs text-muted-foreground">
                                {item.routingType === "EXTERNAL_AUTHORITY"
                                  ? polish
                                    ? "Brak zapytań wewnętrznych — sprawa dotyczy podmiotu zewnętrznego (Art. 4 ust. 3 UDIP). Otwórz sprawę, aby pobrać projekt pisma przekierowującego."
                                    : "No internal department queries — external authority redirect (Art. 4(3) UDIP)."
                                  : polish
                                    ? "Nie wysłano jeszcze zapytań do wydziałów."
                                    : "No department queries recorded yet."}
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                                {item.departmentQueries.map(dept => {
                                  const isReplied = dept.status === "REPLIED";
                                  const isComposing = replyTargetDeptUuid === dept.uuid;
                                  return (
                                    <div
                                      key={dept.uuid}
                                      className="rounded-lg border border-border bg-background p-3 space-y-2"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="font-semibold text-foreground">
                                          {dept.departmentName}
                                        </span>
                                        <span
                                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                            isReplied
                                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                              : dept.status === "KWERENDA_REQUESTED"
                                                ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                                                : "bg-red-500/15 text-red-700 dark:text-red-300"
                                          }`}
                                        >
                                          {isReplied
                                            ? polish ? "🟢 Odpowiedź otrzymana" : "🟢 Replied"
                                            : dept.status === "KWERENDA_REQUESTED"
                                              ? polish ? "🟠 Wniosek o kwerendę" : "🟠 Kwerenda"
                                              : polish ? "🔴 Oczekujemy na odpowiedź" : "🔴 Pending"}
                                        </span>
                                      </div>

                                      {dept.replyText && (
                                        <p className="rounded bg-muted/40 p-2 text-[11px] text-foreground">
                                          {dept.replyText}
                                        </p>
                                      )}
                                      {dept.replyFileName && (
                                        <p className="font-mono text-[11px] text-blue-700 dark:text-blue-300">
                                          📎 {dept.replyFileName}
                                        </p>
                                      )}

                                      {!isComposing ? (
                                        <Button
                                          size="sm"
                                          tone="ghost"
                                          onClick={() => {
                                            setReplyTargetDeptUuid(dept.uuid);
                                            setReplyTextDraft(dept.replyText ?? "");
                                            setReplyFileNameDraft(dept.replyFileName ?? "");
                                          }}
                                        >
                                          <PlusCircle aria-hidden="true" className="size-3.5" />
                                          {isReplied
                                            ? polish ? "Edytuj odpowiedź wydziału" : "Edit department reply"
                                            : polish ? "Wklej e-mail / Dołącz PDF od wydziału" : "Paste email / Attach PDF"}
                                        </Button>
                                      ) : (
                                        <form
                                          onSubmit={e => void handleSubmitDepartmentReply(e, item.uuid)}
                                          className="space-y-2 border-t border-border pt-2"
                                        >
                                          <textarea
                                            value={replyTextDraft}
                                            onChange={e => setReplyTextDraft(e.target.value)}
                                            rows={3}
                                            placeholder={polish ? "Wklej treść odpowiedzi z maila wydziału…" : "Paste email reply text from department…"}
                                            className="w-full rounded-md border border-border bg-surface p-2 text-xs"
                                          />
                                          <Input
                                            type="text"
                                            value={replyFileNameDraft}
                                            onChange={e => setReplyFileNameDraft(e.target.value)}
                                            placeholder={polish ? "Nazwa załącznika PDF/DOCX (opcjonalnie)" : "Attachment PDF/DOCX name (optional)"}
                                          />
                                          <div className="flex items-center gap-2">
                                            <Button
                                              type="submit"
                                              size="sm"
                                              tone="primary"
                                              disabled={submittingReply}
                                            >
                                              {submittingReply
                                                ? polish ? "Zapisywanie…" : "Saving…"
                                                : polish ? "Zapisz odpowiedź (🟢)" : "Save reply (🟢)"}
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              tone="ghost"
                                              onClick={() => setReplyTargetDeptUuid(null)}
                                            >
                                              {polish ? "Anuluj" : "Cancel"}
                                            </Button>
                                          </div>
                                        </form>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}

              {filteredCases.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {polish ? "Brak spraw spełniających wybrane filtry." : "No cases match the selected filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
