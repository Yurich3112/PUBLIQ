import "server-only";
import {
  exportInstitutionRegistryForLlm,
  getKnowledgeGraphSnapshot,
  ingestKnowledgeNode,
  listResponseTemplates,
  matchKnowledgeGraph,
  type KbGraphSnapshot,
  type KbIngestResult,
  type KbMatchResult,
  type LlmInstitutionJsonEntry,
  type ResponseTemplateRecord,
} from "@modulon-poc/database";
import {
  kbIngestRequestSchema,
  kbMatchRequestSchema,
  type KbIngestRequestPayload,
  type KbMatchRequestPayload,
} from "../schemas/knowledge-graph.ts";
import { getDatabase } from "./database.ts";

export async function matchAgainstKnowledgeGraph(
  input: KbMatchRequestPayload,
): Promise<KbMatchResult> {
  const parsed = kbMatchRequestSchema.parse(input);
  return matchKnowledgeGraph(getDatabase(), parsed);
}

export async function loadAdminKnowledgeGraph(): Promise<KbGraphSnapshot> {
  return getKnowledgeGraphSnapshot(getDatabase());
}

export async function loadInstitutionsForLlm(): Promise<LlmInstitutionJsonEntry[]> {
  return exportInstitutionRegistryForLlm(getDatabase());
}

export async function loadResponseTemplates(): Promise<ResponseTemplateRecord[]> {
  return listResponseTemplates(getDatabase());
}

export async function ingestAdminKnowledgeNode(
  input: KbIngestRequestPayload,
  actorUuid?: string | null,
): Promise<KbIngestResult> {
  const parsed = kbIngestRequestSchema.parse(input);
  return ingestKnowledgeNode(getDatabase(), {
    ...parsed,
    actorUuid: actorUuid ?? null,
  });
}
