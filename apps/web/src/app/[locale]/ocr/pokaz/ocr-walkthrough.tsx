"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowCounterclockwise, PauseFill, PlayFill, SkipEnd, SkipStart } from "react-bootstrap-icons";

type Zone = "stamp" | "body";

type InkWord = {
  id: string;
  line: number;
  ink: string;
  pass1: string;
  final: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zone: Zone;
  keep: boolean;
  merge?: "lead" | "tail";
};

type PhaseId = "ingest" | "grid" | "boxes" | "route" | "vision" | "proof" | "align" | "verify";

const PHASES: { id: PhaseId; ms: number }[] = [
  { id: "ingest", ms: 2400 },
  { id: "grid", ms: 2600 },
  { id: "boxes", ms: 4600 },
  { id: "route", ms: 3000 },
  { id: "vision", ms: 7000 },
  { id: "proof", ms: 6400 },
  { id: "align", ms: 3800 },
  { id: "verify", ms: 5200 },
];

const TOTAL = PHASES.reduce((sum, phase) => sum + phase.ms, 0);

const STAMP: InkWord[] = [
  { id: "st-date-label", line: 0, ink: "wpływu", pass1: "wpływu", final: "wpływu", x: 6, y: 22, w: 36, h: 26, zone: "stamp", keep: true },
  { id: "st-date", line: 0, ink: "09.01.2026", pass1: "09.01.2026", final: "09.01.2026", x: 46, y: 22, w: 48, h: 26, zone: "stamp", keep: true },
  { id: "st-no-label", line: 0, ink: "nr", pass1: "nr", final: "nr", x: 6, y: 58, w: 16, h: 26, zone: "stamp", keep: true },
  { id: "st-no", line: 0, ink: "3468/2026", pass1: "3468/2026", final: "3468/2026", x: 24, y: 58, w: 52, h: 26, zone: "stamp", keep: true },
];

function placeLine(line: number, y: number, specs: Pick<InkWord, "id" | "ink" | "pass1" | "final" | "w" | "merge">[]): InkWord[] {
  let x = 8;
  return specs.map(spec => {
    const word: InkWord = {
      ...spec,
      line,
      x,
      y,
      h: 6.4,
      zone: "body",
      keep: false,
    };
    x += spec.w + 1.7;
    return word;
  });
}

const BODY: InkWord[] = [
  ...placeLine(1, 28, [
    { id: "l1a", ink: "Wnoszę", pass1: "Wnoszę", final: "Wnoszę", w: 16 },
    { id: "l1b", ink: "o", pass1: "o", final: "o", w: 4 },
    { id: "l1c", ink: "udostępnienie", pass1: "udostępnienie", final: "udostępnienie", w: 28 },
  ]),
  ...placeLine(2, 38.5, [
    { id: "l2a", ink: "informacji", pass1: "informacji", final: "informacji", w: 22 },
    { id: "l2b", ink: "publicznej", pass1: "publicznej", final: "publicznej", w: 22 },
  ]),
  ...placeLine(3, 49, [
    { id: "l3a", ink: "dotyczącej", pass1: "dotyczącej", final: "dotyczącej", w: 22 },
    { id: "l3b", ink: "liczby", pass1: "liczby", final: "liczby", w: 14 },
  ]),
  ...placeLine(4, 59.5, [
    { id: "l4a", ink: "uczniów", pass1: "uczniów", final: "uczniów", w: 16 },
    { id: "l4b", ink: "w", pass1: "w", final: "w", w: 4 },
    { id: "l4c", ink: "try", pass1: "TRY", final: "trybie", w: 8, merge: "lead" },
    { id: "l4d", ink: "bie", pass1: "BIE", final: "bie", w: 8, merge: "tail" },
  ]),
  ...placeLine(5, 70, [
    { id: "l5a", ink: "stacjonarnym", pass1: "stacjonarnym", final: "stacjonarnym", w: 28 },
    { id: "l5b", ink: "oraz", pass1: "oraz", final: "oraz", w: 12 },
  ]),
  ...placeLine(6, 80.5, [
    { id: "l6a", ink: "ile", pass1: "JLE", final: "ile", w: 8 },
    { id: "l6b", ink: "objęcia", pass1: "OBECIA", final: "objęcia", w: 16 },
    { id: "l6c", ink: "godzin", pass1: "godzin", final: "godzin", w: 14 },
  ]),
];

const BODY_LINES = [1, 2, 3, 4, 5, 6];

const DRAFT: Record<number, string> = {
  1: "Wnosze o udostepnienie",
  2: "informacji publicznej",
  3: "dotyczacej liczby",
  4: "uczniow w TRY BIE",
  5: "stacjonarnym oraz",
  6: "JLE OBECIA godzin",
};

function locate(ms: number) {
  const clamped = Math.max(0, Math.min(TOTAL, ms));
  let acc = 0;
  for (let index = 0; index < PHASES.length; index += 1) {
    const phase = PHASES[index];
    if (clamped < acc + phase.ms || index === PHASES.length - 1) {
      return { index, id: phase.id, progress: phase.ms === 0 ? 1 : Math.min(1, (clamped - acc) / phase.ms) };
    }
    acc += phase.ms;
  }
  const last = PHASES.length - 1;
  return { index: last, id: PHASES[last].id, progress: 1 };
}

function phaseStart(index: number) {
  return PHASES.slice(0, index).reduce((sum, phase) => sum + phase.ms, 0);
}

function revealAt(index: number, count: number, progress: number) {
  const start = index / count;
  const end = (index + 0.85) / count;
  if (progress <= start) return 0;
  if (progress >= end) return 1;
  return (progress - start) / (end - start);
}

function lineText(line: number, field: "pass1" | "final") {
  return BODY.filter(word => word.line === line && !(field === "final" && word.merge === "tail"))
    .map(word => word[field])
    .join(" ");
}

const COPY: Record<PhaseId, { pl: { title: string; body: string }; en: { title: string; body: string } }> = {
  ingest: {
    pl: {
      title: "Skan ląduje na tym komputerze",
      body: "PDF albo zdjęcie jest zamieniane na obraz 200 DPI. Plik nie wychodzi z maszyny. Jeśli w PDF jest już prawdziwy tekst, ten krok na tym się kończy.",
    },
    en: {
      title: "The scan stays on this computer",
      body: "A PDF or photo becomes a 200 DPI image. The file never leaves the machine. A PDF that already contains real text stops here.",
    },
  },
  grid: {
    pl: {
      title: "Kratka schodzi, pismo zostaje",
      body: "OpenCV szuka powtarzalnych cienkich linii. Zdejmuje tylko kratkę zeszytu. Kreska długopisu jest grubsza, więc zostaje.",
    },
    en: {
      title: "The grid goes, the pen stays",
      body: "OpenCV looks for thin lines that repeat. It removes only the graph paper. Pen strokes are thicker, so they remain.",
    },
  },
  boxes: {
    pl: {
      title: "Każde słowo dostaje ramkę",
      body: "RapidOCR obrysowuje kawałki atramentu i mierzy pochylenie. Pieczątka jest przekrzywiona. Tekst pisma leży prosto. Dwa bliskie kawałki jeszcze nie są jednym słowem.",
    },
    en: {
      title: "Every word gets a box",
      body: "RapidOCR outlines each ink cluster and measures its tilt. The stamp leans. The handwriting is flat. Two close fragments are not one word yet.",
    },
  },
  route: {
    pl: {
      title: "Jasny druk nie jedzie do modelu",
      body: "Pieczątka ma już pewny odczyt, więc zostaje. Pismo ręczne jest za słabe. Te wiersze pójdą do lokalnego modelu, po kilka naraz.",
    },
    en: {
      title: "Clear print skips the model",
      body: "The stamp is already a confident read, so it stays. The handwriting is not. Those lines go to the local model, several at a time.",
    },
  },
  vision: {
    pl: {
      title: "Pierwszy przebieg patrzy na obraz",
      body: "Niepewne wiersze są wycinane, prostowane i układane w jedną kartę z numerami. Gemma 4 czyta tę kartę lokalnie i poprawia to, co widać: ogonki, kreski, kształt liter.",
    },
    en: {
      title: "The first pass looks at the image",
      body: "Uncertain lines are cropped, straightened, and stacked into one numbered sheet. Gemma 4 reads that sheet locally and fixes what it can see: marks, strokes, letter shapes.",
    },
  },
  proof: {
    pl: {
      title: "Drugi przebieg czyta całe pismo",
      body: "Tym razem nie ma obrazu. Model dostaje wszystkie wiersze naraz i poprawia słowa, które mają sens tylko w zdaniu. Jeśli dopisałby za dużo, zostaje pierwszy odczyt.",
    },
    en: {
      title: "The second pass reads the whole letter",
      body: "There is no image this time. The model receives every line at once and fixes words that only make sense in the sentence. A guess that adds too much is thrown away.",
    },
  },
  align: {
    pl: {
      title: "Słowa wracają do swoich ramek",
      body: "„try” i „bie” stają się jednym „trybie”, bo przerwa między nimi jest mała. Każde słowo zostaje przypięte do własnego miejsca na skanie.",
    },
    en: {
      title: "Words go back to their boxes",
      body: "“try” and “bie” become one “trybie”, because the gap between them is small. Every word is pinned to its own place on the scan.",
    },
  },
  verify: {
    pl: {
      title: "Urzędnik widzi skan i tekst razem",
      body: "Czerwone słowa to te, które drugi przebieg zmienił. Reszta jest zgodna. Na tym laptopie cały przebieg zajmuje około 9 sekund i nie używa chmury.",
    },
    en: {
      title: "The clerk sees the scan and the text together",
      body: "Red words are the ones the second pass changed. The rest already agreed. On this laptop the whole run takes about 9 seconds, with no cloud.",
    },
  },
};

function boxColor(word: InkWord, phase: PhaseId, activeLine: number | null) {
  if (word.keep) return "#047857";
  if (phase === "vision" && word.line === activeLine) return "#0369a1";
  if ((phase === "proof" || phase === "align" || phase === "verify") && word.pass1 !== word.final && word.merge !== "tail") return "#b91c1c";
  if (phase === "route" || phase === "vision" || phase === "proof") return "#b45309";
  return "#1d4ed8";
}

export function OcrWalkthrough({ polish }: { polish: boolean }) {
  const clock = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      clock.current = Math.min(TOTAL, clock.current + dt);
      setElapsed(clock.current);
      if (clock.current >= TOTAL) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const cursor = locate(elapsed);
  const phase = cursor.id;
  const gridOpacity = phase === "ingest" ? 1 : phase === "grid" ? 1 - cursor.progress : 0;
  const boxesOn = cursor.index >= 2;
  const activeLine = phase === "vision" ? BODY_LINES[Math.min(BODY_LINES.length - 1, Math.floor(cursor.progress * BODY_LINES.length))] : null;
  const alignT = phase === "align" ? cursor.progress : cursor.index > 6 ? 1 : 0;
  const proofT = phase === "proof" ? cursor.progress : cursor.index > 5 ? 1 : 0;

  function seek(ms: number, resume = playing) {
    clock.current = Math.max(0, Math.min(TOTAL, ms));
    setElapsed(clock.current);
    setPlaying(resume && clock.current < TOTAL);
  }

  function jump(direction: -1 | 1) {
    const next = Math.max(0, Math.min(PHASES.length - 1, cursor.index + direction));
    seek(phaseStart(next), true);
  }

  function toggle() {
    if (clock.current >= TOTAL) seek(0, true);
    else setPlaying(value => !value);
  }

  const controls = useRef({ jump, toggle });
  controls.current = { jump, toggle };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === " ") {
        event.preventDefault();
        controls.current.toggle();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        controls.current.jump(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        controls.current.jump(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copy = COPY[phase][polish ? "pl" : "en"];
  const done = elapsed >= TOTAL;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {polish ? "Lokalny odczyt · bez internetu" : "Local reading · no internet"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {polish ? "Jak pismo ręczne staje się tekstem" : "How handwriting becomes text"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {polish
              ? "Ten sam przebieg, który na tym laptopie kończy się w około 9 sekund. Tutaj jest zwolniony, żeby było widać każdy krok."
              : "The same run that finishes in about 9 seconds on this laptop. Slowed down so each step is visible."}
          </p>
        </div>
        <p className="rounded-full border border-emerald-600/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200">
          Ollama · 127.0.0.1 · gemma4:e4b
        </p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(300px,1.08fr)]">
        <ScanSheet
          gridOpacity={gridOpacity}
          boxesOn={boxesOn}
          phase={phase}
          phaseProgress={cursor.progress}
          activeLine={activeLine}
          alignT={alignT}
        />
        <Workbench
          polish={polish}
          phase={phase}
          progress={cursor.progress}
          title={copy.title}
          body={copy.body}
          step={cursor.index + 1}
          proofT={proofT}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            {done ? <ArrowCounterclockwise aria-hidden="true" className="size-4" /> : playing ? <PauseFill aria-hidden="true" className="size-4" /> : <PlayFill aria-hidden="true" className="size-4" />}
            {done ? (polish ? "Odtwórz od nowa" : "Play again") : playing ? (polish ? "Pauza" : "Pause") : (polish ? "Odtwarzaj" : "Play")}
          </button>
          <button type="button" onClick={() => jump(-1)} className="inline-flex size-9 items-center justify-center rounded-md border border-border" aria-label={polish ? "Poprzedni krok" : "Previous step"}>
            <SkipStart aria-hidden="true" className="size-4" />
          </button>
          <button type="button" onClick={() => jump(1)} className="inline-flex size-9 items-center justify-center rounded-md border border-border" aria-label={polish ? "Następny krok" : "Next step"}>
            <SkipEnd aria-hidden="true" className="size-4" />
          </button>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {polish ? "Krok" : "Step"} {cursor.index + 1} / {PHASES.length}
            <span className="px-2">·</span>
            {polish ? "spacja: pauza" : "space: pause"}
          </span>
        </div>
        <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
          {PHASES.map((item, index) => {
            const active = index === cursor.index;
            const complete = index < cursor.index || done;
            const label = COPY[item.id][polish ? "pl" : "en"].title;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => seek(phaseStart(index), true)}
                  aria-current={active ? "step" : undefined}
                  title={label}
                  className={`flex h-8 w-full items-center justify-center rounded-md text-xs font-semibold ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : complete
                        ? "bg-primary/15 text-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {index + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function ScanSheet({
  gridOpacity,
  boxesOn,
  phase,
  phaseProgress,
  activeLine,
  alignT,
}: {
  gridOpacity: number;
  boxesOn: boolean;
  phase: PhaseId;
  phaseProgress: number;
  activeLine: number | null;
  alignT: number;
}) {
  const lead = BODY.find(word => word.merge === "lead");
  const tail = BODY.find(word => word.merge === "tail");

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div
        className="relative overflow-hidden rounded-sm border border-neutral-300 bg-[#f6f1e6] text-[#1c3148] shadow-md"
        style={{ aspectRatio: "3 / 3.7", containerType: "inline-size" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: gridOpacity,
            backgroundImage: "linear-gradient(to right, rgba(96, 140, 190, 0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(96, 140, 190, 0.45) 1px, transparent 1px)",
            backgroundSize: "7.2% 5.6%",
          }}
        />
        <div
          className="absolute rounded-sm border-2 border-rose-800/80"
          style={{ left: "50%", top: "4%", width: "46%", height: "18%", transform: "rotate(-8deg)", transformOrigin: "center" }}
        >
          {STAMP.map(word => (
            <WordInk key={word.id} word={word} />
          ))}
          {boxesOn && STAMP.map((word, index) => (
            <WordBox
              key={`${word.id}-box`}
              word={word}
              reveal={phase === "boxes" ? revealAt(index, STAMP.length + BODY.length, phaseProgress) : 1}
              color={boxColor(word, phase, activeLine)}
            />
          ))}
        </div>
        {BODY.map(word => (
          <WordInk key={word.id} word={word} />
        ))}
        {boxesOn && BODY.map((word, index) => {
          const fading = word.merge === "tail" ? 1 - alignT : 1;
          const grown = word.merge === "lead" && lead && tail
            ? { ...word, w: word.w + (tail.x + tail.w - word.x - word.w) * alignT }
            : word;
          return (
            <WordBox
              key={`${word.id}-box`}
              word={grown}
              reveal={phase === "boxes" ? revealAt(STAMP.length + index, STAMP.length + BODY.length, phaseProgress) : 1}
              color={boxColor(word, phase, activeLine)}
              opacity={fading}
            />
          );
        })}
      </div>
    </div>
  );
}

function WordInk({ word }: { word: InkWord }) {
  const stamp = word.zone === "stamp";
  return (
    <span
      className={`absolute flex items-center ${stamp ? "font-semibold uppercase tracking-tight text-rose-900" : ""}`}
      style={{
        left: `${word.x}%`,
        top: `${word.y}%`,
        width: `${word.w}%`,
        height: `${word.h}%`,
        fontFamily: stamp ? "Georgia, 'Times New Roman', serif" : '"Segoe Script", "Segoe Print", "Bradley Hand ITC", cursive',
        fontSize: stamp ? "clamp(9px, 2.3cqw, 14px)" : "clamp(12px, 3.1cqw, 20px)",
        lineHeight: 1,
        transform: stamp ? undefined : "rotate(-1.5deg)",
      }}
    >
      {word.ink}
    </span>
  );
}

function WordBox({ word, reveal, color, opacity = 1 }: { word: InkWord; reveal: number; color: string; opacity?: number }) {
  if (reveal <= 0 || opacity <= 0.02) return null;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute overflow-visible"
      style={{ left: `${word.x}%`, top: `${word.y}%`, width: `${word.w}%`, height: `${word.h}%`, opacity }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        fill={reveal > 0.85 ? `${color}14` : "transparent"}
        stroke={color}
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
        pathLength={100}
        strokeDasharray="100"
        strokeDashoffset={100 - reveal * 100}
      />
    </svg>
  );
}

function Workbench({
  polish,
  phase,
  progress,
  title,
  body,
  step,
  proofT,
}: {
  polish: boolean;
  phase: PhaseId;
  progress: number;
  title: string;
  body: string;
  step: number;
  proofT: number;
}) {
  return (
    <section className="flex min-h-[420px] flex-col gap-3 rounded-xl border border-border bg-surface p-4" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {polish ? "Krok" : "Step"} {step}
        <span className="px-1.5">·</span>
        {phase === "vision" || phase === "proof" ? "Gemma 4" : phase === "grid" ? "OpenCV" : phase === "boxes" || phase === "route" || phase === "align" ? "RapidOCR" : "PUBLIQ"}
      </p>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-1 flex-1">
        {phase === "vision" && (
          <StripStack polish={polish} progress={progress} />
        )}
        {phase === "proof" && <ProofSheet polish={polish} progress={proofT} />}
        {phase === "route" && <RouteList polish={polish} />}
        {(phase === "align" || phase === "verify") && <FinalLetter polish={polish} emphasize={phase === "verify"} />}
        {phase === "boxes" && (
          <p className="text-sm font-medium text-foreground">
            {polish ? "Rysuję ramkę" : "Drawing box"}{" "}
            {Math.min(STAMP.length + BODY.length, Math.max(1, Math.ceil(progress * (STAMP.length + BODY.length))))}
            {" / "}
            {STAMP.length + BODY.length}
          </p>
        )}
        {phase === "grid" && (
          <p className="text-sm font-medium text-foreground">
            {polish ? "Zostaje atrament, schodzi kratka." : "The ink stays, the grid leaves."}
          </p>
        )}
        {phase === "ingest" && (
          <p className="text-sm text-foreground/80">
            {polish
              ? "Po lewej jest skan. Po prawej widać tylko to, co program robi w tej chwili."
              : "The scan stays on the left. The right side shows only what the program is doing now."}
          </p>
        )}
      </div>
    </section>
  );
}

function RouteList({ polish }: { polish: boolean }) {
  return (
    <ul className="space-y-2 text-sm">
      <li className="flex items-center justify-between rounded-lg border border-emerald-600/30 bg-emerald-500/10 px-3 py-2">
        <span>{polish ? "Pieczątka wpływu" : "Intake stamp"}</span>
        <span className="font-semibold text-emerald-800 dark:text-emerald-200">0,94 · {polish ? "zostaje" : "kept"}</span>
      </li>
      {BODY_LINES.map(line => (
        <li key={line} className="flex items-center justify-between rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2">
          <span className="truncate pr-3">{DRAFT[line]}</span>
          <span className="shrink-0 font-semibold text-amber-800 dark:text-amber-200">{polish ? "do modelu" : "to the model"}</span>
        </li>
      ))}
    </ul>
  );
}

function StripStack({ polish, progress }: { polish: boolean; progress: number }) {
  const visibleCount = Math.max(1, Math.ceil(progress * BODY_LINES.length));
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-sky-800 dark:text-sky-200">
        {polish ? "Jedna karta dla modelu · think: false · tylko ten komputer" : "One sheet for the model · think: false · this computer only"}
      </p>
      <ol className="space-y-1.5">
        {BODY_LINES.slice(0, visibleCount).map(line => {
          const words = BODY.filter(word => word.line === line);
          const local = progress * BODY_LINES.length - (line - 1);
          const reading = local > 0 && local < 1;
          const done = local >= 1;
          const pass1 = lineText(line, "pass1");
          const text = done ? pass1 : pass1.slice(0, Math.max(1, Math.ceil(pass1.length * Math.max(0, local))));
          return (
            <li key={line} className={`grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-md border px-2 py-1.5 ${reading ? "border-sky-600 bg-sky-500/10" : "border-border bg-background"}`}>
              <span className="rounded bg-rose-700 px-1.5 py-0.5 text-[11px] font-bold text-white">[{line}]</span>
              <span className="truncate text-sm text-[#1c3148]" style={{ fontFamily: '"Segoe Script", "Segoe Print", cursive' }}>
                {words.map(word => word.ink).join(" ")}
              </span>
              <span className={`truncate text-sm ${done ? "text-foreground" : "text-muted-foreground"}`}>{text}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ProofSheet({ polish, progress }: { polish: boolean; progress: number }) {
  const fixTry = progress > 0.38;
  const fixRest = progress > 0.62;
  const rejected = progress > 0.82;
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-foreground">
        {polish ? "Sam tekst, bez obrazu. Całe pismo w jednym przebiegu." : "Text only, no image. The whole letter in one pass."}
      </p>
      <div className="space-y-1 rounded-lg border border-border bg-background px-3 py-3 text-sm leading-6">
        <p>{lineText(1, "final")}</p>
        <p>{lineText(2, "final")}</p>
        <p>{lineText(3, "final")}</p>
        <p>
          uczniów w{" "}
          {fixTry ? (
            <mark className="rounded bg-emerald-500/20 px-1 text-emerald-900 dark:text-emerald-100">trybie</mark>
          ) : (
            <span className="rounded bg-red-500/15 px-1 line-through">TRY BIE</span>
          )}
        </p>
        <p>{lineText(5, "final")}</p>
        <p>
          {fixRest ? (
            <>
              <mark className="rounded bg-emerald-500/20 px-1 text-emerald-900 dark:text-emerald-100">ile</mark>{" "}
              <mark className="rounded bg-emerald-500/20 px-1 text-emerald-900 dark:text-emerald-100">objęcia</mark> godzin
            </>
          ) : (
            <span className="rounded bg-red-500/15 px-1 line-through">JLE OBECIA</span>
          )}
          {!fixRest && " godzin"}
        </p>
      </div>
      {rejected && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          {polish
            ? "Odrzucone dopisanie „w szkołach podstawowych”. Za dużo nowych słów, zostaje pierwszy odczyt."
            : "Rejected addition “w szkołach podstawowych”. Too many new words, so the first reading stays."}
        </p>
      )}
    </div>
  );
}

function FinalLetter({ polish, emphasize }: { polish: boolean; emphasize: boolean }) {
  const flagged = new Set(["trybie", "ile", "objęcia"]);
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-foreground">
        {emphasize
          ? polish
            ? "Czerwone = drugi przebieg zmienił słowo. Urzędnik tylko je potwierdza."
            : "Red = the second pass changed the word. The clerk only confirms it."
          : polish
            ? "Ramki na skanie i słowa po prawej są tym samym odczytem."
            : "The boxes on the scan and the words on the right are the same reading."}
      </p>
      <div className="space-y-1 rounded-lg border border-border bg-white px-3 py-3 text-sm leading-7 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
        {BODY_LINES.map(line => (
          <p key={line}>
            {BODY.filter(word => word.line === line && word.merge !== "tail").map(word => {
              const changed = flagged.has(word.final);
              return (
                <span key={word.id} className={changed ? "mx-0.5 rounded bg-red-500/20 px-1 font-medium text-red-800 dark:text-red-200" : "mx-0.5"}>
                  {word.final}
                  {changed && emphasize ? <span className="ml-1 text-[10px] font-semibold">76%</span> : null}
                </span>
              );
            })}
          </p>
        ))}
      </div>
      {emphasize && (
        <p className="text-xs text-muted-foreground">
          {polish
            ? "Reszta słów zgodna w obu przebiegach · 91%. Pieczątka nie szła do modelu."
            : "The other words agreed in both passes · 91%. The stamp never went to the model."}
        </p>
      )}
    </div>
  );
}
