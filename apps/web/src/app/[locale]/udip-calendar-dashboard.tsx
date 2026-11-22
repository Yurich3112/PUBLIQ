"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bank,
  BellFill,
  CalendarEvent,
  CheckCircleFill,
  ChevronDown,
  ChevronRight,
  ClockHistory,
  EnvelopePaper,
  ExclamationTriangleFill,
  Eye,
  FileEarmarkPlus,
  LightningChargeFill,
  Paperclip,
  PlusCircle,
  Search,
  XLg,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Link } from "@/i18n/navigation";
import { Button, Input, Throbber } from "@/ui/basic";
import {
  DepartmentDocPreviewModal,
  type DepartmentDocPreviewData,
} from "./department-doc-preview-modal";

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

const COMMON_UMB_DEPARTMENTS = [
  "Wydział Edukacji i Sportu",
  "Wydział Zieleni i Gospodarki Komunalnej",
  "Schronisko dla Zwierząt w Bydgoszczy",
  "Wydział Spraw Obywatelskich",
  "Wydział Inwestycji Miasta",
  "Wydział Administracji Budowlanej",
  "Wydział Mienia i Geodezji",
  "Wydział Funduszy Europejskich",
];

type CaseVisualTone = "RED" | "ORANGE" | "GREEN" | "COMPLETED";

const TONE_SORT_RANK: Record<CaseVisualTone, number> = {
  RED: 0,
  ORANGE: 1,
  GREEN: 2,
  COMPLETED: 3,
};

function getCaseVisualState(item: UdipCaseRow): {
  tone: CaseVisualTone;
  repliedCount: number;
  totalDepts: number;
  hasAllResponses: boolean;
  isDeadlineClose: boolean;
} {
  const totalDepts = item.departmentQueries.length;
  const repliedCount = item.departmentQueries.filter(d => d.status === "REPLIED").length;
  const hasAllResponses =
    totalDepts === 0
      ? item.processStatus === "D" || item.processStatus === "E" || item.routingType === "EXTERNAL_AUTHORITY"
      : repliedCount === totalDepts;
  const isDeadlineClose = item.daysRemaining <= 3;

  if (item.processStatus === "E") {
    return { tone: "COMPLETED", repliedCount, totalDepts, hasAllResponses, isDeadlineClose };
  }
  if (!hasAllResponses && isDeadlineClose) {
    return { tone: "RED", repliedCount, totalDepts, hasAllResponses, isDeadlineClose };
  }
  if ((hasAllResponses && isDeadlineClose) || (!hasAllResponses && !isDeadlineClose)) {
    return { tone: "ORANGE", repliedCount, totalDepts, hasAllResponses, isDeadlineClose };
  }
  return { tone: "GREEN", repliedCount, totalDepts, hasAllResponses, isDeadlineClose };
}

export function UdipCalendarDashboard({ polish }: { polish: boolean }) {
  const [data, setData] = useState<CasesApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState(false);

  // Filters
  const [yearFilter, setYearFilter] = useState<"ALL" | 2026 | 2025>("ALL");
  const [healthFilter, setHealthFilter] = useState<"ALL" | "GREEN" | "RED" | "MULTI">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | UdipCaseRow["processStatus"]>("ALL");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [search, setSearch] = useState("");

  // Expandable row + inline department reply composer
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);
  const [replyTargetDeptUuid, setReplyTargetDeptUuid] = useState<string | null>(null);
  const [replyTextDraft, setReplyTextDraft] = useState("");
  const [replyFileNameDraft, setReplyFileNameDraft] = useState("");
  const [localFilePreviews, setLocalFilePreviews] = useState<
    Record<string, { url: string; mime: string }>
  >({});
  const [previewDoc, setPreviewDoc] = useState<DepartmentDocPreviewData | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [updatingCaseUuid, setUpdatingCaseUuid] = useState<string | null>(null);

  // Quick Register Modal (manual / email intake without scanner)
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickApplicant, setQuickApplicant] = useState("");
  const [quickSubject, setQuickSubject] = useState("");
  const [quickRegistry, setQuickRegistry] = useState("");
  const [quickDepts, setQuickDepts] = useState<string[]>([]);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState(false);

  useEffect(() => {
    if (loading || unauthorized) return;
    document.body.dataset.viewportLock = "calendar";
    return () => {
      if (document.body.dataset.viewportLock === "calendar") {
        delete document.body.dataset.viewportLock;
      }
    };
  }, [loading, unauthorized]);

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

  const completedCount = useMemo(
    () => (data ? data.cases.filter(c => c.processStatus === "E").length : 0),
    [data],
  );

  const urgentCount = useMemo(
    () =>
      data
        ? data.cases.filter(c => {
            const { tone } = getCaseVisualState(c);
            return tone === "RED" || tone === "ORANGE";
          }).length
        : 0,
    [data],
  );

  const filteredCases = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.cases
      .filter(item => {
        const { tone } = getCaseVisualState(item);
        if (hideCompleted && tone === "COMPLETED") return false;
        if (yearFilter !== "ALL" && item.year !== yearFilter) return false;
        if (healthFilter === "GREEN" && tone !== "GREEN" && tone !== "COMPLETED") return false;
        if (healthFilter === "RED" && tone !== "RED" && tone !== "ORANGE") return false;
        if (healthFilter === "MULTI" && !item.isMultiDepartment) return false;
        if (statusFilter !== "ALL" && item.processStatus !== statusFilter) return false;
        if (q) {
          const hay = `${item.caseNumber} ${item.applicantName} ${item.subject} ${item.externalAuthorityName ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const stateA = getCaseVisualState(a);
        const stateB = getCaseVisualState(b);
        const rankDiff = TONE_SORT_RANK[stateA.tone] - TONE_SORT_RANK[stateB.tone];
        if (rankDiff !== 0) return rankDiff;
        if (stateA.tone === "COMPLETED") {
          return b.receivedDate.localeCompare(a.receivedDate);
        }
        if (a.daysRemaining !== b.daysRemaining) {
          return a.daysRemaining - b.daysRemaining;
        }
        return a.receivedDate.localeCompare(b.receivedDate);
      });
  }, [data, hideCompleted, yearFilter, healthFilter, statusFilter, search]);

  const hasActiveFilters =
    hideCompleted ||
    yearFilter !== "ALL" ||
    healthFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    search.trim().length > 0;

  function resetFilters() {
    setHideCompleted(false);
    setYearFilter("ALL");
    setHealthFilter("ALL");
    setStatusFilter("ALL");
    setSearch("");
  }

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

  async function handleQuickClarification(item: UdipCaseRow) {
    setUpdatingCaseUuid(item.uuid);
    try {
      await fetch(API_ROUTES.caseById.replace("{uuid}", item.uuid), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          processStatus: "C",
          deadlineNote: "Wezwanie do doprecyzowania zakresu wniosku (7 dni)",
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

  async function handleQuickRegister(event: FormEvent) {
    event.preventDefault();
    if (!quickApplicant.trim() || !quickSubject.trim()) return;
    setQuickSaving(true);
    setQuickError(false);
    try {
      const res = await fetch(API_ROUTES.cases, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          applicantName: quickApplicant.trim(),
          subject: quickSubject.trim(),
          registryNumber: quickRegistry.trim() || null,
          sourceMode: "email_text",
          verifiedRequestText: quickSubject.trim(),
          departments: quickDepts.map(departmentName => ({ departmentName })),
        }),
      });
      if (!res.ok) {
        setQuickError(true);
        return;
      }
      setQuickApplicant("");
      setQuickSubject("");
      setQuickRegistry("");
      setQuickDepts([]);
      setQuickOpen(false);
      await loadCases();
    } catch {
      setQuickError(true);
    } finally {
      setQuickSaving(false);
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
      <div className="mx-auto flex min-h-[68vh] w-full max-w-md flex-col items-center justify-center px-4 py-12">
        <div className="w-full space-y-5 rounded-xl border border-border bg-surface p-7 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bank aria-hidden="true" className="size-6" />
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              {polish ? "Urząd Miasta Bydgoszczy · BKS" : "City Hall of Bydgoszcz · BKS"}
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              {polish ? "Asystent UDIP" : "UDIP Assistant"}
            </h1>
          </div>
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            {polish
              ? "Zaloguj się w prawym górnym rogu, aby otworzyć rejestr wniosków."
              : "Sign in in the top-right corner to open the request registry."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-udip-calendar
      className="mx-auto flex w-full max-w-[1480px] flex-1 min-h-0 flex-col gap-3.5 px-4 py-4 sm:px-6"
    >
      {/* Operational Clerk Header */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <CalendarEvent aria-hidden="true" className="size-3.5" />
            <span>{polish ? "Urząd Miasta Bydgoszczy · Biuro Komunikacji Społecznej (AIP)" : "City Hall of Bydgoszcz · Public Communication Office"}</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {polish ? "Kalendarz i Rejestr Wniosków UDIP" : "UDIP Request Calendar & Organizer"}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            tone="main-outline"
            onClick={() => setQuickOpen(true)}
          >
            <EnvelopePaper aria-hidden="true" className="size-4" />
            {polish ? "Szybka rejestracja (e-mail)" : "Quick Register (email)"}
          </Button>
          <Link
            href="/ocr"
            className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
          >
            <FileEarmarkPlus aria-hidden="true" className="size-4" />
            {polish ? "Nowy wniosek (PDF/WORD)" : "New Request (PDF/WORD)"}
          </Link>
        </div>
      </header>

      {/* Urgent Alerts Strip (permanently mounted when urgent cases exist so layout never jumps) */}
      {data && urgentCount > 0 && (
        <div
          role="status"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/35 bg-red-500/8 px-3.5 py-2 text-xs text-red-950 dark:text-red-100"
        >
          <div className="flex items-center gap-2">
            <BellFill aria-hidden="true" className="size-3.5 shrink-0 text-red-600 dark:text-red-400" />
            <span>
              {healthFilter === "RED"
                ? polish
                  ? `Filtr aktywny: wyświetlono ${urgentCount} pilnych / oczekujących spraw wymagających reakcji.`
                  : `Filter active: showing ${urgentCount} urgent / pending cases.`
                : polish
                  ? `Uwaga: ${urgentCount} spraw wymaga pilnej reakcji lub oczekuje na odpowiedzi wydziałów.`
                  : `Alert: ${urgentCount} cases require urgent attention or await department replies.`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setHealthFilter(healthFilter === "RED" ? "ALL" : "RED")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
              healthFilter === "RED"
                ? "border border-red-600/50 bg-background text-red-700 hover:bg-red-500/10 dark:text-red-300"
                : "bg-red-600 text-white hover:bg-red-700"
            }`}
          >
            {healthFilter === "RED"
              ? polish ? "Pokaż wszystkie" : "Show all"
              : polish ? "Pokaż pilne" : "Show urgent"}
          </button>
        </div>
      )}

      {/* 4 Compact Clickable KPI Filter Tiles */}
      {data && (
        <div className="grid shrink-0 grid-cols-2 gap-2.5 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setHealthFilter("ALL")}
            className={`flex flex-col items-start rounded-lg border px-4 py-3 text-left transition ${
              healthFilter === "ALL"
                ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                : "border-border bg-surface hover:bg-muted/40"
            }`}
          >
            <span className="text-[11px] font-medium text-muted-foreground">
              {polish ? "Wszystkie sprawy w rejestrze" : "All active & archival cases"}
            </span>
            <span className="mt-0.5 text-2xl font-bold tabular-nums text-foreground">{data.total}</span>
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter(healthFilter === "GREEN" ? "ALL" : "GREEN")}
            className={`flex flex-col items-start rounded-lg border px-4 py-3 text-left transition ${
              healthFilter === "GREEN"
                ? "border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600/30"
                : "border-border bg-surface hover:bg-muted/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircleFill aria-hidden="true" className="size-3.5" />
              {polish ? "W terminie / Zakończone" : "On Track / Completed"}
            </span>
            <span className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {data.greenCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter(healthFilter === "RED" ? "ALL" : "RED")}
            className={`flex flex-col items-start rounded-lg border px-4 py-3 text-left transition ${
              healthFilter === "RED"
                ? "border-red-600 bg-red-500/10 ring-1 ring-red-600/30"
                : "border-border bg-surface hover:bg-muted/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 dark:text-red-400">
              <ExclamationTriangleFill aria-hidden="true" className="size-3.5" />
              {polish ? "Pilne / Po terminie / Kwerenda" : "Urgent / Overdue / Kwerenda"}
            </span>
            <span className="mt-0.5 text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">
              {data.redCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHealthFilter(healthFilter === "MULTI" ? "ALL" : "MULTI")}
            className={`flex flex-col items-start rounded-lg border px-4 py-3 text-left transition ${
              healthFilter === "MULTI"
                ? "border-amber-600 bg-amber-500/10 ring-1 ring-amber-600/30"
                : "border-border bg-surface hover:bg-muted/40"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
              <LightningChargeFill aria-hidden="true" className="size-3.5" />
              {polish ? "Sprawy wielo-wydziałowe" : "Multi-Department Cases"}
            </span>
            <span className="mt-0.5 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">
              {data.multiDepartmentCount}
            </span>
          </button>
        </div>
      )}

      {/* Operational Filter & Search Bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Year Toggle */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5">
            {(["ALL", 2026, 2025] as const).map(yr => (
              <button
                key={String(yr)}
                type="button"
                onClick={() => setYearFilter(yr)}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
                  yearFilter === yr
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {yr === "ALL" ? (polish ? "Wszystkie lata" : "All years") : yr}
              </button>
            ))}
          </div>

          {/* Process Status Pills A-E */}
          <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">Status:</span>
            {(["ALL", "A", "B", "C", "D", "E"] as const).map(code => (
              <button
                key={code}
                type="button"
                title={code === "ALL" ? undefined : statusLabels[code]}
                onClick={() => setStatusFilter(code)}
                className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                  statusFilter === code
                    ? "bg-foreground text-background"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {code === "ALL" ? (polish ? "Wszystkie" : "All") : code}
              </button>
            ))}
          </div>

          {/* Hide Completed Toggle */}
          <button
            type="button"
            aria-pressed={hideCompleted}
            onClick={() => setHideCompleted(v => !v)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
              hideCompleted
                ? "border-primary bg-primary/12 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {polish
              ? hideCompleted
                ? `Zakończone ukryte (${completedCount})`
                : `Ukryj zakończone (${completedCount})`
              : hideCompleted
                ? `Completed hidden (${completedCount})`
                : `Hide completed (${completedCount})`}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-medium text-primary hover:underline"
            >
              {polish ? "Wyczyść filtry" : "Clear filters"}
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={polish ? "Szukaj sygnatury, wnioskodawcy, tematu…" : "Search signature, applicant, subject…"}
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3.5 text-sm text-red-700 dark:text-red-300">
          {polish ? "Nie udało się pobrać spraw z bazy danych." : "Failed to load cases from database."}
        </div>
      )}

      {/* Main Calendar Table with Expandable Per-Department Rows (independently scrollable) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-12 px-3 py-2.5 text-center">Lp.</th>
                <th className="px-3 py-2.5">{polish ? "Sygnatura" : "Case ID"}</th>
                <th className="px-3 py-2.5">{polish ? "Wnioskodawca i przedmiot zapytania" : "Applicant & Subject"}</th>
                <th className="px-3 py-2.5">{polish ? "Termin / Pozostało" : "Deadline"}</th>
                <th className="px-3 py-2.5 text-center">{polish ? "Os." : "Clerk"}</th>
                <th className="px-3 py-2.5">{polish ? "Status procesu (A–E)" : "Process Status"}</th>
                <th className="px-3 py-2.5 text-right">{polish ? "Akcja" : "Action"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCases.map((item, idx) => {
                const isExpanded = expandedUuid === item.uuid;
                const { tone, repliedCount, totalDepts, hasAllResponses } = getCaseVisualState(item);
                const progressPct = totalDepts > 0 ? Math.round((repliedCount / totalDepts) * 100) : 0;

                const rowClasses =
                  tone === "COMPLETED"
                    ? "border-l-4 border-l-neutral-400 bg-muted/30 text-muted-foreground hover:bg-muted/50 dark:border-l-neutral-600"
                    : tone === "RED"
                      ? "border-l-4 border-l-red-500 bg-red-500/[0.04] hover:bg-red-500/[0.08]"
                      : tone === "ORANGE"
                        ? "border-l-4 border-l-amber-500 bg-amber-500/[0.04] hover:bg-amber-500/[0.08]"
                        : "border-l-4 border-l-emerald-500 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.07]";

                const progressBarColor =
                  tone === "COMPLETED"
                    ? "bg-neutral-400 dark:bg-neutral-500"
                    : hasAllResponses
                      ? "bg-emerald-600"
                      : tone === "RED"
                        ? "bg-red-600"
                        : "bg-amber-500";

                const deadlineBadgeClasses =
                  tone === "COMPLETED"
                    ? "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300"
                    : tone === "RED"
                      ? "bg-red-500/15 text-red-800 dark:text-red-200"
                      : tone === "ORANGE"
                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                        : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";

                return (
                  <FragmentRow key={item.uuid}>
                    <tr
                      onClick={() => setExpandedUuid(isExpanded ? null : item.uuid)}
                      className={`cursor-pointer transition ${rowClasses}`}
                    >
                      <td className="px-3 py-3 text-center font-mono tabular-nums text-muted-foreground">
                        <div className="inline-flex items-center gap-1">
                          {isExpanded ? (
                            <ChevronDown aria-hidden="true" className="size-3.5" />
                          ) : (
                            <ChevronRight aria-hidden="true" className="size-3.5" />
                          )}
                          <span>{idx + 1}</span>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        <div className={`font-mono font-semibold tabular-nums ${tone === "COMPLETED" ? "text-muted-foreground" : "text-foreground"}`}>
                          {item.caseNumber}
                        </div>
                        <div className="text-[11px] tabular-nums text-muted-foreground">
                          {polish ? "Wpływ:" : "In:"} {item.receivedDate.slice(0, 10)}
                        </div>
                      </td>

                      <td className="max-w-md px-3 py-3">
                        <div className={`font-semibold ${tone === "COMPLETED" ? "text-muted-foreground" : "text-foreground"}`}>
                          {item.applicantName}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-muted-foreground">{item.subject}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {totalDepts > 0 && (
                            <div
                              className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-2 py-0.5"
                              title={polish ? `Odpowiedzi wydziałów: ${repliedCount} z ${totalDepts}` : `Department replies: ${repliedCount} of ${totalDepts}`}
                            >
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                                <div
                                  className={`h-full rounded-full transition-all ${progressBarColor}`}
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-semibold tabular-nums text-foreground">
                                {repliedCount}/{totalDepts} {polish ? "odp." : "rep."}
                              </span>
                            </div>
                          )}
                          {item.isMultiDepartment && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                              <LightningChargeFill aria-hidden="true" className="size-2.5" />
                              {polish ? "Wielo-wydziałowy" : "Multi-dept"}
                            </span>
                          )}
                          {item.routingType === "EXTERNAL_AUTHORITY" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {polish ? "Brak dysponenta (Art. 4 ust. 3)" : "External Authority"}
                            </span>
                          )}
                          {item.matchedCaseNumber && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
                              {polish ? `Bliźniacza: ${item.matchedCaseNumber}` : `Twin: ${item.matchedCaseNumber}`}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-3 py-3">
                        <div className={`font-medium tabular-nums ${tone === "COMPLETED" ? "text-muted-foreground" : "text-foreground"}`}>
                          {item.deadlineDate.slice(0, 10)}
                        </div>
                        <span
                          className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${deadlineBadgeClasses}`}
                        >
                          {item.processStatus === "E"
                            ? polish ? "Wysłano w terminie" : "Sent on time"
                            : item.daysRemaining < 0
                              ? polish ? `Po terminie (${Math.abs(item.daysRemaining)} dni)` : `Overdue (${Math.abs(item.daysRemaining)}d)`
                              : item.daysRemaining === 0
                                ? polish ? "Termin DZISIAJ" : "Due TODAY"
                                : polish ? `Pozostało ${item.daysRemaining} dni` : `${item.daysRemaining}d left`}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <span
                          title={item.assigneeName}
                          className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-background font-mono text-[11px] font-bold text-foreground"
                        >
                          {item.assigneeInitials}
                        </span>
                      </td>

                      <td
                        className="px-3 py-3"
                        onClick={event => event.stopPropagation()}
                      >
                        <select
                          aria-label={polish ? `Status procesu dla ${item.caseNumber}` : `Process status for ${item.caseNumber}`}
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
                        className="whitespace-nowrap px-3 py-3 text-right"
                        onClick={event => event.stopPropagation()}
                      >
                        <Link
                          href={`/sprawy/${item.uuid}` as "/"}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
                        >
                          {polish ? "Otwórz" : "Open"}
                          <ArrowRight aria-hidden="true" className="size-3" />
                        </Link>
                      </td>
                    </tr>

                    {/* Expanded Inline Drawer: Queried Departments + Paste Email / Attach File / Kwerenda */}
                    {isExpanded && (
                      <tr className="bg-muted/20">
                        <td colSpan={7} className="px-5 py-4">
                          <div className="space-y-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2.5">
                                  <h3 className="text-xs font-semibold text-foreground">
                                    {polish
                                      ? `Status zapytań do wydziałów UM Bydgoszcz (${repliedCount} z ${totalDepts} odpowiedzi)`
                                      : `UM Bydgoszcz Department Replies (${repliedCount} of ${totalDepts} received)`}
                                  </h3>
                                  {totalDepts > 0 && (
                                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-border">
                                      <div
                                        className="h-full rounded-full bg-emerald-600 transition-all"
                                        style={{ width: `${Math.round((repliedCount / totalDepts) * 100)}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                                {item.deadlineNote && (
                                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                    {item.deadlineNote}
                                  </p>
                                )}
                                {item.externalAuthorityName && (
                                  <p className="text-[11px] text-primary">
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
                                <Button
                                  size="sm"
                                  tone="main-outline"
                                  disabled={updatingCaseUuid === item.uuid}
                                  onClick={() => void handleQuickClarification(item)}
                                >
                                  {polish ? "Doprecyzowanie (7 dni)" : "Clarification (7d)"}
                                </Button>
                                <Link
                                  href={`/sprawy/${item.uuid}` as "/"}
                                  className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
                                >
                                  {polish ? "Generator pisma i Anonimizator PII" : "Draft Letter & PII Anonymizer"}
                                  <ArrowRight aria-hidden="true" className="size-3" />
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
                                      className="space-y-2 rounded-lg border border-border bg-background p-3"
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
                                            ? polish ? "Odpowiedź otrzymana" : "Replied"
                                            : dept.status === "KWERENDA_REQUESTED"
                                              ? polish ? "Wniosek o kwerendę" : "Kwerenda"
                                              : polish ? "Oczekuje na odpowiedź" : "Pending"}
                                        </span>
                                      </div>

                                      {dept.questionText && !dept.replyText && (
                                        <div className="rounded border border-border/70 bg-muted/25 p-2 text-[11px]">
                                          <span className="font-semibold text-muted-foreground">
                                            {polish ? "Wysłane zapytanie do wydziału:" : "Sent department query:"}
                                          </span>
                                          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-foreground">
                                            {dept.questionText}
                                          </p>
                                        </div>
                                      )}
                                      {dept.replyText && (
                                        <p className="line-clamp-3 rounded bg-muted/40 p-2 text-[11px] text-foreground">
                                          {dept.replyText}
                                        </p>
                                      )}
                                      {!isComposing ? (
                                        <div className="flex flex-nowrap items-center justify-between gap-2 pt-0.5">
                                          <div className="flex min-w-0 items-center gap-2">
                                            {dept.replyFileName && (
                                              <>
                                                <span
                                                  title={dept.replyFileName}
                                                  className="inline-flex min-w-0 items-center gap-1.5 truncate rounded border border-primary/25 bg-primary/8 px-2 py-1 font-mono text-[11px] font-medium text-primary"
                                                >
                                                  <Paperclip aria-hidden="true" className="size-3 shrink-0" />
                                                  <span className="truncate">{dept.replyFileName}</span>
                                                </span>
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
                                                      repliedAt: dept.repliedAt,
                                                      previewUrl: localFilePreviews[dept.uuid]?.url ?? null,
                                                      previewMime: localFilePreviews[dept.uuid]?.mime ?? null,
                                                    })
                                                  }
                                                >
                                                  <Eye aria-hidden="true" className="size-3.5" />
                                                  {polish ? "Podgląd dokumentu" : "Preview document"}
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                          <Button
                                            size="sm"
                                            tone="ghost"
                                            className="shrink-0 whitespace-nowrap"
                                            onClick={() => {
                                              setReplyTargetDeptUuid(dept.uuid);
                                              setReplyTextDraft(dept.replyText ?? "");
                                              setReplyFileNameDraft(dept.replyFileName ?? "");
                                            }}
                                          >
                                            <PlusCircle aria-hidden="true" className="size-3.5" />
                                            {isReplied
                                              ? polish ? "Edytuj odpowiedź" : "Edit reply"
                                              : polish ? "Wklej e-mail / Dołącz plik" : "Paste email / Attach file"}
                                          </Button>
                                        </div>
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
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Input
                                              type="text"
                                              value={replyFileNameDraft}
                                              onChange={e => setReplyFileNameDraft(e.target.value)}
                                              placeholder={polish ? "Załącznik PDF/DOCX (opcjonalnie)" : "PDF/DOCX attachment (optional)"}
                                              className="flex-1 text-xs"
                                            />
                                            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted">
                                              <Paperclip aria-hidden="true" className="size-3" />
                                              {polish ? "Wybierz plik" : "Pick file"}
                                              <input
                                                type="file"
                                                accept=".pdf,.doc,.docx,.xlsx,.txt,.png,.jpg,.jpeg"
                                                className="hidden"
                                                onChange={e => {
                                                  const f = e.target.files?.[0];
                                                  if (f) {
                                                    setReplyFileNameDraft(f.name);
                                                    const url = URL.createObjectURL(f);
                                                    setLocalFilePreviews(prev => ({
                                                      ...prev,
                                                      [dept.uuid]: { url, mime: f.type },
                                                    }));
                                                  }
                                                }}
                                              />
                                            </label>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Button
                                              type="submit"
                                              size="sm"
                                              tone="primary"
                                              disabled={submittingReply}
                                            >
                                              {submittingReply
                                                ? polish ? "Zapisywanie…" : "Saving…"
                                                : polish ? "Zapisz odpowiedź" : "Save reply"}
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

      {/* Quick Register Modal (Manual / Plain Email Request) */}
      {quickOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-register-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl border border-border bg-background p-5 shadow-panel space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 id="quick-register-title" className="text-base font-semibold text-foreground">
                  {polish ? "Szybka rejestracja wniosku (e-mail / tekst)" : "Quick Register Request (Email / Text)"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {polish
                    ? "System automatycznie nada sygnaturę BKS.IV.1431.X.2026 oraz 14-dniowy termin ustawowy."
                    : "The system automatically assigns BKS.IV.1431.X.2026 signature and 14-day statutory deadline."}
                </p>
              </div>
              <button
                type="button"
                aria-label={polish ? "Zamknij" : "Close"}
                onClick={() => setQuickOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XLg aria-hidden="true" className="size-4" />
              </button>
            </div>

            <form onSubmit={e => void handleQuickRegister(e)} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">
                    {polish ? "Wnioskodawca *" : "Applicant *"}
                  </span>
                  <Input
                    required
                    value={quickApplicant}
                    onChange={e => setQuickApplicant(e.target.value)}
                    placeholder={polish ? "np. Jan Kowalski / Fundacja..." : "e.g. Jan Kowalski"}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-muted-foreground">
                    {polish ? "Nr wpływu kancelaryjnego" : "Registry number"}
                  </span>
                  <Input
                    value={quickRegistry}
                    onChange={e => setQuickRegistry(e.target.value)}
                    placeholder="np. 4120/2026"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-muted-foreground">
                  {polish ? "Przedmiot zapytania / treść wniosku *" : "Subject / Request text *"}
                </span>
                <textarea
                  required
                  rows={3}
                  value={quickSubject}
                  onChange={e => setQuickSubject(e.target.value)}
                  placeholder={polish ? "Opisz lub wklej treść pytania z wniosku UDIP…" : "Describe or paste the UDIP request…"}
                  className="w-full rounded-md border border-input-border bg-input p-2.5 text-xs text-input-foreground"
                />
              </label>

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {polish ? "Wydziały merytoryczne UM Bydgoszczy (opcjonalnie)" : "UM Bydgoszcz departments (optional)"}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_UMB_DEPARTMENTS.map(dept => {
                    const selected = quickDepts.includes(dept);
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() =>
                          setQuickDepts(prev =>
                            prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept],
                          )
                        }
                        className={`rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                          selected
                            ? "border-primary bg-primary/12 text-primary"
                            : "border-border bg-surface text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>

              {quickError && (
                <p role="alert" className="text-xs text-red-600">
                  {polish ? "Nie udało się zapisać wniosku. Spróbuj ponownie." : "Failed to save request. Please try again."}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                <Button type="button" tone="ghost" onClick={() => setQuickOpen(false)}>
                  {polish ? "Anuluj" : "Cancel"}
                </Button>
                <Button type="submit" tone="primary" disabled={quickSaving}>
                  {quickSaving
                    ? polish ? "Rejestrowanie…" : "Registering…"
                    : polish ? "Zarejestruj w Kalendarzu" : "Register in Calendar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <DepartmentDocPreviewModal
        doc={previewDoc}
        polish={polish}
        onClose={() => setPreviewDoc(null)}
      />
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
