"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowClockwise,
  CheckCircleFill,
  Diagram3,
  PlusCircle,
  Stars,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Button, Input, Throbber } from "@/ui/basic";

interface KbCluster {
  uuid: string;
  slug: string;
  name: string;
  color: string;
  description: string;
}

interface KbNode {
  uuid: string;
  nodeType: "CASE" | "LEGAL_ACT" | "DEPARTMENT" | "EXTERNAL_AUTHORITY";
  externalKey: string;
  title: string;
  summary: string;
  tags: string[];
  clusterUuid: string;
  clusterSlug: string;
  clusterName: string;
  clusterColor: string;
  structuredJson: Record<string, unknown>;
}

interface KbEdge {
  uuid: string;
  sourceNodeUuid: string;
  targetNodeUuid: string;
  relationType: "SIMILAR_CASE" | "ROUTED_TO_DEPT" | "REDIRECTED_TO_EXTERNAL" | "CITES_LAW";
  weight: number;
  reason: string | null;
}

interface GraphSnapshot {
  stats: {
    clusterCount: number;
    nodeCount: number;
    caseCount: number;
    legalActCount: number;
    departmentCount: number;
    externalAuthorityCount: number;
    edgeCount: number;
  };
  clusters: KbCluster[];
  nodes: KbNode[];
  edges: KbEdge[];
}

interface PlacementHighlight {
  nodeUuid: string;
  externalKey: string;
  clusterName: string;
  createdCluster: boolean;
  edgeUuids: Set<string>;
  edgeCount: number;
  topMatchKey: string | null;
  topMatchScore: number | null;
}

const DEMO_PRESETS = [
  {
    labelPl: "Demo 1: Sprawa 599.2026 (Szkoły → klaster Edukacja)",
    labelEn: "Demo 1: Case 599.2026 (Schools → Education cluster)",
    nodeType: "CASE" as const,
    externalKey: "BKS.IV.1431.599.2026",
    title: "BKS.IV.1431.599.2026 — Liczba uczniów i cudzoziemców 2026",
    summary:
      "Edytowalne zestawienie liczby uczniów oraz uczniów cudzoziemców w poszczególnych szkołach podstawowych w Bydgoszczy - stan na czerwiec i wrzesień 2026.",
    tags: "szkoły podstawowe, liczba uczniów, cudzoziemcy, edukacja",
    routedTo: "Wydział Edukacji i Sportu",
  },
  {
    labelPl: "Demo 2: Sprawa 543.2026 (Zwierzęta → WZGK + Schronisko)",
    labelEn: "Demo 2: Case 543.2026 (Animals → WZGK + Shelter)",
    nodeType: "CASE" as const,
    externalKey: "BKS.IV.1431.543.2026",
    title: "BKS.IV.1431.543.2026 — Opieka nad bezdomnymi zwierzętami",
    summary:
      "Opieka nad bezdomnymi zwierzętami, finansowanie schroniska oraz wyłapywanie i odławianie bezdomnych zwierząt w 2026 r.",
    tags: "bezdomne zwierzęta, schronisko, wyłapywanie, odławianie",
    routedTo: "Wydział Zieleni i Gospodarki Komunalnej, Schronisko dla Zwierząt w Bydgoszczy",
  },
  {
    labelPl: "Demo 3: Nowa Ustawa (Auto-tworzy NOWY klaster!)",
    labelEn: "Demo 3: New Legal Act (Auto-creates NEW cluster!)",
    nodeType: "LEGAL_ACT" as const,
    externalKey: "LAW:CYBERBEZPIECZENSTWO_2026",
    title: "Ustawa o Krajowym Systemie Cyberbezpieczeństwa (2026)",
    summary:
      "Wymogi bezpieczeństwa sieci i systemów informatycznych w jednostkach samorządu terytorialnego, incydenty CSIRT i ochrona infrastruktury krytycznej.",
    tags: "cyberbezpieczeństwo, csirt, incydenty, infrastruktura krytyczna",
    routedTo: "",
  },
];

const SVG_WIDTH = 960;
const SVG_HEIGHT = 600;

export function KnowledgeGraphStudio({ polish }: { polish: boolean }) {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedNodeUuid, setSelectedNodeUuid] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PlacementHighlight | null>(null);

  // Ingest form state
  const [nodeType, setNodeType] = useState<"CASE" | "LEGAL_ACT" | "DEPARTMENT" | "EXTERNAL_AUTHORITY">("CASE");
  const [externalKey, setExternalKey] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [routedToInput, setRoutedToInput] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState(false);

  const refreshGraph = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(API_ROUTES.adminKnowledgeGraph, {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      const data = (await response.json()) as { status?: string } & GraphSnapshot;
      if (data.status === "ok") {
        setSnapshot(data);
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
    async function loadInitial() {
      try {
        const response = await fetch(API_ROUTES.adminKnowledgeGraph, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          if (!controller.signal.aborted) setError(true);
          return;
        }
        const data = (await response.json()) as { status?: string } & GraphSnapshot;
        if (!controller.signal.aborted) {
          if (data.status === "ok") {
            setSnapshot(data);
          } else {
            setError(true);
          }
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadInitial();
    return () => controller.abort();
  }, []);

  // Compute deterministic cluster centers and node coordinates inside the SVG canvas
  const layout = useMemo(() => {
    if (!snapshot) return { clusterPos: new Map<string, { x: number; y: number; r: number }>(), nodePos: new Map<string, { x: number; y: number }>() };
    const clusters = snapshot.clusters;
    const clusterPos = new Map<string, { x: number; y: number; r: number }>();
    const nodePos = new Map<string, { x: number; y: number }>();

    const cx = SVG_WIDTH / 2;
    const cy = SVG_HEIGHT / 2;
    const ringRx = 330;
    const ringRy = 195;

    clusters.forEach((cluster, idx) => {
      const angle = (idx / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2;
      const x = clusters.length === 1 ? cx : cx + Math.cos(angle) * ringRx;
      const y = clusters.length === 1 ? cy : cy + Math.sin(angle) * ringRy;
      const clusterNodes = snapshot.nodes.filter(n => n.clusterUuid === cluster.uuid);
      const radius = Math.min(108, Math.max(66, 52 + clusterNodes.length * 10));
      clusterPos.set(cluster.uuid, { x, y, r: radius });

      clusterNodes.forEach((node, nIdx) => {
        if (clusterNodes.length === 1) {
          nodePos.set(node.uuid, { x, y });
        } else {
          const nAngle = (nIdx / clusterNodes.length) * Math.PI * 2 - Math.PI / 4;
          const nRadius = radius * 0.56;
          nodePos.set(node.uuid, {
            x: x + Math.cos(nAngle) * nRadius,
            y: y + Math.sin(nAngle) * nRadius,
          });
        }
      });
    });

    return { clusterPos, nodePos };
  }, [snapshot]);

  const selectedNode = useMemo(
    () => snapshot?.nodes.find(n => n.uuid === selectedNodeUuid) ?? null,
    [snapshot, selectedNodeUuid],
  );

  const selectedNodeEdges = useMemo(() => {
    if (!snapshot || !selectedNodeUuid) return [];
    return snapshot.edges.filter(
      e => e.sourceNodeUuid === selectedNodeUuid || e.targetNodeUuid === selectedNodeUuid,
    );
  }, [snapshot, selectedNodeUuid]);

  function applyPreset(preset: (typeof DEMO_PRESETS)[number]) {
    setNodeType(preset.nodeType);
    setExternalKey(preset.externalKey);
    setTitle(preset.title);
    setSummary(preset.summary);
    setTagsInput(preset.tags);
    setRoutedToInput(preset.routedTo);
  }

  async function handleIngest(event: FormEvent) {
    event.preventDefault();
    if (!externalKey.trim() || !title.trim() || !summary.trim()) return;
    setIngesting(true);
    setIngestError(false);
    try {
      const response = await fetch(API_ROUTES.adminKnowledgeIngest, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          nodeType,
          externalKey: externalKey.trim(),
          title: title.trim(),
          summary: summary.trim(),
          tags: tagsInput
            .split(",")
            .map(s => s.trim())
            .filter(Boolean),
          routedTo: routedToInput
            .split(",")
            .map(s => s.trim())
            .filter(Boolean),
        }),
      });
      if (!response.ok) {
        setIngestError(true);
        return;
      }
      const data = (await response.json()) as {
        status?: string;
        node?: KbNode;
        cluster?: KbCluster;
        createdCluster?: boolean;
        newEdges?: KbEdge[];
        topMatches?: { externalKey: string; score: number }[];
      };
      if (data.status === "ok" && data.node && data.cluster) {
        setPlacement({
          nodeUuid: data.node.uuid,
          externalKey: data.node.externalKey,
          clusterName: data.cluster.name,
          createdCluster: Boolean(data.createdCluster),
          edgeUuids: new Set((data.newEdges ?? []).map(e => e.uuid)),
          edgeCount: data.newEdges?.length ?? 0,
          topMatchKey: data.topMatches?.[0]?.externalKey ?? null,
          topMatchScore: data.topMatches?.[0]?.score ?? null,
        });
        setSelectedNodeUuid(data.node.uuid);
        await refreshGraph();
      } else {
        setIngestError(true);
      }
    } catch {
      setIngestError(true);
    } finally {
      setIngesting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Diagram3 aria-hidden="true" className="size-5 text-blue-600" />
            <h1 className="text-xl font-semibold tracking-tight">
              {polish
                ? "Panel Admina — Wizualizacja Bazy Wiedzy (Graf Relacyjny)"
                : "Admin Panel — Knowledge Base Graph Visualizer"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {polish
              ? "Widok dostępny wyłącznie dla Administratora. Wgraj nową sprawę lub akt prawny, aby zobaczyć w którym klastrze wyląduje i jakie powiązania utworzy."
              : "Admin-only view. Ingest a new archival case or legal act to see which topic cluster it lands in and which relational edges are formed."}
          </p>
        </div>
        <Button tone="main-outline" disabled={loading} onClick={() => void refreshGraph()}>
          <ArrowClockwise aria-hidden="true" className="size-4" />
          {polish ? "Odśwież graf" : "Refresh graph"}
        </Button>
      </header>

      {/* Stats Strip */}
      {snapshot && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: polish ? "Klastry" : "Clusters", value: snapshot.stats.clusterCount },
            { label: polish ? "Węzły łącznie" : "Total Nodes", value: snapshot.stats.nodeCount },
            { label: polish ? "Sprawy (CASE)" : "Cases", value: snapshot.stats.caseCount },
            { label: polish ? "Akty prawne" : "Legal Acts", value: snapshot.stats.legalActCount },
            { label: polish ? "Wydziały UMB" : "Departments", value: snapshot.stats.departmentCount },
            { label: polish ? "Instytucje zewn." : "External", value: snapshot.stats.externalAuthorityCount },
            { label: polish ? "Powiązania" : "Edges", value: snapshot.stats.edgeCount },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-center"
            >
              <div className="text-lg font-bold tabular-nums text-foreground">{stat.value}</div>
              <div className="text-[11px] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Placement Highlight Banner (appears right after ingesting a new document!) */}
      {placement && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-500/12 px-4 py-3 text-sm text-emerald-950 dark:text-emerald-100"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircleFill aria-hidden="true" className="size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">
                {polish
                  ? `Dokument ${placement.externalKey} wylądował w klastrze: „${placement.clusterName}”${placement.createdCluster ? " (NOWY KLASTER!)" : ""}`
                  : `Document ${placement.externalKey} landed in cluster: "${placement.clusterName}"${placement.createdCluster ? " (NEW CLUSTER!)" : ""}`}
              </p>
              <p className="text-xs opacity-90">
                {polish
                  ? `Utworzono ${placement.edgeCount} powiązań w grafie${placement.topMatchKey && placement.topMatchScore ? ` · Najbliższa sprawa: ${placement.topMatchKey} (${Math.round(placement.topMatchScore * 100)}%)` : ""}. Nowy węzeł pulsuje na zielono na mapie poniżej.`
                  : `Created ${placement.edgeCount} graph edges${placement.topMatchKey && placement.topMatchScore ? ` · Closest match: ${placement.topMatchKey} (${Math.round(placement.topMatchScore * 100)}%)` : ""}. Highlighted in green on the map below.`}
              </p>
            </div>
          </div>
          <Button size="sm" tone="ghost" onClick={() => setPlacement(null)}>
            {polish ? "Ukryj" : "Dismiss"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Interactive SVG Graph Map (2 columns) */}
        <section className="flex flex-col rounded-xl border border-border bg-surface lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-xs">
            <span className="font-semibold">
              {polish ? "Mapa Klastrów i Powiązań (kliknij węzeł, aby zbadać JSON)" : "Cluster & Edge Map (click any node to inspect JSON)"}
            </span>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span>● {polish ? "Sprawa" : "Case"}</span>
              <span>■ {polish ? "Akt prawny" : "Legal Act"}</span>
              <span>◆ {polish ? "Wydział / Instytucja" : "Dept / External"}</span>
            </div>
          </div>

          <div className="relative flex-1 overflow-auto p-3">
            {loading && !snapshot ? (
              <div className="flex h-[520px] items-center justify-center">
                <Throbber label="Loading graph" />
              </div>
            ) : error || !snapshot ? (
              <div className="flex h-[520px] items-center justify-center text-sm text-red-600">
                {polish ? "Nie udało się załadować grafu Bazy Wiedzy." : "Failed to load Knowledge Graph."}
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="h-auto w-full rounded-lg border border-border/60 bg-neutral-950/[0.02] dark:bg-neutral-950/30"
              >
                {/* 1. Cluster Halos */}
                {snapshot.clusters.map(cluster => {
                  const pos = layout.clusterPos.get(cluster.uuid);
                  if (!pos) return null;
                  return (
                    <g key={cluster.uuid}>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={pos.r}
                        fill={cluster.color}
                        fillOpacity={0.09}
                        stroke={cluster.color}
                        strokeOpacity={0.45}
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                      />
                      <text
                        x={pos.x}
                        y={pos.y - pos.r - 8}
                        textAnchor="middle"
                        className="fill-foreground text-[11px] font-semibold"
                      >
                        {cluster.name}
                      </text>
                    </g>
                  );
                })}

                {/* 2. Relational Edges */}
                {snapshot.edges.map(edge => {
                  const src = layout.nodePos.get(edge.sourceNodeUuid);
                  const tgt = layout.nodePos.get(edge.targetNodeUuid);
                  if (!src || !tgt) return null;
                  const isHighlighted =
                    placement?.edgeUuids.has(edge.uuid)
                    || edge.sourceNodeUuid === selectedNodeUuid
                    || edge.targetNodeUuid === selectedNodeUuid;
                  const strokeColor = placement?.edgeUuids.has(edge.uuid)
                    ? "#10b981"
                    : edge.relationType === "SIMILAR_CASE"
                      ? "#2563eb"
                      : edge.relationType === "REDIRECTED_TO_EXTERNAL"
                        ? "#dc2626"
                        : "#64748b";
                  return (
                    <line
                      key={edge.uuid}
                      x1={src.x}
                      y1={src.y}
                      x2={tgt.x}
                      y2={tgt.y}
                      stroke={strokeColor}
                      strokeOpacity={isHighlighted ? 0.95 : 0.35}
                      strokeWidth={isHighlighted ? 2.8 : 1.4}
                    >
                      <title>{`${edge.relationType} (${Math.round(edge.weight * 100)}%): ${edge.reason ?? ""}`}</title>
                    </line>
                  );
                })}

                {/* 3. Nodes */}
                {snapshot.nodes.map(node => {
                  const pos = layout.nodePos.get(node.uuid);
                  if (!pos) return null;
                  const isNewlyLanded = placement?.nodeUuid === node.uuid;
                  const isSelected = selectedNodeUuid === node.uuid;
                  const shortLabel = node.externalKey
                    .replace("BKS.IV.1431.", "")
                    .replace("DEPT:", "")
                    .replace("EXT:", "")
                    .replace("LAW:", "");

                  return (
                    <g
                      key={node.uuid}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer"
                      onClick={() => setSelectedNodeUuid(node.uuid)}
                    >
                      {isNewlyLanded && (
                        <circle
                          r={22}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth={3}
                          className="animate-ping"
                          opacity={0.75}
                        />
                      )}
                      {node.nodeType === "LEGAL_ACT" ? (
                        <rect
                          x={-11}
                          y={-11}
                          width={22}
                          height={22}
                          rx={4}
                          fill={isNewlyLanded ? "#10b981" : node.clusterColor}
                          stroke={isSelected ? "#0f172a" : "#ffffff"}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                      ) : node.nodeType === "DEPARTMENT" || node.nodeType === "EXTERNAL_AUTHORITY" ? (
                        <polygon
                          points="0,-13 13,0 0,13 -13,0"
                          fill={node.nodeType === "EXTERNAL_AUTHORITY" ? "#dc2626" : node.clusterColor}
                          stroke={isSelected ? "#0f172a" : "#ffffff"}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                      ) : (
                        <circle
                          r={12}
                          fill={isNewlyLanded ? "#10b981" : node.clusterColor}
                          stroke={isSelected ? "#0f172a" : "#ffffff"}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                      )}
                      <text
                        y={24}
                        textAnchor="middle"
                        className="fill-foreground text-[10px] font-medium select-none"
                      >
                        {shortLabel.slice(0, 16)}
                      </text>
                      <title>{`${node.externalKey}: ${node.title}`}</title>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </section>

        {/* Right Sidebar: Ingest Document Form + Node JSON Inspector */}
        <aside className="flex flex-col gap-4">
          {/* Ingest New Document into Baza Wiedzy */}
          <form
            onSubmit={handleIngest}
            className="space-y-3 rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <PlusCircle aria-hidden="true" className="size-4 text-emerald-600" />
              <span>{polish ? "+ Dodaj dokument do Bazy Wiedzy" : "+ Ingest Document into KB"}</span>
            </div>

            {/* 1-Click Demo Presets */}
            <div className="space-y-1.5">
              <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                <Stars aria-hidden="true" className="size-3 text-amber-500" />
                {polish ? "Szybkie scenariusze demo (1 kliknięcie):" : "Quick demo presets (1 click):"}
              </span>
              <div className="flex flex-col gap-1">
                {DEMO_PRESETS.map(preset => (
                  <button
                    key={preset.externalKey}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-[11px] font-medium hover:bg-muted/60"
                  >
                    {polish ? preset.labelPl : preset.labelEn}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{polish ? "Typ węzła" : "Node type"}</span>
                <select
                  value={nodeType}
                  onChange={e =>
                    setNodeType(
                      e.target.value as "CASE" | "LEGAL_ACT" | "DEPARTMENT" | "EXTERNAL_AUTHORITY",
                    )
                  }
                  className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                >
                  <option value="CASE">CASE (Sprawa)</option>
                  <option value="LEGAL_ACT">LEGAL_ACT (Akt prawny)</option>
                  <option value="DEPARTMENT">DEPARTMENT (Wydział)</option>
                  <option value="EXTERNAL_AUTHORITY">EXTERNAL (Instytucja)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">{polish ? "Sygnatura / Klucz" : "Key / Signature"}</span>
                <Input
                  type="text"
                  value={externalKey}
                  placeholder="BKS.IV.1431.599.2026"
                  onChange={e => setExternalKey(e.target.value)}
                  required
                />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{polish ? "Tytuł" : "Title"}</span>
              <Input
                type="text"
                value={title}
                placeholder={polish ? "Tytuł dokumentu lub sprawy" : "Document or case title"}
                onChange={e => setTitle(e.target.value)}
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{polish ? "Streszczenie (~200 tokenów)" : "Summary (~200 tokens)"}</span>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                rows={3}
                required
                className="w-full rounded-md border border-border bg-background p-2 text-xs"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{polish ? "Tagi (po przecinku)" : "Tags (comma-separated)"}</span>
              <Input
                type="text"
                value={tagsInput}
                placeholder="szkoły podstawowe, cudzoziemcy, edukacja"
                onChange={e => setTagsInput(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">{polish ? "Powiązane wydziały (opcjonalnie)" : "Routed departments (optional)"}</span>
              <Input
                type="text"
                value={routedToInput}
                placeholder="Wydział Edukacji i Sportu"
                onChange={e => setRoutedToInput(e.target.value)}
              />
            </label>

            {ingestError && (
              <p role="alert" className="text-xs text-red-600">
                {polish ? "Nie udało się dodać węzła do Bazy Wiedzy." : "Failed to ingest node."}
              </p>
            )}

            <Button type="submit" tone="primary" disabled={ingesting} className="w-full">
              {ingesting
                ? polish
                  ? "Klasyfikowanie i umieszczanie w grafie…"
                  : "Classifying & placing in graph…"
                : polish
                  ? "Dodaj i pokaż gdzie wyląduje w grafie"
                  : "Ingest & visualize placement"}
            </Button>
          </form>

          {/* Selected Node Structured JSON Inspector */}
          <section className="rounded-xl border border-border bg-surface p-4 text-xs space-y-2">
            <h2 className="font-semibold text-sm">
              {polish ? "Inspektor Węzła (Struktura JSON)" : "Node Inspector (Structured JSON)"}
            </h2>
            {selectedNode ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <code className="font-mono font-semibold">{selectedNode.externalKey}</code>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                    style={{ backgroundColor: selectedNode.clusterColor }}
                  >
                    {selectedNode.clusterName}
                  </span>
                </div>
                <p className="font-medium text-foreground">{selectedNode.title}</p>
                <p className="text-muted-foreground">{selectedNode.summary}</p>
                {selectedNodeEdges.length > 0 && (
                  <div className="space-y-1 border-t border-border pt-2">
                    <p className="font-semibold text-[11px]">
                      {polish ? "Powiązania:" : "Connected edges:"} ({selectedNodeEdges.length})
                    </p>
                    {selectedNodeEdges.map(edge => (
                      <div key={edge.uuid} className="rounded bg-muted/40 px-2 py-1 text-[11px]">
                        <span className="font-mono font-semibold">{edge.relationType}</span> (
                        {Math.round(edge.weight * 100)}%) — {edge.reason}
                      </div>
                    ))}
                  </div>
                )}
                <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-background p-2 font-mono text-[10px]">
                  {JSON.stringify(selectedNode.structuredJson, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {polish
                  ? "Kliknij dowolny węzeł na grafie, aby zobaczyć jego rekord JSON i powiązania."
                  : "Click any node on the graph to inspect its structured JSON record and edges."}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
