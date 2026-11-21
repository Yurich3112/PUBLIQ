import "server-only";
import type { z } from "zod";
import { udipStructuredSummarySchema, udipUnitSchema, type udipConfirmRouteSchema } from "../../schemas/udip.ts";
import { getDatabase } from "../database.ts";
import type { UdipActor } from "./access.ts";
import { caseScope, lockUdipCase } from "./scope.ts";

const routeFields = { uuid: true, unit: true, draft: true, sentDate: true, questionUuid: true, summaryVersion: true } as const;

function routeSummary({ uuid: id, unit, sentDate, questionUuid: questionId, ...route }: {
  uuid: string; unit: unknown; draft: string | null; sentDate: Date | null; questionUuid: string; summaryVersion: number;
}) {
  return { ...route, id, questionId, unit: udipUnitSchema.parse(unit), sentDate: sentDate?.toISOString().slice(0, 10) ?? null };
}

export async function listUdipRouting(actor: UdipActor, caseUuid: string) {
  const row = await getDatabase().udipCase.findFirst({ where: { ...caseScope(actor), uuid: caseUuid }, select: {
    manualSummary: { select: { version: true } }, routes: { orderBy: [{ summaryVersion: "desc" }, { uuid: "asc" }], select: routeFields },
  } });
  if (!row) return null;
  const currentVersion = row.manualSummary?.version ?? 0;
  return { summaryVersion: currentVersion, routes: row.routes.filter(route => route.summaryVersion === currentVersion || route.sentDate)
    .map(routeSummary) };
}

export function confirmUdipRoute(actor: UdipActor, caseUuid: string, input: z.infer<typeof udipConfirmRouteSchema>) {
  return getDatabase().$transaction(async tx => {
    const record = await lockUdipCase(tx, actor, caseUuid);
    if (!record) return { status: "missing" } as const;
    const snapshot = await tx.udipCaseManualSummary.findUnique({ where: { caseUuid }, select: { version: true, data: true } });
    if (!snapshot || snapshot.version !== input.summaryVersion) return { status: "conflict" as const, currentVersion: snapshot?.version ?? 0 };
    const summary = udipStructuredSummarySchema.parse(snapshot.data);
    const question = summary.questions.find(item => item.id === input.questionId);
    if (!question) return { status: "invalid" } as const;
    const key = { caseUuid, summaryVersion: input.summaryVersion, questionUuid: input.questionId };
    const where = { caseUuid_summaryVersion_questionUuid: key };
    const existing = await tx.udipQuestionRoute.findUnique({ where, select: routeFields });
    if (existing?.sentDate) {
      const route = routeSummary(existing);
      if (JSON.stringify(route.unit) === JSON.stringify(input.unit)) return { status: "ok" as const, route };
      return { status: "conflict" } as const;
    }

    if (input.unit.kind === "department") {
      await tx.udipDepartmentAssignment.upsert({ where: { caseUuid_departmentCode: { caseUuid, departmentCode: input.unit.departmentCode } },
        create: { caseUuid, departmentCode: input.unit.departmentCode, departmentName: input.unit.departmentName }, update: {} });
    }
    const period = question.period ?? summary.period;
    const draft = input.unit.kind === "external" ? [
      `Do: ${input.unit.departmentName}${input.unit.email ? ` <${input.unit.email}>` : ""}`,
      `Temat: Wniosek o udostępnienie informacji publicznej (${record.signature})`, "", "Szanowni Państwo,", "",
      "Prosimy o rozpatrzenie pytania z wniosku:", question.text,
      ...(period ? [`Okres: ${period.from} – ${period.to}`] : []), "", "Z poważaniem,", "[podpis urzędnika]",
    ].join("\n") : null;
    const data = { unit: input.unit, draft, confirmedByUuid: actor.id };
    const route = await tx.udipQuestionRoute.upsert({ where, create: { ...key, ...data }, update: data, select: routeFields });
    return { status: "ok" as const, route: routeSummary(route) };
  });
}

export function recordUdipExternalDispatch(actor: UdipActor, caseUuid: string, routeId: string, sentDate: string) {
  return getDatabase().$transaction(async tx => {
    if (!await lockUdipCase(tx, actor, caseUuid)) return { status: "missing" } as const;
    const row = await tx.udipQuestionRoute.findFirst({ where: { uuid: routeId, caseUuid }, select: routeFields });
    if (!row) return { status: "missing" } as const;
    const route = routeSummary(row);
    if (route.unit.kind !== "external" || !route.draft) return { status: "conflict" } as const;
    if (route.sentDate) return route.sentDate === sentDate ? { status: "ok" as const, route } : { status: "conflict" } as const;
    const summary = await tx.udipCaseManualSummary.findUnique({ where: { caseUuid }, select: { version: true } });
    if (summary?.version !== route.summaryVersion) return { status: "conflict" } as const;
    const saved = await tx.udipQuestionRoute.update({ where: { uuid: routeId }, data: { sentDate: new Date(sentDate), sentByUuid: actor.id }, select: routeFields });
    return { status: "ok" as const, route: routeSummary(saved) };
  });
}
