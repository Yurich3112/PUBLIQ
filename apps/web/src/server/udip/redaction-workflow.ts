import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@modulon-poc/database";
import { udipRedactionRangesSchema, type UdipRedactionRange, type UdipRedactionState } from "../../schemas/udip.ts";
import { getDatabase } from "../database.ts";
import type { UdipActor } from "./access.ts";
import { applyUdipRedactions, suggestUdipRedactions } from "./redaction.ts";
import { lockUdipCase } from "./scope.ts";
import { detectUdipPii } from "./worker.ts";

type Target = { kind: "intake"; documentUuid: string } | { kind: "draft" };
const selectionFields = {
  uuid: true, version: true, sourceRevision: true, ranges: true, sanitizedText: true, createdByUuid: true, approvedAt: true,
} as const;
const newestSelection = { take: 1, orderBy: { version: "desc" }, select: selectionFields } as const;
type Selection = Prisma.UdipRedactionRevisionGetPayload<{ select: typeof selectionFields }>;
type Snapshot = {
  target: Target;
  uuid: string;
  text: string;
  sourceRevision: number | null;
  authorUuid: string | null;
  latest: Selection | undefined;
};

async function readSnapshot(tx: Prisma.TransactionClient, caseUuid: string, target: Target) {
  if (target.kind === "intake") {
    const row = await tx.udipDocument.findFirst({ where: { uuid: target.documentUuid, caseUuid }, select: {
      uuid: true, extractedText: true, textRevision: true, status: true, redactions: newestSelection,
    } });
    if (!row) return { status: "missing" } as const;
    if (row.status !== "ready" || row.extractedText === null) return { status: "conflict" } as const;
    const snapshot: Snapshot = { target, uuid: row.uuid, text: row.extractedText, sourceRevision: row.textRevision,
      authorUuid: null, latest: row.redactions[0] };
    return { status: "ok" as const, snapshot };
  }
  const row = await tx.udipDraftVersion.findFirst({ where: { caseUuid }, orderBy: { version: "desc" }, select: {
    uuid: true, text: true, createdByUuid: true, redactions: newestSelection,
  } });
  if (!row) return { status: "missing" } as const;
  const snapshot: Snapshot = { target, uuid: row.uuid, text: row.text, sourceRevision: null,
    authorUuid: row.createdByUuid, latest: row.redactions[0] };
  return { status: "ok" as const, snapshot };
}

function currentSelection(snapshot: Snapshot) {
  return snapshot.latest?.sourceRevision === snapshot.sourceRevision ? snapshot.latest : undefined;
}

function snapshotRevision(snapshot: Snapshot) {
  return createHash("sha256").update(JSON.stringify([
    snapshot.target.kind, snapshot.uuid, snapshot.sourceRevision, currentSelection(snapshot)?.uuid, snapshot.text,
  ])).digest("hex");
}

function redactionState(snapshot: Snapshot): UdipRedactionState {
  const selection = currentSelection(snapshot);
  return {
    revision: snapshotRevision(snapshot), text: snapshot.text, suggestions: suggestUdipRedactions(snapshot.text),
    ranges: selection ? udipRedactionRangesSchema.parse(selection.ranges) : null,
    sanitizedText: selection?.sanitizedText ?? null, approvedAt: selection?.approvedAt?.toISOString() ?? null,
  };
}

async function withRedactionCase<T>(actor: UdipActor, caseUuid: string,
  action: (tx: Prisma.TransactionClient, signature: string) => Promise<T>) {
  return getDatabase().$transaction(async tx => {
    const record = await lockUdipCase(tx, actor, caseUuid);
    return record ? action(tx, record.signature) : { status: "missing" } as const;
  });
}

export async function readUdipRedaction(actor: UdipActor, caseUuid: string, target: Target) {
  const loaded = await withRedactionCase(actor, caseUuid, async tx => {
    const loaded = await readSnapshot(tx, caseUuid, target);
    return loaded.status === "ok" ? { status: "ok" as const, state: redactionState(loaded.snapshot) } : loaded;
  });
  if (loaded.status !== "ok") return loaded;
  const { state } = loaded;
  const suggestions = await detectUdipPii(state.text);
  state.suggestions.push(...suggestions.filter(({ range }) => applyUdipRedactions(state.text, [range]) !== null));
  state.suggestions.sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
  return loaded;
}

export function readConfirmedUdipSources(actor: UdipActor, caseUuid: string, kind: "request" | "departmentReply",
  sources: readonly { documentId: string; revision: string }[]) {
  return withRedactionCase(actor, caseUuid, async tx => {
    const rows = await tx.udipDocument.findMany({ where: { caseUuid, kind, uuid: { in: sources.map(source => source.documentId) } },
      select: { uuid: true, extractedText: true, status: true, textRevision: true, redactions: newestSelection } });
    const result = new Map<string, string>();
    for (const source of sources) {
      const row = rows.find(item => item.uuid === source.documentId);
      if (!row) return { status: "missing" } as const;
      if (row.status !== "ready" || row.extractedText === null) return { status: "conflict" } as const;
      const snapshot: Snapshot = {
        target: { kind: "intake", documentUuid: row.uuid }, uuid: row.uuid, text: row.extractedText,
        sourceRevision: row.textRevision, authorUuid: null, latest: row.redactions[0],
      };
      const selection = currentSelection(snapshot);
      if (!selection || snapshotRevision(snapshot) !== source.revision) return { status: "conflict" } as const;
      result.set(row.uuid, selection.sanitizedText);
    }
    return { status: "ok" as const, sources: result };
  });
}

export function saveUdipRedaction(actor: UdipActor, caseUuid: string, target: Target, input: { revision: string; ranges: UdipRedactionRange[] }) {
  return withRedactionCase(actor, caseUuid, async tx => {
    const loaded = await readSnapshot(tx, caseUuid, target);
    if (loaded.status !== "ok") return loaded;
    const { snapshot } = loaded;
    if (snapshotRevision(snapshot) !== input.revision) return { status: "conflict" } as const;
    const result = applyUdipRedactions(snapshot.text, input.ranges);
    if (!result) return { status: "invalid" } as const;
    const previous = currentSelection(snapshot);
    if (previous && JSON.stringify(previous.ranges) === JSON.stringify(result.ranges)) {
      return { status: "ok" as const, state: redactionState(snapshot) };
    }
    const latest = await tx.udipRedactionRevision.create({ data: {
      ...(target.kind === "intake" ? { documentUuid: snapshot.uuid, sourceRevision: snapshot.sourceRevision } : { draftUuid: snapshot.uuid }),
      createdByUuid: actor.id, version: (snapshot.latest?.version ?? 0) + 1, ranges: result.ranges, sanitizedText: result.text,
    }, select: selectionFields });
    return { status: "ok" as const, state: redactionState({ ...snapshot, latest }) };
  });
}

export async function approveUdipDraft(actor: UdipActor, caseUuid: string, revision: string) {
  if (!actor.isAdmin) return { status: "denied" } as const;
  return withRedactionCase(actor, caseUuid, async tx => {
    const loaded = await readSnapshot(tx, caseUuid, { kind: "draft" });
    if (loaded.status !== "ok") return loaded;
    const { snapshot } = loaded;
    const selection = currentSelection(snapshot);
    if (!selection || snapshotRevision(snapshot) !== revision) return { status: "conflict" } as const;
    if (actor.id === snapshot.authorUuid || actor.id === selection.createdByUuid) return { status: "denied" } as const;
    const latest = selection.approvedAt ? selection : await tx.udipRedactionRevision.update({
      where: { uuid: selection.uuid }, data: { approvedAt: new Date(), approvedByUuid: actor.id }, select: selectionFields,
    });
    return { status: "ok" as const, state: redactionState({ ...snapshot, latest }) };
  });
}

function withApprovedDraft<T>(actor: UdipActor, caseUuid: string, revision: string,
  action: (tx: Prisma.TransactionClient, signature: string, snapshot: Snapshot, selection: Selection) => Promise<T>) {
  return withRedactionCase(actor, caseUuid, async (tx, signature) => {
    const loaded = await readSnapshot(tx, caseUuid, { kind: "draft" });
    if (loaded.status !== "ok") return loaded;
    const selection = currentSelection(loaded.snapshot);
    if (!selection?.approvedAt || snapshotRevision(loaded.snapshot) !== revision) return { status: "conflict" } as const;
    return action(tx, signature, loaded.snapshot, selection);
  });
}

export function exportUdipDraft(actor: UdipActor, caseUuid: string, revision: string) {
  return withApprovedDraft(actor, caseUuid, revision, async (_tx, signature, snapshot, selection) => {
    const result = applyUdipRedactions(snapshot.text, udipRedactionRangesSchema.parse(selection.ranges));
    if (!result) return { status: "conflict" } as const;
    return { status: "ok" as const, text: result.text, fileName: `${signature}.txt` };
  });
}

export function recordUdipDispatch(actor: UdipActor, caseUuid: string, input: { revision: string; sentDate: string }) {
  return withApprovedDraft(actor, caseUuid, input.revision, async (tx, _signature, _snapshot, selection) => {
    const sentDate = new Date(input.sentDate);
    const previous = await tx.udipCase.findUniqueOrThrow({ where: { uuid: caseUuid }, select: { sentRedactionUuid: true, sentDate: true } });
    if (previous.sentRedactionUuid === selection.uuid) {
      if (previous.sentDate?.getTime() !== sentDate.getTime()) return { status: "conflict" } as const;
    } else {
      await tx.udipCase.update({ where: { uuid: caseUuid }, data: {
        status: "E", sentDate, sentByUuid: actor.id, sentRedactionUuid: selection.uuid,
      } });
    }
    return { status: "ok" as const, sentDate: input.sentDate, processStatus: "E" as const };
  });
}
