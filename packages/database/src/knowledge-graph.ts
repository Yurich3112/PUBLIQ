import {
  KbEdgeRelation,
  KbNodeType,
  type Prisma,
  type PrismaClient,
} from './generated/prisma/client.js';
import {
  classifyRoutingScenario,
  exportInstitutionRegistryForLlm,
  getResponseTemplateByCaseNumber,
  type LlmInstitutionJsonEntry,
  type ResponseTemplateRecord,
  type UdipRoutingScenario,
} from './institutions-and-templates.js';

export const KB_TWIN_MATCH_THRESHOLD = 0.75;
export const KB_SIMILAR_EDGE_THRESHOLD = 0.55;
export const KB_CLUSTER_ASSIGN_THRESHOLD = 0.45;

export interface KbStructuredCaseJson {
  case_id?: string | null;
  year?: number | null;
  tags: string[];
  summary: string;
  routed_to: string[];
  is_external_authority: boolean;
  external_authority: string | null;
  outcome_type: string;
  legal_basis: string[];
  template_file: string | null;
  cluster?: string | null;
}

export interface KbClusterRecord {
  uuid: string;
  slug: string;
  name: string;
  color: string;
  description: string;
}

export interface KbNodeRecord {
  uuid: string;
  nodeType: KbNodeType;
  externalKey: string;
  title: string;
  summary: string;
  structuredJson: KbStructuredCaseJson;
  tags: string[];
  clusterUuid: string;
  clusterSlug: string;
  clusterName: string;
  clusterColor: string;
  sourceCaseUuid: string | null;
  createdAt: Date;
}

export interface KbEdgeRecord {
  uuid: string;
  sourceNodeUuid: string;
  targetNodeUuid: string;
  relationType: KbEdgeRelation;
  weight: number;
  reason: string | null;
}

export interface KbMatchCandidate {
  nodeUuid: string;
  externalKey: string;
  nodeType: KbNodeType;
  title: string;
  summary: string;
  clusterSlug: string;
  clusterName: string;
  score: number;
  sharedTags: string[];
  matchedEntities: string[];
  reason: string;
  structuredJson: KbStructuredCaseJson;
}

export interface KbRegistryItem {
  externalKey: string;
  name: string;
  summary: string;
  tags: string[];
}

export interface KbExternalAuthorityHint {
  externalKey: string;
  name: string;
  matchedTerms: string[];
  legalBasis: string;
}

export interface KbMatchResult {
  path: 'TWIN_CASE_MATCH' | 'AI_FALLBACK_REQUIRED';
  /** Explicit 4-case UDIP routing scenario: 1) OUR_OFFICE_NEW, 2) OUR_OFFICE_SIMILAR_FOUND, 3) EXTERNAL_INSTITUTION, 4) OTHER_INTERNAL_DEPARTMENT. */
  scenario: UdipRoutingScenario;
  threshold: number;
  latencyMs: number;
  queryTags: string[];
  topMatch: KbMatchCandidate | null;
  matches: KbMatchCandidate[];
  recommendedDepartments: string[];
  externalAuthorityHint: KbExternalAuthorityHint | null;
  /** Archived past response PDF + extracted body text from ResponseTemplateArchive when a similar case is matched. */
  referenceTemplate: ResponseTemplateRecord | null;
  /** Compact JSON list from InstitutionRegistry ready to pass directly into the local LLM (gemma3/gemma4). */
  institutionsForLlm: LlmInstitutionJsonEntry[];
  fallbackContext: {
    departmentsRegistry: KbRegistryItem[];
    externalAuthoritiesRegistry: KbRegistryItem[];
  } | null;
}

export interface KbMatchInput {
  title?: string;
  summary: string;
  tags?: string[];
  limit?: number;
}

export interface KbIngestInput {
  nodeType: KbNodeType;
  externalKey: string;
  title: string;
  summary: string;
  tags?: string[];
  routedTo?: string[];
  isExternalAuthority?: boolean;
  externalAuthority?: string | null;
  outcomeType?: string;
  legalBasis?: string[];
  templateFile?: string | null;
  year?: number | null;
  preferredClusterSlug?: string | null;
  sourceCaseUuid?: string | null;
  actorUuid?: string | null;
}

export interface KbIngestResult {
  node: KbNodeRecord;
  cluster: KbClusterRecord;
  createdCluster: boolean;
  newEdges: KbEdgeRecord[];
  topMatches: KbMatchCandidate[];
}

export interface KbGraphSnapshot {
  stats: {
    clusterCount: number;
    nodeCount: number;
    caseCount: number;
    legalActCount: number;
    departmentCount: number;
    externalAuthorityCount: number;
    edgeCount: number;
  };
  clusters: KbClusterRecord[];
  nodes: KbNodeRecord[];
  edges: KbEdgeRecord[];
}

const POLISH_STOPWORDS = new Set([
  'i', 'w', 'z', 'na', 'do', 'o', 'od', 'po', 'za', 'ze', 'we', 'się', 'sie',
  'nie', 'to', 'jest', 'są', 'sa', 'być', 'byc', 'oraz', 'lub', 'albo', 'jak',
  'dla', 'przez', 'przy', 'pod', 'nad', 'bez', 'przed', 'poza', 'który', 'ktory',
  'która', 'ktora', 'które', 'ktore', 'których', 'ktorych', 'tego', 'tej', 'tym',
  'tych', 'ten', 'ta', 'te', 'proszę', 'prosze', 'wniosku', 'wniosek', 'sprawie',
  'informacji', 'informacja', 'publicznej', 'publiczna', 'udostępnienie',
  'udostepnienie', 'bydgoszczy', 'bydgoszcz', 'miasta', 'miasto', 'urząd', 'urzad',
  'prezydenta', 'prezydent', 'dnia', 'stan', 'koniec', 'roku', 'rok', 'nr', 'dot',
  'wskazanych', 'poszczególnych', 'poszczegolnych', 'zgodnie', 'załączonymi',
  'zalaczonymi', 'pani', 'pan', 'pana', 'prosimy', 'wnoszę', 'wnosze', 'podanie',
]);

const POLISH_SUFFIXES = [
  'owego', 'owej', 'owych', 'owym', 'owymi', 'aniu', 'eniu', 'ania', 'enia',
  'anie', 'enie', 'ów', 'ow', 'ami', 'ach', 'ego', 'emu', 'ych', 'imi', 'ymi',
  'iom', 'om', 'em', 'ie', 'iu', 'ą', 'ę', 'y', 'i', 'a', 'e', 'o', 'u',
];

const BYDGOSZCZ_ENTITIES: readonly { canonical: string; patterns: readonly string[] }[] = [
  { canonical: 'szkoly_podstawowe', patterns: ['szkol', 'uczni', 'obcokrajow', 'cudzoziem', 'edukac', 'sio'] },
  { canonical: 'bezdomne_zwierzeta', patterns: ['zwierz', 'schronisk', 'odlawian', 'wylapywan', 'bezdomn', 'psow', 'kotow'] },
  { canonical: 'basen_astoria', patterns: ['astori', 'basen', 'plywaln', 'wizualizac', 'obiektow sportow'] },
  { canonical: 'sprzedaz_alkoholu', patterns: ['alkohol', 'koncesj', 'zezwolen', 'punktow sprzedaz', 'brusk'] },
  { canonical: 'odpady_komunalne', patterns: ['odpad', 'smiec', 'deklaracj', 'mieszkanc', 'gospodarowan'] },
  { canonical: 'rondo_grunwaldzkie_rzezba', patterns: ['rzezba', 'rzezb', 'stehnov', 'grunwaldzk', 'konserwator', 'zabytk'] },
  { canonical: 'zdmikp_drogi', patterns: ['zdmikp', 'drog', 'komunikacj', '102/tt/2019', 'jakotako', 'transport'] },
  { canonical: 'zus_emerytury', patterns: ['zus', 'skladk', 'emerytur', 'rent', 'ubezpieczen spoleczn'] },
];

const EXTERNAL_HEURISTICS: readonly {
  externalKey: string;
  name: string;
  patterns: readonly string[];
  legalBasis: string;
}[] = [
  {
    externalKey: 'EXT:ZUS',
    name: 'Zakład Ubezpieczeń Społecznych (ZUS) — Oddział w Bydgoszczy',
    patterns: ['zus', 'emerytur', 'rentow', 'skladk', 'ubezpieczen spoleczn'],
    legalBasis: 'Art. 4 ust. 3 UDIP — Urząd Miasta Bydgoszczy nie jest dysponentem danych ZUS.',
  },
  {
    externalKey: 'EXT:ZDMIKP',
    name: 'Zarząd Dróg Miejskich i Komunikacji Publicznej w Bydgoszczy (ZDMiKP)',
    patterns: ['zdmikp', 'zarzad drog', '102/tt/2019', 'komunikacji publicznej'],
    legalBasis: 'Art. 4 ust. 3 UDIP — właściwym dysponentem danych jest ZDMiKP (ul. Toruńska 174a).',
  },
  {
    externalKey: 'EXT:WKZ',
    name: 'Kujawsko-Pomorski Wojewódzki Konserwator Zabytków — Delegatura w Bydgoszczy',
    patterns: ['konserwator', 'zabytk', 'stehnov', 'rzezb'],
    legalBasis: 'Art. 4 ust. 3 UDIP — właściwym dysponentem danych jest Kujawsko-Pomorski WKZ (ul. Jezuicka 2).',
  },
];

/** Strip Polish diacritics and lowercase for deterministic offline matching. */
export function normalizePolishText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9/.\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lightweight Polish stemmer keeping at least 4 characters so inflections match cleanly. */
export function stemPolishToken(token: string): string {
  const clean = normalizePolishText(token);
  if (clean.length <= 4) return clean;
  for (const suffix of POLISH_SUFFIXES) {
    if (clean.endsWith(suffix) && clean.length - suffix.length >= 4) {
      return clean.slice(0, clean.length - suffix.length);
    }
  }
  return clean;
}

/** Tokenize Polish text into normalized, stopword-filtered stems. */
export function tokenizePolishStems(input: string): string[] {
  const normalized = normalizePolishText(input);
  if (!normalized) return [];
  const rawTokens = normalized.split(/[\s,;:()]+/).filter(Boolean);
  const stems: string[] = [];
  for (const raw of rawTokens) {
    if (raw.length < 3 || POLISH_STOPWORDS.has(raw)) continue;
    const stem = stemPolishToken(raw);
    if (stem.length >= 3 && !POLISH_STOPWORDS.has(stem)) {
      stems.push(stem);
    }
  }
  return stems;
}

/** Extract canonical Bydgoszcz domain entities present in the text. */
export function detectBydgoszczEntities(input: string): string[] {
  const normalized = normalizePolishText(input);
  const found: string[] = [];
  for (const entity of BYDGOSZCZ_ENTITIES) {
    if (entity.patterns.some(p => normalized.includes(p))) {
      found.push(entity.canonical);
    }
  }
  return found;
}

/** Auto-extract normalized tags from a text/summary when caller didn't supply explicit tags. */
export function extractAutoTags(text: string, explicitTags: readonly string[] = []): string[] {
  const set = new Set<string>();
  for (const tag of explicitTags) {
    const clean = tag.trim().toLowerCase();
    if (clean) set.add(clean);
  }
  const freq = new Map<string, number>();
  for (const raw of normalizePolishText(text).split(/\s+/)) {
    if (raw.length < 4 || POLISH_STOPWORDS.has(raw)) continue;
    freq.set(raw, (freq.get(raw) ?? 0) + 1);
  }
  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 8)
    .map(([word]) => word);
  for (const word of ranked) set.add(word);
  return [...set].slice(0, 12);
}

export interface SimilarityScoreDetail {
  score: number;
  tagJaccard: number;
  tfidfCosine: number;
  entityBoost: number;
  sharedTags: string[];
  matchedEntities: string[];
  reason: string;
}

/**
 * Pure-TypeScript hybrid similarity scorer (<1ms per comparison):
 * 0.40 * Tag Stem Jaccard + 0.40 * TF-IDF Cosine + 0.20 * Bydgoszcz Entity Boost.
 */
export function scoreKnowledgeSimilarity(
  query: { title?: string; summary: string; tags: readonly string[] },
  candidate: { title: string; summary: string; tags: readonly string[] },
  idfMap: ReadonlyMap<string, number>,
): SimilarityScoreDetail {
  const qText = `${query.title ?? ''} ${query.summary} ${query.tags.join(' ')}`;
  const cText = `${candidate.title} ${candidate.summary} ${candidate.tags.join(' ')}`;

  const qTagStems = new Set(query.tags.flatMap(t => tokenizePolishStems(t)));
  const cTagStems = new Set(candidate.tags.flatMap(t => tokenizePolishStems(t)));

  // Fallback to summary stems if tags are sparse
  const qEffectiveTags = qTagStems.size > 0 ? qTagStems : new Set(tokenizePolishStems(query.summary));
  const cEffectiveTags = cTagStems.size > 0 ? cTagStems : new Set(tokenizePolishStems(candidate.summary));

  let tagIntersection = 0;
  for (const stem of qEffectiveTags) {
    if (cEffectiveTags.has(stem)) tagIntersection++;
  }
  const tagUnion = new Set([...qEffectiveTags, ...cEffectiveTags]).size;
  const tagJaccard = tagUnion > 0 ? tagIntersection / tagUnion : 0;

  // Human-readable shared tags
  const sharedTags: string[] = [];
  for (const cTag of candidate.tags) {
    const stems = tokenizePolishStems(cTag);
    if (stems.some(s => qEffectiveTags.has(s))) {
      sharedTags.push(cTag);
    }
  }

  // TF-IDF cosine over full normalized stems
  const qStems = tokenizePolishStems(qText);
  const cStems = tokenizePolishStems(cText);
  const qTf = new Map<string, number>();
  const cTf = new Map<string, number>();
  for (const s of qStems) qTf.set(s, (qTf.get(s) ?? 0) + 1);
  for (const s of cStems) cTf.set(s, (cTf.get(s) ?? 0) + 1);

  let dot = 0;
  let qNorm = 0;
  let cNorm = 0;
  for (const [term, count] of qTf) {
    const w = count * (idfMap.get(term) ?? 1.5);
    qNorm += w * w;
    const cCount = cTf.get(term);
    if (cCount) {
      dot += w * (cCount * (idfMap.get(term) ?? 1.5));
    }
  }
  for (const [term, count] of cTf) {
    const w = count * (idfMap.get(term) ?? 1.5);
    cNorm += w * w;
  }
  const tfidfCosine = qNorm > 0 && cNorm > 0 ? dot / (Math.sqrt(qNorm) * Math.sqrt(cNorm)) : 0;

  // Bydgoszcz domain entity boost
  const qEntities = new Set(detectBydgoszczEntities(qText));
  const cEntities = new Set(detectBydgoszczEntities(cText));
  const matchedEntities = [...qEntities].filter(e => cEntities.has(e));
  const entityBoost =
    matchedEntities.length > 0
      ? Math.min(1, matchedEntities.length / Math.max(1, Math.min(qEntities.size, cEntities.size)))
      : 0;

  // Weighted blend + strong twin-topic boost when both lexical similarity and canonical entity match
  let rawScore = 0.40 * tagJaccard + 0.40 * tfidfCosine + 0.20 * entityBoost;
  if (matchedEntities.length > 0 && (tfidfCosine >= 0.45 || tagJaccard >= 0.35)) {
    rawScore = Math.min(0.99, rawScore + 0.22);
  }
  const score = Math.round(Math.max(0, Math.min(1, rawScore)) * 100) / 100;

  const reasonParts: string[] = [];
  if (sharedTags.length > 0) {
    reasonParts.push(`Wspólne tagi: ${sharedTags.slice(0, 4).join(', ')}`);
  }
  if (matchedEntities.length > 0) {
    reasonParts.push(`Domena: ${matchedEntities.join(', ')}`);
  }
  const reason =
    reasonParts.length > 0
      ? reasonParts.join(' · ')
      : `Podobieństwo tekstowe (${Math.round(score * 100)}%)`;

  return {
    score,
    tagJaccard,
    tfidfCosine,
    entityBoost,
    sharedTags,
    matchedEntities,
    reason,
  };
}

function buildIdfMap(docs: readonly { title: string; summary: string; tags: readonly string[] }[]): Map<string, number> {
  const df = new Map<string, number>();
  const totalDocs = Math.max(1, docs.length);
  for (const doc of docs) {
    const unique = new Set(tokenizePolishStems(`${doc.title} ${doc.summary} ${doc.tags.join(' ')}`));
    for (const term of unique) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log((totalDocs + 1) / (count + 1)) + 1);
  }
  return idf;
}

export function detectExternalAuthorityHint(text: string): KbExternalAuthorityHint | null {
  const normalized = normalizePolishText(text);
  for (const rule of EXTERNAL_HEURISTICS) {
    const matched = rule.patterns.filter(p => normalized.includes(p));
    if (matched.length > 0) {
      return {
        externalKey: rule.externalKey,
        name: rule.name,
        matchedTerms: matched,
        legalBasis: rule.legalBasis,
      };
    }
  }
  return null;
}

function asStructuredJson(raw: Prisma.JsonValue, fallbackSummary: string, fallbackTags: string[]): KbStructuredCaseJson {
  const obj = typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    case_id: typeof obj.case_id === 'string' ? obj.case_id : null,
    year: typeof obj.year === 'number' ? obj.year : null,
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === 'string') : fallbackTags,
    summary: typeof obj.summary === 'string' ? obj.summary : fallbackSummary,
    routed_to: Array.isArray(obj.routed_to)
      ? obj.routed_to.filter((t): t is string => typeof t === 'string')
      : [],
    is_external_authority: Boolean(obj.is_external_authority),
    external_authority: typeof obj.external_authority === 'string' ? obj.external_authority : null,
    outcome_type: typeof obj.outcome_type === 'string' ? obj.outcome_type : 'UDZIELONO_ODPOWIEDZI',
    legal_basis: Array.isArray(obj.legal_basis)
      ? obj.legal_basis.filter((t): t is string => typeof t === 'string')
      : [],
    template_file: typeof obj.template_file === 'string' ? obj.template_file : null,
    cluster: typeof obj.cluster === 'string' ? obj.cluster : null,
  };
}

/**
 * Pure in-memory matcher used both by `matchKnowledgeGraph(db, ...)` and unit tests.
 */
export function runKnowledgeGraphMatch(
  nodes: readonly KbNodeRecord[],
  input: KbMatchInput,
): KbMatchResult {
  const startedAt = performance.now();
  const queryTags = extractAutoTags(`${input.title ?? ''} ${input.summary}`, input.tags ?? []);
  const searchableNodes = nodes.filter(
    n => n.nodeType === KbNodeType.CASE || n.nodeType === KbNodeType.LEGAL_ACT,
  );
  const idfMap = buildIdfMap([
    { title: input.title ?? '', summary: input.summary, tags: queryTags },
    ...searchableNodes,
  ]);

  const scored: KbMatchCandidate[] = searchableNodes
    .map(node => {
      const detail = scoreKnowledgeSimilarity(
        { title: input.title, summary: input.summary, tags: queryTags },
        node,
        idfMap,
      );
      return {
        nodeUuid: node.uuid,
        externalKey: node.externalKey,
        nodeType: node.nodeType,
        title: node.title,
        summary: node.summary,
        clusterSlug: node.clusterSlug,
        clusterName: node.clusterName,
        score: detail.score,
        sharedTags: detail.sharedTags,
        matchedEntities: detail.matchedEntities,
        reason: detail.reason,
        structuredJson: node.structuredJson,
      };
    })
    .filter(item => item.score > 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 5);

  const topMatch = scored[0] ?? null;
  const isTwinMatch = Boolean(topMatch && topMatch.score >= KB_TWIN_MATCH_THRESHOLD);
  const externalAuthorityHint = detectExternalAuthorityHint(`${input.title ?? ''} ${input.summary}`);

  const recommendedDepartments = isTwinMatch && topMatch
    ? topMatch.structuredJson.routed_to
    : [];

  const departmentsRegistry: KbRegistryItem[] = nodes
    .filter(n => n.nodeType === KbNodeType.DEPARTMENT)
    .map(n => ({ externalKey: n.externalKey, name: n.title, summary: n.summary, tags: n.tags }));

  const externalAuthoritiesRegistry: KbRegistryItem[] = nodes
    .filter(n => n.nodeType === KbNodeType.EXTERNAL_AUTHORITY)
    .map(n => ({ externalKey: n.externalKey, name: n.title, summary: n.summary, tags: n.tags }));

  const isExternalAuthority = Boolean(
    externalAuthorityHint || (isTwinMatch && topMatch?.structuredJson.is_external_authority),
  );
  const scenario = classifyRoutingScenario({
    isTwinMatch,
    isExternalAuthority,
    recommendedDepartments,
  });

  return {
    path: isTwinMatch ? 'TWIN_CASE_MATCH' : 'AI_FALLBACK_REQUIRED',
    scenario,
    threshold: KB_TWIN_MATCH_THRESHOLD,
    latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
    queryTags,
    topMatch,
    matches: scored,
    recommendedDepartments,
    externalAuthorityHint,
    referenceTemplate: null,
    institutionsForLlm: [],
    fallbackContext: isTwinMatch
      ? null
      : {
          departmentsRegistry,
          externalAuthoritiesRegistry,
        },
  };
}

function toNodeRecord(
  row: Prisma.KbNodeGetPayload<{ include: { cluster: true } }>,
): KbNodeRecord {
  return {
    uuid: row.uuid,
    nodeType: row.nodeType,
    externalKey: row.externalKey,
    title: row.title,
    summary: row.summary,
    structuredJson: asStructuredJson(row.structuredJson, row.summary, row.tags),
    tags: row.tags,
    clusterUuid: row.clusterUuid,
    clusterSlug: row.cluster.slug,
    clusterName: row.cluster.name,
    clusterColor: row.cluster.color,
    sourceCaseUuid: row.sourceCaseUuid,
    createdAt: row.createdAt,
  };
}

/** Match a new UDIP request JSON / text against Baza Wiedzy in PostgreSQL (<10ms), enriching with InstitutionRegistry JSON & ResponseTemplateArchive PDF. */
export async function matchKnowledgeGraph(
  db: PrismaClient,
  input: KbMatchInput,
): Promise<KbMatchResult> {
  const [rows, institutionsForLlm] = await Promise.all([
    db.kbNode.findMany({ include: { cluster: true } }),
    exportInstitutionRegistryForLlm(db),
  ]);
  const result = runKnowledgeGraphMatch(rows.map(toNodeRecord), input);

  let referenceTemplate: ResponseTemplateRecord | null = null;
  if (result.topMatch?.externalKey) {
    referenceTemplate = await getResponseTemplateByCaseNumber(db, result.topMatch.externalKey);
  }

  return {
    ...result,
    referenceTemplate,
    institutionsForLlm,
  };
}

/** Return full Clusters + Nodes + Edges snapshot for Panel Admina visualization. */
export async function getKnowledgeGraphSnapshot(db: PrismaClient): Promise<KbGraphSnapshot> {
  const [clusters, rawNodes, edges] = await db.$transaction([
    db.kbCluster.findMany({ orderBy: { name: 'asc' } }),
    db.kbNode.findMany({ include: { cluster: true }, orderBy: { createdAt: 'desc' } }),
    db.kbEdge.findMany({ orderBy: { weight: 'desc' } }),
  ]);

  const nodes = rawNodes.map(toNodeRecord);
  return {
    stats: {
      clusterCount: clusters.length,
      nodeCount: nodes.length,
      caseCount: nodes.filter(n => n.nodeType === KbNodeType.CASE).length,
      legalActCount: nodes.filter(n => n.nodeType === KbNodeType.LEGAL_ACT).length,
      departmentCount: nodes.filter(n => n.nodeType === KbNodeType.DEPARTMENT).length,
      externalAuthorityCount: nodes.filter(n => n.nodeType === KbNodeType.EXTERNAL_AUTHORITY).length,
      edgeCount: edges.length,
    },
    clusters: clusters.map(c => ({
      uuid: c.uuid,
      slug: c.slug,
      name: c.name,
      color: c.color,
      description: c.description,
    })),
    nodes,
    edges: edges.map(e => ({
      uuid: e.uuid,
      sourceNodeUuid: e.sourceNodeUuid,
      targetNodeUuid: e.targetNodeUuid,
      relationType: e.relationType,
      weight: e.weight,
      reason: e.reason,
    })),
  };
}

function slugifyCluster(label: string): string {
  return normalizePolishText(label)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'nowy_klaster';
}

/**
 * Self-learning ingestion: inserts a new structured JSON node into Baza Wiedzy,
 * assigns it to the best matching KbCluster (or creates a new cluster if max score < 0.45),
 * and creates weighted SIMILAR_CASE, ROUTED_TO_DEPT, REDIRECTED_TO_EXTERNAL, and CITES_LAW edges.
 */
export async function ingestKnowledgeNode(
  db: PrismaClient,
  input: KbIngestInput,
): Promise<KbIngestResult> {
  return db.$transaction(async tx => {
    const existingNodesRaw = await tx.kbNode.findMany({ include: { cluster: true } });
    const existingNodes = existingNodesRaw.map(toNodeRecord);
    const existingClusters = await tx.kbCluster.findMany();

    const tags = extractAutoTags(`${input.title} ${input.summary}`, input.tags ?? []);
    const matchResult = runKnowledgeGraphMatch(existingNodes, {
      title: input.title,
      summary: input.summary,
      tags,
      limit: 5,
    });

    // 1. Determine target cluster
    let targetCluster = input.preferredClusterSlug
      ? existingClusters.find(c => c.slug === input.preferredClusterSlug) ?? null
      : null;
    let createdCluster = false;

    if (!targetCluster && matchResult.topMatch && matchResult.topMatch.score >= KB_CLUSTER_ASSIGN_THRESHOLD) {
      targetCluster =
        existingClusters.find(c => c.slug === matchResult.topMatch?.clusterSlug) ?? null;
    }

    if (!targetCluster) {
      const baseSlug = slugifyCluster(tags[0] ?? input.title);
      const uniqueSlug = existingClusters.some(c => c.slug === baseSlug)
        ? `${baseSlug}_${Date.now().toString().slice(-4)}`
        : baseSlug;
      targetCluster = await tx.kbCluster.create({
        data: {
          slug: uniqueSlug,
          name: input.title.slice(0, 120),
          color: '#7C3AED',
          description: `Automatycznie utworzony klaster tematyczny (${tags.slice(0, 4).join(', ')})`,
        },
      });
      createdCluster = true;
    }

    const structuredJson: KbStructuredCaseJson = {
      case_id: input.nodeType === KbNodeType.CASE ? input.externalKey : null,
      year: input.year ?? new Date().getUTCFullYear(),
      tags,
      summary: input.summary.trim(),
      routed_to: input.routedTo ?? [],
      is_external_authority: Boolean(input.isExternalAuthority),
      external_authority: input.externalAuthority ?? null,
      outcome_type: input.outcomeType ?? (input.isExternalAuthority ? 'BRAK_DYSPONENTA' : 'UDZIELONO_ODPOWIEDZI'),
      legal_basis: input.legalBasis ?? [],
      template_file: input.templateFile ?? null,
      cluster: targetCluster.slug,
    };

    // 2. Upsert KbNode
    const upsertedRaw = await tx.kbNode.upsert({
      where: { externalKey: input.externalKey.trim() },
      create: {
        nodeType: input.nodeType,
        externalKey: input.externalKey.trim(),
        title: input.title.trim(),
        summary: input.summary.trim(),
        structuredJson: structuredJson as unknown as Prisma.InputJsonValue,
        tags,
        clusterUuid: targetCluster.uuid,
        sourceCaseUuid: input.sourceCaseUuid ?? null,
        createdByUuid: input.actorUuid ?? null,
      },
      update: {
        title: input.title.trim(),
        summary: input.summary.trim(),
        structuredJson: structuredJson as unknown as Prisma.InputJsonValue,
        tags,
        clusterUuid: targetCluster.uuid,
      },
      include: { cluster: true },
    });

    const createdEdges: KbEdgeRecord[] = [];
    const upsertEdge = async (
      targetNodeUuid: string,
      relationType: KbEdgeRelation,
      weight: number,
      reason: string,
    ) => {
      if (targetNodeUuid === upsertedRaw.uuid) return;
      const edge = await tx.kbEdge.upsert({
        where: {
          sourceNodeUuid_targetNodeUuid_relationType: {
            sourceNodeUuid: upsertedRaw.uuid,
            targetNodeUuid,
            relationType,
          },
        },
        create: {
          sourceNodeUuid: upsertedRaw.uuid,
          targetNodeUuid,
          relationType,
          weight,
          reason: reason.slice(0, 255),
        },
        update: {
          weight,
          reason: reason.slice(0, 255),
        },
      });
      createdEdges.push({
        uuid: edge.uuid,
        sourceNodeUuid: edge.sourceNodeUuid,
        targetNodeUuid: edge.targetNodeUuid,
        relationType: edge.relationType,
        weight: edge.weight,
        reason: edge.reason,
      });
    };

    // 3. Connect SIMILAR_CASE edges (top matches with score >= 0.55)
    for (const candidate of matchResult.matches) {
      if (candidate.score >= KB_SIMILAR_EDGE_THRESHOLD && candidate.nodeUuid !== upsertedRaw.uuid) {
        await upsertEdge(
          candidate.nodeUuid,
          KbEdgeRelation.SIMILAR_CASE,
          candidate.score,
          candidate.reason,
        );
      }
    }

    // 4. Connect ROUTED_TO_DEPT edges
    for (const deptName of input.routedTo ?? []) {
      const normalizedDept = normalizePolishText(deptName);
      const deptNode = existingNodes.find(
        n =>
          n.nodeType === KbNodeType.DEPARTMENT
          && (normalizePolishText(n.title).includes(normalizedDept)
            || normalizedDept.includes(normalizePolishText(n.title))),
      );
      if (deptNode) {
        await upsertEdge(
          deptNode.uuid,
          KbEdgeRelation.ROUTED_TO_DEPT,
          1.0,
          `Sprawa skierowana do: ${deptNode.title}`,
        );
      }
    }

    // 5. Connect REDIRECTED_TO_EXTERNAL edge
    if (input.isExternalAuthority && input.externalAuthority) {
      const normExt = normalizePolishText(input.externalAuthority);
      const extNode = existingNodes.find(
        n =>
          n.nodeType === KbNodeType.EXTERNAL_AUTHORITY
          && (normalizePolishText(n.title).includes(normExt)
            || normExt.includes(normalizePolishText(n.title))
            || n.tags.some(t => normExt.includes(normalizePolishText(t)))),
      );
      if (extNode) {
        await upsertEdge(
          extNode.uuid,
          KbEdgeRelation.REDIRECTED_TO_EXTERNAL,
          1.0,
          `Przekierowanie (Art. 4 ust. 3 UDIP): ${extNode.title}`,
        );
      }
    }

    // 6. Connect CITES_LAW edges
    for (const law of input.legalBasis ?? []) {
      const normLaw = normalizePolishText(law);
      const lawNode = existingNodes.find(
        n =>
          n.nodeType === KbNodeType.LEGAL_ACT
          && (normalizePolishText(n.title).includes(normLaw)
            || n.tags.some(t => normLaw.includes(normalizePolishText(t)))),
      );
      if (lawNode) {
        await upsertEdge(lawNode.uuid, KbEdgeRelation.CITES_LAW, 1.0, `Podstawa prawna: ${law}`);
      }
    }

    return {
      node: toNodeRecord(upsertedRaw),
      cluster: {
        uuid: targetCluster.uuid,
        slug: targetCluster.slug,
        name: targetCluster.name,
        color: targetCluster.color,
        description: targetCluster.description,
      },
      createdCluster,
      newEdges: createdEdges,
      topMatches: matchResult.matches,
    };
  });
}

const SEED_CLUSTERS = [
  {
    slug: 'edukacja_i_szkolnictwo',
    name: 'Edukacja i Szkolnictwo',
    color: '#2563EB',
    description: 'Szkoły podstawowe, dane SIO, liczba uczniów i uczniów cudzoziemców.',
  },
  {
    slug: 'zwierzeta_i_srodowisko',
    name: 'Zwierzęta i Środowisko',
    color: '#16A34A',
    description: 'Program opieki nad bezdomnymi zwierzętami, schronisko, odławianie, zieleń.',
  },
  {
    slug: 'inwestycje_i_astoria',
    name: 'Inwestycje i Obiekty Sportowe',
    color: '#EA580C',
    description: 'Kompleks Astoria, dokumentacja projektowa, umowy wykonawcze.',
  },
  {
    slug: 'gospodarka_i_alkohol',
    name: 'Gospodarka i Zezwolenia Alkoholowe',
    color: '#9333EA',
    description: 'Punkty sprzedaży alkoholu, gospodarka odpadami, rejestr działalności.',
  },
  {
    slug: 'zewnetrzne_brak_dysponenta',
    name: 'Podmioty Zewnętrzne (Art. 4 ust. 3 UDIP)',
    color: '#DC2626',
    description: 'Sprawy należące do ZUS, ZDMiKP, Wojewódzkiego Konserwatora Zabytków.',
  },
  {
    slug: 'podstawy_prawne',
    name: 'Podstawy Prawne i Zarządzenia',
    color: '#0F766E',
    description: 'Ustawa UDIP oraz Zarządzenie nr 535/2024 Prezydenta Miasta Bydgoszczy.',
  },
] as const;

const SEED_NODES: readonly {
  nodeType: KbNodeType;
  externalKey: string;
  title: string;
  summary: string;
  tags: string[];
  clusterSlug: string;
  structuredJson: KbStructuredCaseJson;
}[] = [
  // Departments
  {
    nodeType: KbNodeType.DEPARTMENT,
    externalKey: 'DEPT:WES',
    title: 'Wydział Edukacji i Sportu',
    summary: 'Prowadzi szkoły podstawowe i ponadpodstawowe, dane SIO, liczbę uczniów oraz uczniów cudzoziemców.',
    tags: ['edukacja', 'szkoły podstawowe', 'uczniowie', 'cudzoziemcy', 'obcokrajowcy', 'sio'],
    clusterSlug: 'edukacja_i_szkolnictwo',
    structuredJson: {
      tags: ['edukacja', 'szkoły podstawowe', 'uczniowie', 'cudzoziemcy'],
      summary: 'Wydział Edukacji i Sportu UM Bydgoszczy (wes@um.bydgoszcz.pl)',
      routed_to: ['Wydział Edukacji i Sportu'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'WYDZIAL_UMB',
      legal_basis: ['Zarządzenie nr 535/2024'],
      template_file: null,
      cluster: 'edukacja_i_szkolnictwo',
    },
  },
  {
    nodeType: KbNodeType.DEPARTMENT,
    externalKey: 'DEPT:WZGK',
    title: 'Wydział Zieleni i Gospodarki Komunalnej',
    summary: 'Opieka nad bezdomnymi zwierzętami, umowy na odławianie zwierząt, zieleń miejska.',
    tags: ['zieleń', 'bezdomne zwierzęta', 'odławianie', 'opieka nad zwierzętami', 'gospodarka komunalna'],
    clusterSlug: 'zwierzeta_i_srodowisko',
    structuredJson: {
      tags: ['zieleń', 'bezdomne zwierzęta', 'odławianie'],
      summary: 'Wydział Zieleni i Gospodarki Komunalnej UM Bydgoszczy (wzgk@um.bydgoszcz.pl)',
      routed_to: ['Wydział Zieleni i Gospodarki Komunalnej'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'WYDZIAL_UMB',
      legal_basis: ['Zarządzenie nr 535/2024'],
      template_file: null,
      cluster: 'zwierzeta_i_srodowisko',
    },
  },
  {
    nodeType: KbNodeType.DEPARTMENT,
    externalKey: 'DEPT:SCHRONISKO',
    title: 'Schronisko dla Zwierząt w Bydgoszczy',
    summary: 'Ewidencja przyjęć, adopcji, zabiegów weterynaryjnych oraz odławiania bezdomnych zwierząt.',
    tags: ['schronisko', 'bezdomne zwierzęta', 'adopcje', 'odławianie', 'psy', 'koty'],
    clusterSlug: 'zwierzeta_i_srodowisko',
    structuredJson: {
      tags: ['schronisko', 'bezdomne zwierzęta', 'odławianie'],
      summary: 'Schronisko dla Zwierząt w Bydgoszczy (azory@schronisko.org.pl)',
      routed_to: ['Schronisko dla Zwierząt w Bydgoszczy'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'JEDNOSTKA_UMB',
      legal_basis: ['Zarządzenie nr 535/2024'],
      template_file: null,
      cluster: 'zwierzeta_i_srodowisko',
    },
  },
  {
    nodeType: KbNodeType.DEPARTMENT,
    externalKey: 'DEPT:WIM',
    title: 'Wydział Inwestycji Miasta',
    summary: 'Dokumentacja inwestycyjna, projekty zagospodarowania terenu, basen Astoria, umowy wykonawcze.',
    tags: ['inwestycje', 'astoria', 'basen', 'projekt zagospodarowania', 'umowy'],
    clusterSlug: 'inwestycje_i_astoria',
    structuredJson: {
      tags: ['inwestycje', 'astoria', 'basen'],
      summary: 'Wydział Inwestycji Miasta UM Bydgoszczy (wim@um.bydgoszcz.pl)',
      routed_to: ['Wydział Inwestycji Miasta'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'WYDZIAL_UMB',
      legal_basis: ['Zarządzenie nr 535/2024'],
      template_file: null,
      cluster: 'inwestycje_i_astoria',
    },
  },
  {
    nodeType: KbNodeType.DEPARTMENT,
    externalKey: 'DEPT:WUK',
    title: 'Wydział Uprawnień Komunikacyjnych (Zezwolenia Alkoholowe)',
    summary: 'Rejestr punktów sprzedaży napojów alkoholowych, koncesje i zezwolenia alkoholowe.',
    tags: ['alkohol', 'punkty sprzedaży alkoholu', 'zezwolenia alkoholowe', 'koncesje'],
    clusterSlug: 'gospodarka_i_alkohol',
    structuredJson: {
      tags: ['alkohol', 'punkty sprzedaży alkoholu', 'koncesje'],
      summary: 'Wydział Uprawnień Komunikacyjnych UM Bydgoszczy (wuk@um.bydgoszcz.pl)',
      routed_to: ['Wydział Uprawnień Komunikacyjnych (Zezwolenia Alkoholowe)'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'WYDZIAL_UMB',
      legal_basis: ['Zarządzenie nr 535/2024'],
      template_file: null,
      cluster: 'gospodarka_i_alkohol',
    },
  },
  {
    nodeType: KbNodeType.DEPARTMENT,
    externalKey: 'DEPT:BZGOK',
    title: 'Biuro Zarządzania Gospodarką Odpadami Komunalnymi',
    summary: 'Deklaracje o opłatach za gospodarowanie odpadami komunalnymi i liczba mieszkańców wg ulic.',
    tags: ['odpady komunalne', 'śmieci', 'opłaty', 'liczba mieszkańców', 'deklaracje'],
    clusterSlug: 'gospodarka_i_alkohol',
    structuredJson: {
      tags: ['odpady komunalne', 'liczba mieszkańców', 'deklaracje'],
      summary: 'Biuro Zarządzania Gospodarką Odpadami Komunalnymi (odpady@um.bydgoszcz.pl)',
      routed_to: ['Biuro Zarządzania Gospodarką Odpadami Komunalnymi'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'WYDZIAL_UMB',
      legal_basis: ['Zarządzenie nr 535/2024'],
      template_file: null,
      cluster: 'gospodarka_i_alkohol',
    },
  },
  // External Authorities
  {
    nodeType: KbNodeType.EXTERNAL_AUTHORITY,
    externalKey: 'EXT:ZUS',
    title: 'Zakład Ubezpieczeń Społecznych (ZUS) — Oddział w Bydgoszczy',
    summary: 'Emerytury, renty, składki na ubezpieczenia społeczne — UM Bydgoszcz nie jest dysponentem danych.',
    tags: ['zus', 'emerytury', 'renty', 'składki', 'ubezpieczenia społeczne'],
    clusterSlug: 'zewnetrzne_brak_dysponenta',
    structuredJson: {
      tags: ['zus', 'emerytury', 'składki'],
      summary: 'ZUS Oddział w Bydgoszczy — zewnętrzny dysponent (Art. 4 ust. 3 UDIP).',
      routed_to: [],
      is_external_authority: true,
      external_authority: 'Zakład Ubezpieczeń Społecznych (ZUS) — Oddział w Bydgoszczy',
      outcome_type: 'BRAK_DYSPONENTA',
      legal_basis: ['Art. 4 ust. 3 UDIP'],
      template_file: null,
      cluster: 'zewnetrzne_brak_dysponenta',
    },
  },
  {
    nodeType: KbNodeType.EXTERNAL_AUTHORITY,
    externalKey: 'EXT:ZDMIKP',
    title: 'Zarząd Dróg Miejskich i Komunikacji Publicznej w Bydgoszczy (ZDMiKP)',
    summary: 'Drogi miejskie, komunikacja publiczna, umowy drogowe (np. 102/TT/2019), ul. Toruńska 174a.',
    tags: ['zdmikp', 'drogi', 'komunikacja publiczna', 'umowa 102/tt/2019', 'transport'],
    clusterSlug: 'zewnetrzne_brak_dysponenta',
    structuredJson: {
      tags: ['zdmikp', 'drogi', 'komunikacja publiczna'],
      summary: 'ZDMiKP w Bydgoszczy (zarzad@zdmikp.bydgoszcz.pl) — zewnętrzny dysponent (Art. 4 ust. 3 UDIP).',
      routed_to: [],
      is_external_authority: true,
      external_authority: 'Zarząd Dróg Miejskich i Komunikacji Publicznej w Bydgoszczy (ZDMiKP)',
      outcome_type: 'BRAK_DYSPONENTA',
      legal_basis: ['Art. 4 ust. 3 UDIP'],
      template_file: 'Odpowiedź - BKS.IV.1431.17.2026.anonymised.pdf',
      cluster: 'zewnetrzne_brak_dysponenta',
    },
  },
  {
    nodeType: KbNodeType.EXTERNAL_AUTHORITY,
    externalKey: 'EXT:WKZ',
    title: 'Kujawsko-Pomorski Wojewódzki Konserwator Zabytków — Delegatura w Bydgoszczy',
    summary: 'Ochrona zabytków, rzeźby miejskie i pomniki (ul. Jezuicka 2, bydgoszcz@torun.wkz.gov.pl).',
    tags: ['wkz', 'konserwator zabytków', 'zabytki', 'rzeźba', 'ludmiła stehnova'],
    clusterSlug: 'zewnetrzne_brak_dysponenta',
    structuredJson: {
      tags: ['wkz', 'konserwator zabytków', 'rzeźba'],
      summary: 'Kujawsko-Pomorski WKZ — zewnętrzny dysponent (Art. 4 ust. 3 UDIP).',
      routed_to: [],
      is_external_authority: true,
      external_authority: 'Kujawsko-Pomorski Wojewódzki Konserwator Zabytków',
      outcome_type: 'BRAK_DYSPONENTA',
      legal_basis: ['Art. 4 ust. 3 UDIP'],
      template_file: 'Odpowiedź - BKS.IV.1431.15.2026.anonymised.pdf',
      cluster: 'zewnetrzne_brak_dysponenta',
    },
  },
  // Legal Acts
  {
    nodeType: KbNodeType.LEGAL_ACT,
    externalKey: 'LAW:ZARZADZENIE_535_2024',
    title: 'Zarządzenie nr 535/2024 Prezydenta Miasta Bydgoszczy',
    summary: 'Zasady udostępniania informacji publicznej w Urzędzie Miasta Bydgoszczy, rola BKS jako AIP oraz § 11 ust. 8 o anonimizacji.',
    tags: ['zarządzenie 535/2024', 'aip', 'bks', 'anonimizacja', 'procedura'],
    clusterSlug: 'podstawy_prawne',
    structuredJson: {
      tags: ['zarządzenie 535/2024', 'aip', 'anonimizacja'],
      summary: 'Zarządzenie nr 535/2024 Prezydenta Miasta Bydgoszczy w sprawie UDIP.',
      routed_to: [],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'AKT_PRAWNY',
      legal_basis: ['Zarządzenie nr 535/2024'],
      template_file: null,
      cluster: 'podstawy_prawne',
    },
  },
  {
    nodeType: KbNodeType.LEGAL_ACT,
    externalKey: 'LAW:UDIP_ART4_UST3',
    title: 'Art. 4 ust. 3 Ustawy o dostępie do informacji publicznej',
    summary: 'Obowiązane do udostępnienia informacji publicznej są wyłącznie podmioty publiczne będące w posiadaniu tych informacji (brak dysponenta).',
    tags: ['art. 4 ust. 3', 'udip', 'brak dysponenta', 'przekierowanie'],
    clusterSlug: 'podstawy_prawne',
    structuredJson: {
      tags: ['art. 4 ust. 3', 'udip', 'brak dysponenta'],
      summary: 'Art. 4 ust. 3 UDIP — podstawa odmowy/przekierowania gdy UM nie posiada danych.',
      routed_to: [],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'AKT_PRAWNY',
      legal_basis: ['Art. 4 ust. 3 UDIP'],
      template_file: null,
      cluster: 'podstawy_prawne',
    },
  },
  {
    nodeType: KbNodeType.LEGAL_ACT,
    externalKey: 'LAW:UDIP_ART13',
    title: 'Art. 13 ust. 1 i 2 Ustawy o dostępie do informacji publicznej',
    summary: 'Termin 14 dni na udostępnienie informacji publicznej oraz możliwość przedłużenia do 2 miesięcy (kwerenda).',
    tags: ['art. 13 ust. 1', 'art. 13 ust. 2', 'termin 14 dni', 'kwerenda', 'przedłużenie'],
    clusterSlug: 'podstawy_prawne',
    structuredJson: {
      tags: ['art. 13', 'termin 14 dni', 'kwerenda'],
      summary: 'Art. 13 UDIP — ustawowy termin 14 dni i przedłużenie kwerendy do 2 miesięcy.',
      routed_to: [],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'AKT_PRAWNY',
      legal_basis: ['Art. 13 ust. 1 UDIP', 'Art. 13 ust. 2 UDIP'],
      template_file: null,
      cluster: 'podstawy_prawne',
    },
  },
  // 5 Archival Completed Cases (2025 / early 2026)
  {
    nodeType: KbNodeType.CASE,
    externalKey: 'BKS.IV.1431.293.2025',
    title: 'BKS.IV.1431.293.2025 — Opieka i odławianie bezdomnych zwierząt',
    summary: 'Opieka nad bezdomnymi zwierzętami, finansowanie schroniska i wyłapywanie bezdomnych zwierząt w Bydgoszczy.',
    tags: ['bezdomne zwierzęta', 'opieka nad zwierzętami', 'odławianie', 'wyłapywanie', 'schronisko'],
    clusterSlug: 'zwierzeta_i_srodowisko',
    structuredJson: {
      case_id: 'BKS.IV.1431.293.2025',
      year: 2025,
      tags: ['bezdomne zwierzęta', 'opieka nad zwierzętami', 'odławianie', 'wyłapywanie', 'schronisko'],
      summary: 'Opieka nad bezdomnymi zwierzętami, finansowanie schroniska i odławianie zwierząt w Bydgoszczy.',
      routed_to: ['Wydział Zieleni i Gospodarki Komunalnej', 'Schronisko dla Zwierząt w Bydgoszczy'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'UDZIELONO_ODPOWIEDZI',
      legal_basis: ['Art. 13 ust. 1 UDIP'],
      template_file: 'Odpowiedź - BKS.IV.1431.293.2025.anonymised.pdf',
      cluster: 'zwierzeta_i_srodowisko',
    },
  },
  {
    nodeType: KbNodeType.CASE,
    externalKey: 'BKS.IV.1431.307.2025',
    title: 'BKS.IV.1431.307.2025 — Liczba uczniów i obcokrajowców w szkołach podstawowych',
    summary: 'Zestawienie liczby uczniów oraz uczniów obcokrajowców (cudzoziemców) w poszczególnych szkołach podstawowych w Bydgoszczy.',
    tags: ['szkoły podstawowe', 'liczba uczniów', 'obcokrajowcy', 'cudzoziemcy', 'edukacja', 'zestawienie'],
    clusterSlug: 'edukacja_i_szkolnictwo',
    structuredJson: {
      case_id: 'BKS.IV.1431.307.2025',
      year: 2025,
      tags: ['szkoły podstawowe', 'liczba uczniów', 'obcokrajowcy', 'cudzoziemcy', 'edukacja', 'zestawienie'],
      summary: 'Zestawienie liczby uczniów oraz uczniów cudzoziemców w szkołach podstawowych w Bydgoszczy.',
      routed_to: ['Wydział Edukacji i Sportu'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'UDZIELONO_ODPOWIEDZI',
      legal_basis: ['Art. 13 ust. 1 UDIP'],
      template_file: 'Odpowiedź - BKS.IV.1431.307.2025.anonymised.pdf',
      cluster: 'edukacja_i_szkolnictwo',
    },
  },
  {
    nodeType: KbNodeType.CASE,
    externalKey: 'BKS.IV.1431.15.2026',
    title: 'BKS.IV.1431.15.2026 — Rzeźba Ludmiły Stehnovej z Ronda Grunwaldzkiego',
    summary: 'Zapytanie o aktualny stan i lokalizację przechowywania rzeźby Ludmiły Stehnovej usuniętej z Ronda Grunwaldzkiego — brak dysponenta (WKZ).',
    tags: ['rzeźba', 'ludmiła stehnova', 'rondo grunwaldzkie', 'konserwator zabytków', 'wkz'],
    clusterSlug: 'zewnetrzne_brak_dysponenta',
    structuredJson: {
      case_id: 'BKS.IV.1431.15.2026',
      year: 2026,
      tags: ['rzeźba', 'ludmiła stehnova', 'rondo grunwaldzkie', 'wkz'],
      summary: 'Zapytanie o rzeźbę Ludmiły Stehnovej — przekierowanie do Kujawsko-Pomorskiego WKZ (Art. 4 ust. 3 UDIP).',
      routed_to: [],
      is_external_authority: true,
      external_authority: 'Kujawsko-Pomorski Wojewódzki Konserwator Zabytków — Delegatura w Bydgoszczy',
      outcome_type: 'BRAK_DYSPONENTA',
      legal_basis: ['Art. 4 ust. 3 UDIP'],
      template_file: 'Odpowiedź - BKS.IV.1431.15.2026.anonymised.pdf',
      cluster: 'zewnetrzne_brak_dysponenta',
    },
  },
  {
    nodeType: KbNodeType.CASE,
    externalKey: 'BKS.IV.1431.16.2026',
    title: 'BKS.IV.1431.16.2026 — Punkty sprzedaży alkoholu od objęcia funkcji przez R. Bruskiego',
    summary: 'Liczba punktów sprzedaży alkoholu powstałych w Bydgoszczy od objęcia funkcji Prezydenta przez Rafała Bruskiego (wniosek odręczny na kartce w kratkę).',
    tags: ['punkty sprzedaży alkoholu', 'alkohol', 'rafał bruski', 'zezwolenia alkoholowe', 'pismo odręczne'],
    clusterSlug: 'gospodarka_i_alkohol',
    structuredJson: {
      case_id: 'BKS.IV.1431.16.2026',
      year: 2026,
      tags: ['punkty sprzedaży alkoholu', 'alkohol', 'zezwolenia alkoholowe'],
      summary: 'Liczba punktów sprzedaży alkoholu od 2010 r. do 2026 r. w Bydgoszczy.',
      routed_to: ['Wydział Uprawnień Komunikacyjnych (Zezwolenia Alkoholowe)'],
      is_external_authority: false,
      external_authority: null,
      outcome_type: 'UDZIELONO_ODPOWIEDZI',
      legal_basis: ['Art. 13 ust. 1 UDIP'],
      template_file: 'Odpowiedź - BKS.IV.1431.16.2026.anonymised.pdf',
      cluster: 'gospodarka_i_alkohol',
    },
  },
  {
    nodeType: KbNodeType.CASE,
    externalKey: 'BKS.IV.1431.17.2026',
    title: 'BKS.IV.1431.17.2026 — Realizacja umowy nr 102/TT/2019 (ZDMiKP)',
    summary: 'Wniosek o udostępnienie informacji dot. realizacji umowy nr 102/TT/2019 z Jakotako sp. z o.o. — brak dysponenta, właściwy ZDMiKP.',
    tags: ['umowa 102/tt/2019', 'jakotako', 'zdmikp', 'drogi', 'brak dysponenta'],
    clusterSlug: 'zewnetrzne_brak_dysponenta',
    structuredJson: {
      case_id: 'BKS.IV.1431.17.2026',
      year: 2026,
      tags: ['umowa 102/tt/2019', 'zdmikp', 'drogi', 'brak dysponenta'],
      summary: 'Realizacja umowy nr 102/TT/2019 — przekierowanie do ZDMiKP (Art. 4 ust. 3 UDIP).',
      routed_to: [],
      is_external_authority: true,
      external_authority: 'Zarząd Dróg Miejskich i Komunikacji Publicznej w Bydgoszczy (ZDMiKP)',
      outcome_type: 'BRAK_DYSPONENTA',
      legal_basis: ['Art. 4 ust. 3 UDIP'],
      template_file: 'Odpowiedź - BKS.IV.1431.17.2026.anonymised.pdf',
      cluster: 'zewnetrzne_brak_dysponenta',
    },
  },
];

const SEED_EDGES: readonly {
  sourceKey: string;
  targetKey: string;
  relationType: KbEdgeRelation;
  weight: number;
  reason: string;
}[] = [
  {
    sourceKey: 'BKS.IV.1431.293.2025',
    targetKey: 'DEPT:WZGK',
    relationType: KbEdgeRelation.ROUTED_TO_DEPT,
    weight: 1.0,
    reason: 'Sprawa wielo-wydziałowa: Wydział Zieleni i Gospodarki Komunalnej',
  },
  {
    sourceKey: 'BKS.IV.1431.293.2025',
    targetKey: 'DEPT:SCHRONISKO',
    relationType: KbEdgeRelation.ROUTED_TO_DEPT,
    weight: 1.0,
    reason: 'Sprawa wielo-wydziałowa: Schronisko dla Zwierząt w Bydgoszczy',
  },
  {
    sourceKey: 'BKS.IV.1431.307.2025',
    targetKey: 'DEPT:WES',
    relationType: KbEdgeRelation.ROUTED_TO_DEPT,
    weight: 1.0,
    reason: 'Zweryfikowany wydział: Wydział Edukacji i Sportu',
  },
  {
    sourceKey: 'BKS.IV.1431.15.2026',
    targetKey: 'EXT:WKZ',
    relationType: KbEdgeRelation.REDIRECTED_TO_EXTERNAL,
    weight: 1.0,
    reason: 'Brak dysponenta — przekierowanie do Kujawsko-Pomorskiego WKZ',
  },
  {
    sourceKey: 'BKS.IV.1431.15.2026',
    targetKey: 'LAW:UDIP_ART4_UST3',
    relationType: KbEdgeRelation.CITES_LAW,
    weight: 1.0,
    reason: 'Podstawa prawna: Art. 4 ust. 3 UDIP',
  },
  {
    sourceKey: 'BKS.IV.1431.16.2026',
    targetKey: 'DEPT:WUK',
    relationType: KbEdgeRelation.ROUTED_TO_DEPT,
    weight: 1.0,
    reason: 'Zweryfikowany wydział: Zezwolenia Alkoholowe',
  },
  {
    sourceKey: 'BKS.IV.1431.17.2026',
    targetKey: 'EXT:ZDMIKP',
    relationType: KbEdgeRelation.REDIRECTED_TO_EXTERNAL,
    weight: 1.0,
    reason: 'Brak dysponenta — przekierowanie do ZDMiKP',
  },
  {
    sourceKey: 'BKS.IV.1431.17.2026',
    targetKey: 'LAW:UDIP_ART4_UST3',
    relationType: KbEdgeRelation.CITES_LAW,
    weight: 1.0,
    reason: 'Podstawa prawna: Art. 4 ust. 3 UDIP',
  },
];

/** Build in-memory seed KbNodeRecords for deterministic unit testing without PostgreSQL. */
export function buildBydgoszczSeedKnowledgeNodes(): KbNodeRecord[] {
  const clusterMap = new Map<string, (typeof SEED_CLUSTERS)[number]>(
    SEED_CLUSTERS.map(c => [c.slug, c]),
  );
  const now = new Date('2026-11-21T00:00:00.000Z');
  return SEED_NODES.map((node, index) => {
    const cluster = clusterMap.get(node.clusterSlug)!;
    return {
      uuid: `00000000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
      nodeType: node.nodeType,
      externalKey: node.externalKey,
      title: node.title,
      summary: node.summary,
      structuredJson: node.structuredJson,
      tags: node.tags,
      clusterUuid: `00000000-0000-7000-9000-${String(index + 1).padStart(12, '0')}`,
      clusterSlug: cluster.slug,
      clusterName: cluster.name,
      clusterColor: cluster.color,
      sourceCaseUuid: null,
      createdAt: now,
    };
  });
}

/** Idempotently seed Baza Wiedzy (6 clusters, departments, external authorities, legal acts, 5 archival cases + edges). */
export async function seedKnowledgeGraph(
  tx: Prisma.TransactionClient | PrismaClient,
  actorUuid?: string | null,
): Promise<number> {
  const clusterIdBySlug = new Map<string, string>();
  for (const cluster of SEED_CLUSTERS) {
    const row = await tx.kbCluster.upsert({
      where: { slug: cluster.slug },
      create: {
        slug: cluster.slug,
        name: cluster.name,
        color: cluster.color,
        description: cluster.description,
      },
      update: {},
      select: { uuid: true, slug: true },
    });
    clusterIdBySlug.set(row.slug, row.uuid);
  }

  const existingNodes = await tx.kbNode.findMany({
    where: { externalKey: { in: SEED_NODES.map(n => n.externalKey) } },
    select: { uuid: true, externalKey: true },
  });
  const nodeIdByKey = new Map(existingNodes.map(n => [n.externalKey, n.uuid]));

  // Link archival CASE nodes to seeded UdipCalendarCase rows if present
  const udipCases = await tx.udipCalendarCase.findMany({
    where: { caseNumber: { in: SEED_NODES.filter(n => n.nodeType === KbNodeType.CASE).map(n => n.externalKey) } },
    select: { uuid: true, caseNumber: true },
  });
  const udipCaseIdByNumber = new Map(udipCases.map(c => [c.caseNumber, c.uuid]));

  let createdNodes = 0;
  for (const node of SEED_NODES) {
    if (nodeIdByKey.has(node.externalKey)) continue;
    const clusterUuid = clusterIdBySlug.get(node.clusterSlug);
    if (!clusterUuid) continue;
    const created = await tx.kbNode.create({
      data: {
        nodeType: node.nodeType,
        externalKey: node.externalKey,
        title: node.title,
        summary: node.summary,
        structuredJson: node.structuredJson as unknown as Prisma.InputJsonValue,
        tags: node.tags,
        clusterUuid,
        sourceCaseUuid: udipCaseIdByNumber.get(node.externalKey) ?? null,
        createdByUuid: actorUuid ?? null,
      },
      select: { uuid: true, externalKey: true },
    });
    nodeIdByKey.set(created.externalKey, created.uuid);
    createdNodes++;
  }

  for (const edge of SEED_EDGES) {
    const sourceNodeUuid = nodeIdByKey.get(edge.sourceKey);
    const targetNodeUuid = nodeIdByKey.get(edge.targetKey);
    if (!sourceNodeUuid || !targetNodeUuid) continue;
    await tx.kbEdge.upsert({
      where: {
        sourceNodeUuid_targetNodeUuid_relationType: {
          sourceNodeUuid,
          targetNodeUuid,
          relationType: edge.relationType,
        },
      },
      create: {
        sourceNodeUuid,
        targetNodeUuid,
        relationType: edge.relationType,
        weight: edge.weight,
        reason: edge.reason,
      },
      update: {},
    });
  }

  return createdNodes;
}
