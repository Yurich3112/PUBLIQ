import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBydgoszczSeedCases,
  computeUdipCaseHealth,
  deriveInitials,
  formatUdipCaseNumber,
  UdipDeptStatus,
  UdipProcessStatus,
  UdipRoutingType,
} from "../../packages/database/dist/index.js";
import { API_ROUTES } from "../../apps/web/src/config/api-routes.ts";
import {
  createUdipCaseSchema,
  udipCaseQuerySchema,
  updateUdipCaseSchema,
  upsertUdipDepartmentReplySchema,
} from "../../apps/web/src/schemas/udip-case.ts";

test("UDIP API routes expose canonical v1 cases endpoints", () => {
  assert.equal(API_ROUTES.cases, "/api/v1/cases");
  assert.equal(API_ROUTES.caseById, "/api/v1/cases/{uuid}");
  assert.equal(API_ROUTES.caseDepartments, "/api/v1/cases/{uuid}/departments");
});

test("formatUdipCaseNumber and deriveInitials follow UM Bydgoszcz BKS conventions", () => {
  assert.equal(formatUdipCaseNumber(599, 2026), "BKS.IV.1431.599.2026");
  assert.equal(formatUdipCaseNumber(293, 2025), "BKS.IV.1431.293.2025");
  assert.equal(deriveInitials("Pracownik 1"), "P1");
  assert.equal(deriveInitials("Łukasz Okoński"), "ŁO");
});

test("buildBydgoszczSeedCases produces 10 official cases with an exact 5 GREEN / 5 RED split", () => {
  const refDate = new Date("2026-11-21T12:00:00.000Z");
  const cases = buildBydgoszczSeedCases(refDate);
  assert.equal(cases.length, 10);

  const healthResults = cases.map(item =>
    computeUdipCaseHealth(
      {
        processStatus: item.processStatus,
        deadlineDate: item.deadlineDate,
        answeredDate: item.answeredDate,
        isMultiDepartment: item.isMultiDepartment,
        routingType: item.routingType,
        matchedCaseNumber: item.matchedCaseNumber,
        departmentQueries: item.departments,
      },
      refDate,
    ),
  );

  const greenCases = healthResults.filter(h => h.healthColor === "GREEN");
  const redCases = healthResults.filter(h => h.healthColor === "RED");
  assert.equal(greenCases.length, 5, "Expected exactly 5 GREEN cases");
  assert.equal(redCases.length, 5, "Expected exactly 5 RED cases");

  // Verify multi-department alert badge and twin-case Knowledge Graph links
  const case543 = cases.find(c => c.caseNumber === "BKS.IV.1431.543.2026");
  assert.ok(case543);
  assert.equal(case543.matchedCaseNumber, "BKS.IV.1431.293.2025");
  assert.equal(case543.departments.length, 2);
  const health543 = computeUdipCaseHealth(
    {
      ...case543,
      departmentQueries: case543.departments,
    },
    refDate,
  );
  assert.equal(health543.healthColor, "RED");
  assert.ok(health543.alerts.includes("WIELO_WYDZIALOWY"));
  assert.ok(health543.alerts.includes("BLIZNIACZA_SPRAWA_W_BAZIE"));
  assert.ok(health543.alerts.includes("KWERENDA_LUB_DOPRECYZOWANIE"));

  // Verify external authority case (ZDMiKP / WKZ)
  const case17 = cases.find(c => c.caseNumber === "BKS.IV.1431.17.2026");
  assert.ok(case17);
  assert.equal(case17.routingType, UdipRoutingType.EXTERNAL_AUTHORITY);
  const health17 = computeUdipCaseHealth(
    {
      ...case17,
      departmentQueries: case17.departments,
    },
    refDate,
  );
  assert.equal(health17.healthColor, "GREEN");
  assert.ok(health17.alerts.includes("BRAK_DYSPONENTA_ZUS_ZDMIKP"));
});

test("UDIP Zod schemas validate query filters, case creation, and inline department replies", () => {
  const query = udipCaseQuerySchema.parse({
    year: "2026",
    processStatus: "B",
    healthColor: "RED",
    search: "Astoria",
  });
  assert.equal(query.year, 2026);
  assert.equal(query.processStatus, UdipProcessStatus.B);

  const created = createUdipCaseSchema.parse({
    applicantName: "Jan Kowalski",
    subject: "Wniosek o informację publiczną dot. remontu drogi",
    registryNumber: "3500/2026",
    sourceMode: "handwritten_scan",
    departments: [
      {
        departmentName: "Wydział Inwestycji Miasta",
        status: UdipDeptStatus.PENDING,
      },
    ],
  });
  assert.equal(created.applicantName, "Jan Kowalski");
  assert.equal(created.departments?.length, 1);

  const updated = updateUdipCaseSchema.parse({
    processStatus: "D",
    piiRedactionsCount: 4,
    addedToKnowledgeGraph: true,
  });
  assert.equal(updated.processStatus, "D");

  const deptReply = upsertUdipDepartmentReplySchema.parse({
    departmentName: "Wydział Edukacji i Sportu",
    replyText: "Przekazujemy dane z SIO w załączeniu.",
    replyFileName: "SIO_2026.xlsx",
  });
  assert.equal(deptReply.departmentName, "Wydział Edukacji i Sportu");

  assert.throws(() => upsertUdipDepartmentReplySchema.parse({ replyText: "Brak identyfikatora" }));
});
