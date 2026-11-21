"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowClockwise,
  CheckCircleFill,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  Diagram3,
  FileEarmarkPdf,
  Stars,
  ZoomIn,
  ZoomOut,
} from "react-bootstrap-icons";
import { API_ROUTES } from "@/config/api-routes";
import { Button, IconButton, Input, Throbber } from "@/ui/basic";

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
  aiMode?: string;
  fileName?: string;
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

const SVG_WIDTH = 1040;
const SVG_HEIGHT = 680;

export function KnowledgeGraphStudio({ polish }: { polish: boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedNodeUuid, setSelectedNodeUuid] = useState<string | null>(null);
  const [hoveredNodeUuid, setHoveredNodeUuid] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PlacementHighlight | null>(null);
  const [zoom, setZoom] = useState(100);
  const [inspectorTab, setInspectorTab] = useState<"details" | "json">("details");

  // PDF/DOCX Upload state
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Collapsible manual/demo drawer
  const [manualOpen, setManualOpen] = useState(false);
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

  // Spacious orbital cluster layout with zero overlapping labels
  const layout = useMemo(() => {
    if (!snapshot) {
      return {
        clusterPos: new Map<string, { x: number; y: number; r: number }>(),
        nodePos: new Map<string, { x: number; y: number }>(),
      };
    }
    const clusters = snapshot.clusters;
    const clusterPos = new Map<string, { x: number; y: number; r: number }>();
    const nodePos = new Map<string, { x: number; y: number }>();

    const cx = SVG_WIDTH / 2;
    const cy = SVG_HEIGHT / 2 + 10;
    const ringRx = 355;
    const ringRy = 215;

    clusters.forEach((cluster, idx) => {
      const angle = (idx / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2;
      const x = clusters.length === 1 ? cx : cx + Math.cos(angle) * ringRx;
      const y = clusters.length === 1 ? cy : cy + Math.sin(angle) * ringRy;
      const clusterNodes = snapshot.nodes.filter(n => n.clusterUuid === cluster.uuid);
      const radius = Math.min(126, Math.max(78, 60 + clusterNodes.length * 14));
      clusterPos.set(cluster.uuid, { x, y, r: radius });

      clusterNodes.forEach((node, nIdx) => {
        if (clusterNodes.length === 1) {
          nodePos.set(node.uuid, { x, y });
        } else {
          const nAngle = (nIdx / clusterNodes.length) * Math.PI * 2 - Math.PI / 3;
          const nRadius = radius * 0.58;
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

  async function handlePdfUpload(file: File) {
    setUploadingPdf(true);
    setUploadingFileName(file.name);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(API_ROUTES.adminKnowledgeUpload, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      if (!response.ok) {
        setUploadError(
          polish
            ? "Nie udało się odczytać pliku (obsługiwane: PDF, DOCX, TXT do 20 MiB)."
            : "Could not process document (supported: PDF, DOCX, TXT up to 20 MiB).",
        );
        return;
      }
      const data = (await response.json()) as {
        status?: string;
        node?: KbNode;
        cluster?: KbCluster;
        createdCluster?: boolean;
        newEdges?: KbEdge[];
        topMatches?: { externalKey: string; score: number }[];
        aiMode?: string;
        fileName?: string;
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
          aiMode: data.aiMode,
          fileName: data.fileName,
        });
        setSelectedNodeUuid(data.node.uuid);
        setInspectorTab("json");
        await refreshGraph();
      } else {
        setUploadError(polish ? "Błąd podczas dodawania do grafu." : "Failed to ingest document.");
      }
    } catch {
      setUploadError(polish ? "Błąd połączenia z serwerem." : "Network error during upload.");
    } finally {
      setUploadingPdf(false);
    }
  }

  function applyPreset(preset: (typeof DEMO_PRESETS)[number]) {
    setNodeType(preset.nodeType);
    setExternalKey(preset.externalKey);
    setTitle(preset.title);
    setSummary(preset.summary);
    setTagsInput(preset.tags);
    setRoutedToInput(preset.routedTo);
  }

  async function handleManualIngest(event: FormEvent) {
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

  const activeFocusUuid = hoveredNodeUuid ?? selectedNodeUuid;

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-4 py-3">
      {/* Compact Header + Inline Stats */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600/12 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Diagram3 aria-hidden="true" className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              {polish
                ? "Baza Wiedzy — Graf Relacyjny i Import Dokumentów"
                : "Knowledge Base — Relational Graph & Document Ingestion"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {polish
                ? "Wgraj PDF/DOCX archiwalnego wniosku, odpowiedzi lub aktu prawnego — lokalne AI utworzy rekord JSON i umieści go w grafie."
                : "Upload a PDF/DOCX archival request, response, or legal act — local AI generates a structured JSON summary and places it in the graph."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs">
              <span className="font-semibold text-foreground">{snapshot.stats.clusterCount}</span>
              <span className="text-muted-foreground">{polish ? "klastrów" : "clusters"}</span>
              <span className="text-border">·</span>
              <span className="font-semibold text-foreground">{snapshot.stats.nodeCount}</span>
              <span className="text-muted-foreground">{polish ? "węzłów" : "nodes"}</span>
              <span className="text-border">·</span>
              <span className="font-semibold text-foreground">{snapshot.stats.edgeCount}</span>
              <span className="text-muted-foreground">{polish ? "powiązań" : "edges"}</span>
            </div>
          )}
          <Button size="sm" tone="main-outline" disabled={loading} onClick={() => void refreshGraph()}>
            <ArrowClockwise aria-hidden="true" className="size-3.5" />
            {polish ? "Odśwież" : "Refresh"}
          </Button>
        </div>
      </header>

      {/* Placement Highlight Banner */}
      {placement && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/60 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-950 dark:text-emerald-100"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircleFill aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
            <div>
              <span className="font-semibold">
                {polish
                  ? `Dodano ${placement.externalKey} → klaster „${placement.clusterName}”${placement.createdCluster ? " (NOWY KLASTER!)" : ""}`
                  : `Ingested ${placement.externalKey} → cluster "${placement.clusterName}"${placement.createdCluster ? " (NEW CLUSTER!)" : ""}`}
              </span>
              <span className="ml-2 opacity-85">
                {polish
                  ? `· ${placement.edgeCount} powiązań${placement.topMatchKey && placement.topMatchScore ? ` · Najbliższa sprawa: ${placement.topMatchKey} (${Math.round(placement.topMatchScore * 100)}%)` : ""}${placement.aiMode === "ollama_json" ? " · Streszczenie: Lokalne AI (Ollama)" : ""}`
                  : `· ${placement.edgeCount} edges${placement.topMatchKey && placement.topMatchScore ? ` · Closest match: ${placement.topMatchKey} (${Math.round(placement.topMatchScore * 100)}%)` : ""}${placement.aiMode === "ollama_json" ? " · Summarized by Local AI (Ollama)" : ""}`}
              </span>
            </div>
          </div>
          <Button size="sm" tone="ghost" onClick={() => setPlacement(null)}>
            {polish ? "Zamknij" : "Dismiss"}
          </Button>
        </div>
      )}

      {/* Balanced 2-Column Workspace (Graph 8 cols + Upload/Inspector 4 cols) */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
        {/* Left: Sleek Interactive Graph Canvas */}
        <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface xl:col-span-8">
          <div className="flex h-11 items-center justify-between gap-2 border-b border-border px-3.5 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-foreground">
                {polish ? "Mapa Klastrów i Powiązań" : "Cluster & Similarity Graph"}
              </span>
              <span className="hidden items-center gap-2.5 text-[11px] text-muted-foreground sm:inline-flex">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block size-2 rounded-full bg-blue-600" />
                  {polish ? "Sprawa" : "Case"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block size-2 rounded-xs bg-teal-600" />
                  {polish ? "Akt prawny" : "Legal Act"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block size-2 rotate-45 bg-red-600" />
                  {polish ? "Wydział / Zewn." : "Dept / External"}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-1">
              <IconButton
                tone="ghost"
                label="Zoom out"
                disabled={zoom <= 75}
                onClick={() => setZoom(z => Math.max(75, z - 15))}
              >
                <ZoomOut aria-hidden="true" className="size-3.5" />
              </IconButton>
              <span className="min-w-[40px] text-center font-mono text-[11px] tabular-nums text-muted-foreground">
                {zoom}%
              </span>
              <IconButton
                tone="ghost"
                label="Zoom in"
                disabled={zoom >= 145}
                onClick={() => setZoom(z => Math.min(145, z + 15))}
              >
                <ZoomIn aria-hidden="true" className="size-3.5" />
              </IconButton>
            </div>
          </div>

          {/* Dot-grid SVG viewport */}
          <div
            className="relative overflow-auto bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px] p-2 dark:bg-[radial-gradient(#334155_1px,transparent_1px)]"
            style={{ minHeight: "620px" }}
          >
            {loading && !snapshot ? (
              <div className="flex h-[580px] items-center justify-center">
                <Throbber label="Loading graph" />
              </div>
            ) : error || !snapshot ? (
              <div className="flex h-[580px] items-center justify-center text-sm text-red-600">
                {polish ? "Nie udało się załadować grafu Bazy Wiedzy." : "Failed to load Knowledge Graph."}
              </div>
            ) : (
              <div
                className="mx-auto transition-all duration-200"
                style={{ width: `${zoom}%`, minWidth: "740px" }}
              >
                <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="h-auto w-full">
                  <defs>
                    <filter id="nodeShadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.18" />
                    </filter>
                  </defs>

                  {/* 1. Cluster Halos + Pill Titles */}
                  {snapshot.clusters.map(cluster => {
                    const pos = layout.clusterPos.get(cluster.uuid);
                    if (!pos) return null;
                    const labelWidth = Math.min(240, Math.max(110, cluster.name.length * 6.4 + 20));
                    return (
                      <g key={cluster.uuid}>
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={pos.r}
                          fill={cluster.color}
                          fillOpacity={0.07}
                          stroke={cluster.color}
                          strokeOpacity={0.35}
                          strokeWidth={1.5}
                          strokeDasharray="5 5"
                        />
                        <rect
                          x={pos.x - labelWidth / 2}
                          y={pos.y - pos.r - 22}
                          width={labelWidth}
                          height={20}
                          rx={10}
                          fill={cluster.color}
                          fillOpacity={0.14}
                          stroke={cluster.color}
                          strokeOpacity={0.45}
                          strokeWidth={1}
                        />
                        <text
                          x={pos.x}
                          y={pos.y - pos.r - 9}
                          textAnchor="middle"
                          className="fill-foreground text-[10.5px] font-semibold"
                        >
                          {cluster.name}
                        </text>
                      </g>
                    );
                  })}

                  {/* 2. Curved Bezier Edges */}
                  {snapshot.edges.map(edge => {
                    const src = layout.nodePos.get(edge.sourceNodeUuid);
                    const tgt = layout.nodePos.get(edge.targetNodeUuid);
                    if (!src || !tgt) return null;

                    const isNewEdge = placement?.edgeUuids.has(edge.uuid);
                    const isFocused =
                      isNewEdge
                      || edge.sourceNodeUuid === activeFocusUuid
                      || edge.targetNodeUuid === activeFocusUuid;
                    const dimmed = Boolean(activeFocusUuid && !isFocused);

                    // Subtle quadratic curve so overlapping edges stay readable
                    const mx = (src.x + tgt.x) / 2;
                    const my = (src.y + tgt.y) / 2;
                    const dx = tgt.x - src.x;
                    const dy = tgt.y - src.y;
                    const cx = mx - dy * 0.12;
                    const cy = my + dx * 0.12;

                    const strokeColor = isNewEdge
                      ? "#10b981"
                      : edge.relationType === "SIMILAR_CASE"
                        ? "#2563eb"
                        : edge.relationType === "REDIRECTED_TO_EXTERNAL"
                          ? "#dc2626"
                          : "#64748b";

                    return (
                      <path
                        key={edge.uuid}
                        d={`M ${src.x} ${src.y} Q ${cx} ${cy} ${tgt.x} ${tgt.y}`}
                        fill="none"
                        stroke={strokeColor}
                        strokeOpacity={dimmed ? 0.12 : isFocused ? 0.95 : 0.42}
                        strokeWidth={isNewEdge ? 3 : isFocused ? 2.4 : 1.5}
                        strokeDasharray={isNewEdge ? "6 3" : undefined}
                      >
                        <title>{`${edge.relationType} (${Math.round(edge.weight * 100)}%): ${edge.reason ?? ""}`}</title>
                      </path>
                    );
                  })}

                  {/* 3. Interactive Nodes with Clean Non-Overlapping Pill Labels */}
                  {snapshot.nodes.map(node => {
                    const pos = layout.nodePos.get(node.uuid);
                    if (!pos) return null;
                    const isNewlyLanded = placement?.nodeUuid === node.uuid;
                    const isSelected = selectedNodeUuid === node.uuid;
                    const isHovered = hoveredNodeUuid === node.uuid;
                    const shortLabel = node.externalKey
                      .replace("BKS.IV.1431.", "")
                      .replace("DEPT:", "")
                      .replace("EXT:", "")
                      .replace("LAW:", "")
                      .slice(0, 15);
                    const pillW = Math.max(44, shortLabel.length * 6.1 + 12);

                    return (
                      <g
                        key={node.uuid}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        className="cursor-pointer"
                        onClick={() => setSelectedNodeUuid(node.uuid)}
                        onMouseEnter={() => setHoveredNodeUuid(node.uuid)}
                        onMouseLeave={() => setHoveredNodeUuid(null)}
                      >
                        {isNewlyLanded && (
                          <circle
                            r={23}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth={3}
                            className="animate-ping"
                            opacity={0.75}
                          />
                        )}
                        {(isSelected || isHovered) && (
                          <circle
                            r={18}
                            fill={node.clusterColor}
                            fillOpacity={0.18}
                          />
                        )}
                        {node.nodeType === "LEGAL_ACT" ? (
                          <rect
                            x={-11}
                            y={-11}
                            width={22}
                            height={22}
                            rx={5}
                            filter="url(#nodeShadow)"
                            fill={isNewlyLanded ? "#10b981" : node.clusterColor}
                            stroke={isSelected ? "#0f172a" : "#ffffff"}
                            strokeWidth={isSelected ? 3 : 2}
                          />
                        ) : node.nodeType === "DEPARTMENT" || node.nodeType === "EXTERNAL_AUTHORITY" ? (
                          <polygon
                            points="0,-13 13,0 0,13 -13,0"
                            filter="url(#nodeShadow)"
                            fill={node.nodeType === "EXTERNAL_AUTHORITY" ? "#dc2626" : node.clusterColor}
                            stroke={isSelected ? "#0f172a" : "#ffffff"}
                            strokeWidth={isSelected ? 3 : 2}
                          />
                        ) : (
                          <circle
                            r={12}
                            filter="url(#nodeShadow)"
                            fill={isNewlyLanded ? "#10b981" : node.clusterColor}
                            stroke={isSelected ? "#0f172a" : "#ffffff"}
                            strokeWidth={isSelected ? 3 : 2}
                          />
                        )}

                        {/* Crisp white pill behind label so text NEVER clashes with edges or circles */}
                        <rect
                          x={-pillW / 2}
                          y={16}
                          width={pillW}
                          height={16}
                          rx={8}
                          className="fill-background/95 stroke-border"
                          strokeWidth={0.75}
                        />
                        <text
                          y={27}
                          textAnchor="middle"
                          className="fill-foreground text-[9.5px] font-semibold select-none"
                        >
                          {shortLabel}
                        </text>
                        <title>{`${node.externalKey}: ${node.title}`}</title>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>
        </section>

        {/* Right: Primary PDF/DOCX AI Uploader + Tabbed Node Inspector + Collapsible Manual Drawer */}
        <aside className="flex flex-col gap-4 xl:col-span-4">
          {/* 1. Primary PDF / DOCX Drag-and-Drop AI Uploader */}
          <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileEarmarkPdf aria-hidden="true" className="size-4 text-red-600" />
                <span>
                  {polish ? "Wgraj PDF / DOCX do Bazy Wiedzy (AI → JSON)" : "Upload PDF / DOCX to KB (AI → JSON)"}
                </span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void handlePdfUpload(file);
                event.target.value = "";
              }}
            />

            <div
              onDragOver={event => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={event => {
                event.preventDefault();
                setDragActive(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handlePdfUpload(file);
              }}
              onClick={() => !uploadingPdf && fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
                dragActive
                  ? "border-blue-600 bg-blue-500/10"
                  : "border-border bg-background/60 hover:border-blue-500/60 hover:bg-muted/30"
              }`}
            >
              {uploadingPdf ? (
                <>
                  <Throbber label="Processing PDF" />
                  <p className="text-xs font-semibold text-foreground">{uploadingFileName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {polish
                      ? "1. Ekstrakcja tekstu → 2. Streszczenie JSON (Lokalne AI) → 3. Umieszczenie w grafie…"
                      : "1. Text extraction → 2. Local AI JSON summary → 3. Graph placement…"}
                  </p>
                </>
              ) : (
                <>
                  <CloudUpload aria-hidden="true" className="size-8 text-blue-600" />
                  <p className="text-xs font-semibold text-foreground">
                    {polish
                      ? "Upuść plik PDF / DOCX wniosku lub odpowiedzi tutaj"
                      : "Drop an archival request or response PDF / DOCX here"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {polish
                      ? "Lokalne AI wygeneruje ~200-tokenowy JSON, dobierze klaster i połączy podobne sprawy."
                      : "Local AI generates a ~200-token JSON summary, picks the cluster, and links similar cases."}
                  </p>
                  <Button type="button" size="sm" tone="primary" className="mt-1">
                    {polish ? "Wybierz plik PDF / DOCX" : "Choose PDF / DOCX file"}
                  </Button>
                </>
              )}
            </div>

            {uploadError && (
              <p role="alert" className="text-xs text-red-600">
                {uploadError}
              </p>
            )}
          </section>

          {/* 2. Sleek Tabbed Node Inspector */}
          <section className="rounded-xl border border-border bg-surface p-4 text-xs space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
              <h2 className="text-sm font-semibold">
                {polish ? "Inspektor Węzła" : "Node Inspector"}
              </h2>
              {selectedNode && (
                <div className="flex rounded-md border border-border bg-background p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setInspectorTab("details")}
                    className={`rounded px-2 py-0.5 font-medium ${
                      inspectorTab === "details"
                        ? "bg-blue-600 text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {polish ? "Szczegóły" : "Details"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorTab("json")}
                    className={`rounded px-2 py-0.5 font-medium ${
                      inspectorTab === "json"
                        ? "bg-blue-600 text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    JSON
                  </button>
                </div>
              )}
            </div>

            {selectedNode ? (
              inspectorTab === "json" ? (
                <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-background p-2.5 font-mono text-[10.5px]">
                  {JSON.stringify(selectedNode.structuredJson, null, 2)}
                </pre>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono font-semibold text-foreground">
                      {selectedNode.externalKey}
                    </code>
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: selectedNode.clusterColor }}
                    >
                      {selectedNode.clusterName}
                    </span>
                  </div>
                  <p className="font-semibold text-foreground">{selectedNode.title}</p>
                  <p className="leading-relaxed text-muted-foreground">{selectedNode.summary}</p>
                  {selectedNode.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedNode.tags.map(tag => (
                        <span
                          key={tag}
                          className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {selectedNodeEdges.length > 0 && (
                    <div className="space-y-1 border-t border-border pt-2">
                      <p className="text-[11px] font-semibold text-foreground">
                        {polish ? "Powiązania w grafie" : "Graph Edges"} ({selectedNodeEdges.length})
                      </p>
                      {selectedNodeEdges.map(edge => (
                        <div key={edge.uuid} className="rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px]">
                          <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">
                            {edge.relationType}
                          </span>{" "}
                          <span className="font-semibold">({Math.round(edge.weight * 100)}%)</span>
                          {edge.reason ? ` — ${edge.reason}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            ) : (
              <p className="py-4 text-center text-muted-foreground">
                {polish
                  ? "Kliknij dowolny węzeł na grafie, aby podejrzeć jego streszczenie JSON i powiązania."
                  : "Click any node on the graph to inspect its JSON summary and relational edges."}
              </p>
            )}
          </section>

          {/* 3. Collapsible Manual Entry / 1-Click Jury Demo Drawer */}
          <section className="rounded-xl border border-border bg-surface">
            <button
              type="button"
              onClick={() => setManualOpen(o => !o)}
              className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-foreground hover:bg-muted/30"
            >
              <span className="flex items-center gap-1.5">
                <Stars aria-hidden="true" className="size-3.5 text-amber-500" />
                {polish ? "Dodaj ręcznie / Szybkie scenariusze demo" : "Manual Entry / Quick Demo Presets"}
              </span>
              {manualOpen ? (
                <ChevronUp aria-hidden="true" className="size-3.5" />
              ) : (
                <ChevronDown aria-hidden="true" className="size-3.5" />
              )}
            </button>

            {manualOpen && (
              <form onSubmit={handleManualIngest} className="space-y-2.5 border-t border-border p-4 text-xs">
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
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={nodeType}
                    onChange={e =>
                      setNodeType(
                        e.target.value as "CASE" | "LEGAL_ACT" | "DEPARTMENT" | "EXTERNAL_AUTHORITY",
                      )
                    }
                    className="h-9 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="CASE">CASE</option>
                    <option value="LEGAL_ACT">LEGAL_ACT</option>
                    <option value="DEPARTMENT">DEPARTMENT</option>
                    <option value="EXTERNAL_AUTHORITY">EXTERNAL</option>
                  </select>
                  <Input
                    type="text"
                    value={externalKey}
                    placeholder="BKS.IV.1431.599.2026"
                    onChange={e => setExternalKey(e.target.value)}
                    required
                  />
                </div>
                <Input
                  type="text"
                  value={title}
                  placeholder={polish ? "Tytuł" : "Title"}
                  onChange={e => setTitle(e.target.value)}
                  required
                />
                <textarea
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  rows={2}
                  placeholder={polish ? "Streszczenie..." : "Summary..."}
                  required
                  className="w-full rounded-md border border-border bg-background p-2 text-xs"
                />
                <Input
                  type="text"
                  value={tagsInput}
                  placeholder={polish ? "Tagi (po przecinku)" : "Tags (comma-separated)"}
                  onChange={e => setTagsInput(e.target.value)}
                />
                <Input
                  type="text"
                  value={routedToInput}
                  placeholder={polish ? "Powiązane wydziały" : "Routed departments"}
                  onChange={e => setRoutedToInput(e.target.value)}
                />
                {ingestError && (
                  <p role="alert" className="text-red-600">
                    {polish ? "Błąd zapisu węzła." : "Failed to save node."}
                  </p>
                )}
                <Button type="submit" size="sm" tone="primary" disabled={ingesting} className="w-full">
                  {ingesting
                    ? polish ? "Dodawanie…" : "Ingesting…"
                    : polish ? "Dodaj ręcznie do grafu" : "Add manually to graph"}
                </Button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
