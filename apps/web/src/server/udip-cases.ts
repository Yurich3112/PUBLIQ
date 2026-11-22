import "server-only";
import {
  createUdipCase,
  getUdipCase,
  listUdipCases,
  updateUdipCase,
  upsertUdipDepartmentReply,
  type UdipCaseListResult,
  type UdipCaseRecord,
} from "@modulon-poc/database";
import {
  createUdipCaseSchema,
  udipCaseQuerySchema,
  updateUdipCaseSchema,
  upsertUdipDepartmentReplySchema,
  type CreateUdipCasePayload,
  type UdipCaseQuery,
  type UpdateUdipCasePayload,
  type UpsertUdipDepartmentReplyPayload,
} from "../schemas/udip-case.ts";
import { getDatabase } from "./database.ts";

export async function loadUdipCases(input: UdipCaseQuery = {}): Promise<UdipCaseListResult> {
  const query = udipCaseQuerySchema.parse(input);
  return listUdipCases(getDatabase(), query);
}

export async function loadUdipCaseById(identifier: string): Promise<UdipCaseRecord | null> {
  if (!identifier.trim()) return null;
  return getUdipCase(getDatabase(), identifier.trim());
}

export async function createNewUdipCase(
  input: CreateUdipCasePayload,
  actorUuid?: string | null,
): Promise<UdipCaseRecord> {
  const parsed = createUdipCaseSchema.parse(input);
  return createUdipCase(getDatabase(), {
    ...parsed,
    actorUuid: actorUuid ?? null,
  });
}

export async function patchUdipCase(
  caseUuid: string,
  input: UpdateUdipCasePayload,
  actorUuid?: string | null,
): Promise<UdipCaseRecord | null> {
  const parsed = updateUdipCaseSchema.parse(input);
  return updateUdipCase(getDatabase(), caseUuid, {
    ...parsed,
    actorUuid: actorUuid ?? null,
  });
}

export async function attachUdipDepartmentReply(
  caseUuid: string,
  input: UpsertUdipDepartmentReplyPayload,
  actorUuid?: string | null,
): Promise<UdipCaseRecord | null> {
  const parsed = upsertUdipDepartmentReplySchema.parse(input);
  return upsertUdipDepartmentReply(getDatabase(), caseUuid, {
    ...parsed,
    actorUuid: actorUuid ?? null,
  });
}

export async function deleteUdipCaseById(caseUuid: string): Promise<boolean> {
  if (!caseUuid.trim()) return false;
  const result = await getDatabase().udipCalendarCase.deleteMany({
    where: { uuid: caseUuid.trim() },
  });
  return result.count > 0;
}
