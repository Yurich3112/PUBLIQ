"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bank,
  CalendarEvent,
  CheckCircleFill,
  ClockHistory,
  Diagram3,
  ExclamationTriangleFill,
  FileEarmarkPlus,
  LightningChargeFill,
  ShieldCheck,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Link } from "@/i18n/navigation";
import { Throbber } from "@/ui/basic";

interface DeptQueryMini {
  status: "PENDING" | "REPLIED" | "KWERENDA_REQUESTED";
}

interface HomeCaseRow {
  uuid: string;
  caseNumber: string;
  applicantName: string;
  subject: string;
  deadlineDate: string;
  processStatus: "A" | "B" | "C" | "D" | "E";
  routingType: "INTERNAL_DEPARTMENTS" | "EXTERNAL_AUTHORITY" | "CLARIFICATION_7D";
  isMultiDepartment: boolean;
  daysRemaining: number;
  departmentQueries: DeptQueryMini[];
}

interface CasesApiResponse {
  status: "ok";
  total: number;
  cases: HomeCaseRow[];
}

type CaseTone = "RED" | "ORANGE" | "GREEN" | "COMPLETED";

const TONE_RANK: Record<CaseTone, number> = {
  RED: 0,
  ORANGE: 1,
  GREEN: 2,
  COMPLETED: 3,
};

function classifyCase(item: HomeCaseRow): {
  tone: CaseTone;
  repliedCount: number;
  totalDepts: number;
  hasAllResponses: boolean;
} {
  const totalDepts = item.departmentQueries.length;
  const repliedCount = item.departmentQueries.filter(d => d.status === "REPLIED").length;
  const hasAllResponses =
    totalDepts === 0
      ? item.processStatus === "D" || item.processStatus === "E" || item.routingType === "EXTERNAL_AUTHORITY"
      : repliedCount === totalDepts;
  const isDeadlineClose = item.daysRemaining <= 3;

  if (item.processStatus === "E") {
    return { tone: "COMPLETED", repliedCount, totalDepts, hasAllResponses };
  }
  if (!hasAllResponses && isDeadlineClose) {
    return { tone: "RED", repliedCount, totalDepts, hasAllResponses };
  }
  if ((hasAllResponses && isDeadlineClose) || (!hasAllResponses && !isDeadlineClose)) {
    return { tone: "ORANGE", repliedCount, totalDepts, hasAllResponses };
  }
  return { tone: "GREEN", repliedCount, totalDepts, hasAllResponses };
}

export function UdipHomeDashboard({
  polish,
  signedIn,
  firstName,
  isAdmin,
}: {
  polish: boolean;
  signedIn: boolean;
  firstName: string | null;
  isAdmin: boolean;
}) {
  const [cases, setCases] = useState<HomeCaseRow[]>([]);
  const [loading, setLoading] = useState(signedIn);

  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    async function load() {
      try {
        const res = await fetch(API_ROUTES.cases, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as CasesApiResponse;
        if (!controller.signal.aborted && json.status === "ok") {
          setCases(json.cases);
        }
      } catch {
        // Ignore transient or abort errors
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [signedIn]);

  const stats = useMemo(() => {
    let dueTodayOrOverdue = 0;
    let awaitingDepts = 0;
    let readyOrOnTrack = 0;
    let completed = 0;
    let activeTotal = 0;

    for (const item of cases) {
      const { tone, hasAllResponses } = classifyCase(item);
      if (tone === "COMPLETED") {
        completed++;
        continue;
      }
      activeTotal++;
      if (item.daysRemaining <= 0) dueTodayOrOverdue++;
      if (!hasAllResponses) awaitingDepts++;
      else readyOrOnTrack++;
    }
    return { dueTodayOrOverdue, awaitingDepts, readyOrOnTrack, completed, activeTotal };
  }, [cases]);

  const urgentPreview = useMemo(() => {
    return cases
      .filter(item => item.processStatus !== "E")
      .sort((a, b) => {
        const ra = TONE_RANK[classifyCase(a).tone];
        const rb = TONE_RANK[classifyCase(b).tone];
        if (ra !== rb) return ra - rb;
        return a.daysRemaining - b.daysRemaining;
      })
      .slice(0, 4);
  }, [cases]);

  const todayLabel = useMemo(() => {
    return new Intl.DateTimeFormat(polish ? "pl-PL" : "en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  }, [polish]);

  if (!signedIn) {
    return (
      <div className="mx-auto flex min-h-[74vh] w-full max-w-4xl flex-col items-center justify-center px-4 py-10">
        <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
          {/* Top Split Hero: Left Text + Right Big Logo on clear background */}
          <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-12">
            <div className="z-10 flex flex-col items-center space-y-4 px-8 pt-10 text-center sm:col-span-6 sm:pb-6 sm:pl-12 sm:pr-4">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xs">
                <Bank aria-hidden="true" className="size-8" />
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {polish ? "Urząd Miasta Bydgoszczy · BKS" : "City Hall of Bydgoszcz · BKS"}
                </p>
                <h1 className="text-4xl font-bold tracking-tight text-foreground">
                  {polish ? "Asystent UDIP" : "UDIP Assistant"}
                </h1>
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {polish
                    ? "Obsługa wniosków o informację publiczną (Zarządzenie nr 535/2024)."
                    : "Public information request management (Regulation No. 535/2024)."}
                </p>
              </div>
            </div>

            <div className="relative flex items-start justify-end sm:col-span-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-big.png"
                alt={polish ? "Asystent UDIP — ilustracja" : "UDIP Assistant illustration"}
                className="block max-h-[320px] w-full object-contain object-right-top select-none"
                draggable={false}
              />
            </div>
          </div>

          {/* Feature Pills & Sign-in Footer */}
          <div className="space-y-6 px-8 pb-7 pt-5 text-center">
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 shadow-xs">
                <CalendarEvent aria-hidden="true" className="size-3.5 text-primary" />
                {polish ? "Rejestr wniosków" : "Request registry"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 shadow-xs">
                <FileEarmarkPlus aria-hidden="true" className="size-3.5 text-primary" />
                {polish ? "Weryfikator OCR" : "OCR verifier"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 shadow-xs">
                <ShieldCheck aria-hidden="true" className="size-3.5 text-primary" />
                {polish ? "Anonimizacja PII" : "PII redaction"}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span>
                {polish
                  ? "Zaloguj się w prawym górnym rogu, aby rozpocząć."
                  : "Sign in in the top-right corner to continue."}
              </span>
              <Link
                href="/about"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                {polish ? "O systemie" : "About the system"}
                <ArrowRight aria-hidden="true" className="size-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const greetingName = firstName?.trim() || (polish ? "Urzędniku" : "Clerk");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
      {/* Greeting Banner */}
      <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div className="space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="capitalize">{todayLabel}</span>
            <span>·</span>
            <span className="font-semibold text-primary">
              {isAdmin
                ? polish ? "Administrator BKS" : "BKS Administrator"
                : polish ? "Urzędnik BKS" : "BKS Clerk"}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {polish ? `Dzień dobry, ${greetingName}` : `Good morning, ${greetingName}`}
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {loading
              ? polish ? "Sprawdzanie bieżących terminów UDIP…" : "Checking today's UDIP deadlines…"
              : stats.dueTodayOrOverdue > 0
                ? polish
                  ? `Masz dzisiaj ${stats.dueTodayOrOverdue} pilnych wniosków z terminem na dziś lub po terminie oraz ${stats.awaitingDepts} spraw oczekujących na odpowiedzi wydziałów.`
                  : `You have ${stats.dueTodayOrOverdue} urgent requests due today or overdue and ${stats.awaitingDepts} cases awaiting department replies.`
                : polish
                  ? `Wszystkie terminy na dziś są pod kontrolą. Aktywnych spraw w toku: ${stats.activeTotal}.`
                  : `Today's deadlines are under control. Active cases in progress: ${stats.activeTotal}.`}
          </p>
        </div>
      </header>

      {/* Daily Briefing KPI Row */}
      <section aria-label={polish ? "Podsumowanie dnia" : "Daily summary"} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link
          href="/kalendarz"
          className="flex flex-col justify-between rounded-lg border border-red-500/35 bg-red-500/[0.05] px-3.5 py-2.5 transition hover:bg-red-500/[0.09]"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
            <ExclamationTriangleFill aria-hidden="true" className="size-3.5" />
            {polish ? "Termin dziś / po terminie" : "Due today / overdue"}
          </span>
          <span className="mt-1 text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">
            {loading ? "—" : stats.dueTodayOrOverdue}
          </span>
        </Link>

        <Link
          href="/kalendarz"
          className="flex flex-col justify-between rounded-lg border border-amber-500/35 bg-amber-500/[0.05] px-3.5 py-2.5 transition hover:bg-amber-500/[0.09]"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            <ClockHistory aria-hidden="true" className="size-3.5" />
            {polish ? "Czeka na wydziały" : "Awaiting departments"}
          </span>
          <span className="mt-1 text-2xl font-bold tabular-nums text-amber-800 dark:text-amber-300">
            {loading ? "—" : stats.awaitingDepts}
          </span>
        </Link>

        <Link
          href="/kalendarz"
          className="flex flex-col justify-between rounded-lg border border-emerald-500/35 bg-emerald-500/[0.05] px-3.5 py-2.5 transition hover:bg-emerald-500/[0.09]"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircleFill aria-hidden="true" className="size-3.5" />
            {polish ? "Komplet odpowiedzi" : "All replies ready"}
          </span>
          <span className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {loading ? "—" : stats.readyOrOnTrack}
          </span>
        </Link>

        <Link
          href="/kalendarz"
          className="flex flex-col justify-between rounded-lg border border-border bg-surface px-3.5 py-2.5 transition hover:bg-muted/50"
        >
          <span className="text-xs font-medium text-muted-foreground">
            {polish ? "Zakończone (Status E)" : "Completed (Status E)"}
          </span>
          <span className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {loading ? "—" : stats.completed}
          </span>
        </Link>
      </section>

      {/* Primary Navigation Launch Cards */}
      <section
        aria-label={polish ? "Szybki dostęp" : "Quick actions"}
        className={`grid grid-cols-1 gap-3 ${isAdmin ? "md:grid-cols-3" : "md:grid-cols-2"}`}
      >
        <Link
          href="/kalendarz"
          className="group flex flex-col justify-between gap-3 rounded-xl border border-primary/40 bg-primary/[0.05] p-4 transition hover:border-primary hover:bg-primary/[0.09]"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <CalendarEvent aria-hidden="true" className="size-4" />
              </span>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                {loading ? "…" : `${stats.activeTotal} ${polish ? "aktywnych" : "active"}`}
              </span>
            </div>
            <h2 className="text-sm font-semibold text-foreground sm:text-base">
              {polish ? "Kalendarz i Rejestr Wniosków" : "UDIP Request Calendar"}
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {polish
                ? "Przeglądaj wszystkie sprawy posortowane według pilności, monitoruj odpowiedzi wydziałów, załączaj dokumenty i zarządzaj statusami A–E."
                : "Review all cases sorted by urgency, track department replies, preview attachments, and manage statuses A–E."}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition group-hover:translate-x-0.5">
            {polish ? "Otwórz Kalendarz" : "Open Calendar"}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </span>
        </Link>

        <Link
          href="/ocr"
          className="group flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-primary/60 hover:bg-muted/30"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                <FileEarmarkPlus aria-hidden="true" className="size-4" />
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                OCR 1:1 + AI
              </span>
            </div>
            <h2 className="text-sm font-semibold text-foreground sm:text-base">
              {polish ? "Wgraj nowy wniosek (PDF / Skan)" : "Upload New Request (PDF / Scan)"}
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {polish
                ? "Prześlij skan pisma ręcznego lub wklej treść z e-maila. Lokalny OCR i Baza Wiedzy dopasują właściwe wydziały lub organ zewnętrzny."
                : "Upload a handwritten scan or paste an email request. Local OCR and Knowledge Base suggest the right departments or external authority."}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground transition group-hover:translate-x-0.5 group-hover:text-primary">
            {polish ? "Przejdź do Weryfikatora OCR" : "Open OCR Verifier"}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </span>
        </Link>

        {isAdmin && (
          <Link
            href="/admin/knowledge"
            className="group flex flex-col justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-primary/60 hover:bg-muted/30"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Diagram3 aria-hidden="true" className="size-4" />
                </span>
                <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  Admin
                </span>
              </div>
              <h2 className="text-sm font-semibold text-foreground sm:text-base">
                {polish ? "Baza Wiedzy i Graf Relacyjny" : "Knowledge Base & Graph"}
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {polish
                  ? "Dodawaj nowe akty prawne, zarządzenia i archiwalne odpowiedzi oraz sprawdzaj, w którym klastrze tematycznym ląduje dokument."
                  : "Upload new legal acts, regulations, and archival responses and inspect where each document lands in the topic graph."}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground transition group-hover:translate-x-0.5 group-hover:text-primary">
              {polish ? "Wejdź do Bazy Wiedzy" : "Enter Knowledge Base"}
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </span>
          </Link>
        )}
      </section>

      {/* Top Urgent Cases Preview */}
      <section aria-label={polish ? "Najpilniejsze sprawy" : "Most urgent cases"} className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            {polish ? "Najpilniejsze aktywne sprawy" : "Most urgent active cases"}
          </h2>
          <Link href="/kalendarz" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
            {polish ? "Zobacz cały rejestr" : "View full registry"}
            <ArrowRight aria-hidden="true" className="size-3" />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center rounded-lg border border-border bg-surface py-6">
            <Throbber label={polish ? "Ładowanie spraw…" : "Loading cases…"} />
          </div>
        ) : urgentPreview.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-5 text-center text-xs text-muted-foreground">
            {polish ? "Brak otwartych spraw oczekujących na odpowiedź." : "No open cases awaiting response."}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {urgentPreview.map(item => {
              const { tone, repliedCount, totalDepts, hasAllResponses } = classifyCase(item);
              const borderClass =
                tone === "RED"
                  ? "border-l-4 border-l-red-500"
                  : tone === "ORANGE"
                    ? "border-l-4 border-l-amber-500"
                    : "border-l-4 border-l-emerald-500";
              const badgeClass =
                tone === "RED"
                  ? "bg-red-500/15 text-red-800 dark:text-red-200"
                  : tone === "ORANGE"
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                    : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";

              return (
                <div
                  key={item.uuid}
                  className={`flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs ${borderClass}`}
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        {item.caseNumber}
                      </span>
                      <span className="font-medium text-foreground">{item.applicantName}</span>
                      {item.isMultiDepartment && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                          <LightningChargeFill aria-hidden="true" className="size-2.5" />
                          {polish ? "Wielo-wydziałowy" : "Multi-dept"}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-muted-foreground">{item.subject}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {totalDepts > 0 && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                          hasAllResponses
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {repliedCount}/{totalDepts} {polish ? "odp." : "rep."}
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${badgeClass}`}>
                      {item.daysRemaining < 0
                        ? polish ? `Po terminie (${Math.abs(item.daysRemaining)}d)` : `Overdue (${Math.abs(item.daysRemaining)}d)`
                        : item.daysRemaining === 0
                          ? polish ? "Termin DZISIAJ" : "Due TODAY"
                          : polish ? `Pozostało ${item.daysRemaining} dni` : `${item.daysRemaining}d left`}
                    </span>
                    <Link
                      href={`/sprawy/${item.uuid}` as "/"}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
                    >
                      {polish ? "Otwórz" : "Open"}
                      <ArrowRight aria-hidden="true" className="size-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
