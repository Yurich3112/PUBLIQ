import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Bank,
  CalendarEvent,
  Cpu,
  Diagram3,
  EyeSlashFill,
  FileEarmarkText,
  People,
  ShieldCheck,
  ShieldLock,
} from "react-bootstrap-icons";
import { Link } from "@/i18n/navigation";
import { isAppLocale } from "@/schemas/i18n";

export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale } = await params;
  const polish = locale === "pl";
  return {
    title: polish ? "O systemie — PUBLIQ · UM Bydgoszcz" : "About — PUBLIQ · UM Bydgoszcz",
    description: polish
      ? "Inteligentny Asystent Urzędnika do obsługi wniosków o informację publiczną (UDIP) dla Biura Komunikacji Społecznej Urzędu Miasta Bydgoszczy."
      : "Intelligent Clerk Assistant for public information requests (UDIP) built for the City Hall of Bydgoszcz.",
  };
}

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const polish = locale === "pl";

  const pillars = [
    {
      icon: CalendarEvent,
      title: polish ? "Kalendarz i Rejestr Wniosków (A–E)" : "Request Calendar & Registry (A–E)",
      body: polish
        ? "Obsługa ~800 spraw rocznie z oficjalną sygnaturą BKS.IV.1431.<nr>.<rok>, automatycznym sortowaniem od najpilniejszych, paskami postępu odpowiedzi wydziałów, podglądem załączników PDF i szybką kwerendą (Art. 13 ust. 2 UDIP)."
        : "Handles ~800 requests/year with official BKS.IV.1431.<no>.<year> signatures, urgency-first sorting, live department reply bars, inline PDF previews, and quick kwerenda extensions.",
    },
    {
      icon: FileEarmarkText,
      title: polish ? "Split-Screen OCR 1:1 dla pisma ręcznego" : "1:1 Split-Screen Handwritten OCR",
      body: polish
        ? "Lokalny potok usuwa kratkę zeszytową (OpenCV), wyznacza ramki słów 1:1 i podświetla na czerwono niepewne wyrazy oraz edycje wymagające zatwierdzenia zielonym znacznikiem — z obsługą Ctrl+Z, usuwania artefaktów i wezwania do doprecyzowania (7 dni)."
        : "Local pipeline erases graph-paper lines (OpenCV), aligns 1:1 word bounding boxes, highlights uncertain and edited words until accepted, supports Ctrl+Z and artifact deletion, and generates 7-day clarification notices.",
    },
    {
      icon: Diagram3,
      title: polish ? "Baza Wiedzy i Graf Relacyjny (Panel Admina)" : "Knowledge Base & Relational Graph",
      body: polish
        ? "Natychmiastowe dopasowanie spraw bliźniaczych z 2025/2026 r., rekomendacja właściwych wydziałów UM Bydgoszczy lub podmiotów zewnętrznych (Art. 4 ust. 3 UDIP — ZUS, ZDMiKP, WKZ) oraz wizualizacja klastra, do którego trafia nowy dokument."
        : "Instant twin-case matching against 2025/2026 archives, routing suggestions for internal departments or external authorities (Art. 4(3) UDIP), and live cluster placement visualization for administrators.",
    },
    {
      icon: EyeSlashFill,
      title: polish ? "Generator Pism i Trwała Anonimizacja PII" : "Official BKS Drafting & Irreversible PII Cleanup",
      body: polish
        ? "Wszystkie 4 szablony pism BKS (odpowiedź merytoryczna, kwerenda, doprecyzowanie, brak dysponenta), skanowanie 28 kategorii PII z ochroną funkcjonariuszy publicznych (Art. 5 ust. 2 UDIP), akceptacja przełożonego i eksport czystego .txt bez możliwości cofnięcia (Ctrl+Z)."
        : "All 4 official BKS letter templates, 28-category PII detection with Public Official Guard (Art. 5(2) UDIP), supervisor version approval, and clean .txt export with stripped values.",
    },
  ];

  const models = [
    {
      task: polish ? "OCR pisma ręcznego, streszczenia JSON i projekty pism" : "Handwriting OCR, JSON Summaries & Letter Drafting",
      model: "Gemma 4 E4B (Ollama · Apache 2.0)",
      footprint: "~3–5 GB (GPU / CPU)",
      why: polish
        ? "Jeden multimodalny model otwartowagowy (obraz + tekst) obsługujący jednocześnie odczyt rękopisów, ekstrakcję JSON i redakcję pism BKS w pełni lokalnie."
        : "Single unified open-weight multimodal model (vision + text) handling handwriting OCR, JSON summaries, and official BKS letter drafting 100% locally.",
    },
    {
      task: polish ? "Lekki tryb awaryjny (stacje robocze CPU)" : "Lightweight CPU Fallback (same family)",
      model: "Gemma 4 E2B (Ollama · Apache 2.0)",
      footprint: "~1.5–2.5 GB RAM (CPU)",
      why: polish
        ? "Mniejszy model z tej samej rodziny Gemma 4 na komputery urzędowe bez dedykowanej karty GPU — pełna zgodność licencyjna Apache 2.0."
        : "Smaller Gemma 4 family model for CPU-only municipal workstations without a dedicated GPU — same Apache 2.0 open-source license.",
    },
    {
      task: polish ? "Detekcja i trwała anonimizacja PII (28 kategorii BKS)" : "PII Detection & Irreversible Redaction (28 BKS categories)",
      model: "OpenCV + RapidOCR (ONNX) · perplexity-ai/PII-Tracer (~600M) + Regex",
      footprint: "~1.2 GB RAM (CPU)",
      why: polish
        ? "Usuwa kratkę zeszytową w 5 ms, wyznacza ramki słów 1:1 [x, y, w, h] oraz wykrywa dane osobowe z ochroną funkcjonariuszy publicznych (Art. 5 ust. 2 UDIP)."
        : "Erases graph-paper grid in 5ms, extracts 1:1 word boxes, and flags personal data with Art. 5(2) public official protection.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-8 sm:px-6 sm:py-10">
      {/* Hero */}
      <header className="grid items-center gap-8 overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-xs dark:bg-surface lg:grid-cols-12 lg:p-8">
        <div className="space-y-4 lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Bank aria-hidden="true" className="size-3.5" />
            <span>HackNation 2026 · Urząd Miasta Bydgoszczy (BKS)</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {polish ? "PUBLIQ — Inteligentny Asystent Urzędnika (UDIP)" : "PUBLIQ — Intelligent Clerk Assistant (UDIP)"}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            {polish
              ? "Przeglądarkowa aplikacja intranetowa (bez instalacji .exe) stworzona dla Biura Komunikacji Społecznej Urzędu Miasta Bydgoszczy do obsługi wniosków o udostępnienie informacji publicznej na podstawie Zarządzenia nr 535/2024 Prezydenta Miasta Bydgoszczy."
              : "Zero-install browser intranet application built for the Public Communication Office (BKS) of Bydgoszcz City Hall to streamline public information requests under Mayor's Regulation No. 535/2024."}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover"
            >
              {polish ? "Otwórz aplikację" : "Open application"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link
              href="/about/team"
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              <People aria-hidden="true" className="size-4" />
              {polish ? "Zespół FeatureFromFuture" : "Team FeatureFromFuture"}
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-center lg:col-span-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-big.png"
            alt="Asystent UDIP"
            className="max-h-[260px] w-full object-contain select-none"
            draggable={false}
          />
        </div>
      </header>

      {/* 4 Core Pillars */}
      <section className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {polish ? "Zakres funkcjonalny" : "Core Capabilities"}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {polish ? "Od wpływu wniosku do zanonimizowanej odpowiedzi w kilka minut" : "From incoming request to scrubbed response in minutes"}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {pillars.map(({ icon: Icon, title, body }) => (
            <article key={title} className="space-y-2.5 rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 100% Local Offline AI Stack */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {polish ? "Bezpieczeństwo i praca offline (Air-Gapped)" : "Security & Air-Gapped Execution"}
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {polish ? "Lekki, lokalny stos modeli otwartowagowych" : "Lightweight Local Open-Weight AI Stack"}
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            {polish ? "0 bajtów wysyłanych do chmury" : "Zero data leaves the intranet"}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">{polish ? "Zadanie" : "Task"}</th>
                  <th className="px-4 py-3">{polish ? "Model / Narzędzie" : "Model / Engine"}</th>
                  <th className="px-4 py-3">{polish ? "Zasoby" : "Footprint"}</th>
                  <th className="px-4 py-3">{polish ? "Zastosowanie w UM Bydgoszczy" : "Role in UM Bydgoszcz"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {models.map(row => (
                  <tr key={row.task}>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.task}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-primary">{row.model}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">{row.footprint}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface p-3.5 text-xs text-muted-foreground">
          <ShieldLock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            {polish
              ? "Ścisła separacja ról (Urzędnik vs Administrator) przez Keycloak, pełny audyt wersji pism w PostgreSQL oraz tryb awaryjny — nawet przy wyłączonych modelach lokalnych urzędnik zachowuje pełną obsługę spraw, szablonów i ręcznej anonimizacji."
              : "Strict role separation (Clerk vs Administrator) via Keycloak, full draft versioning in PostgreSQL, and graceful manual fallback when local models are unavailable."}
          </p>
        </div>
      </section>

      {/* Team CTA */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cpu aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              FeatureFromFuture · HackNation 2026
            </h2>
            <p className="text-xs text-muted-foreground">
              {polish
                ? "Rozwiązanie przygotowane dla Urzędu Miasta Bydgoszczy (Biuro Komunikacji Społecznej)."
                : "Built for the City Hall of Bydgoszcz (Public Communication Office)."}
            </p>
          </div>
        </div>
        <Link
          href="/about/team"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover"
        >
          {polish ? "Poznaj zespół" : "Meet the team"}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </section>
    </div>
  );
}
