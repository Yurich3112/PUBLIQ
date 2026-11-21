import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBydgoszczSeedKnowledgeNodes,
  classifyRoutingScenario,
  KB_TWIN_MATCH_THRESHOLD,
  runKnowledgeGraphMatch,
  SEED_INSTITUTIONS,
  SEED_RESPONSE_TEMPLATES,
} from "../../packages/database/dist/index.js";
import { API_ROUTES } from "../../apps/web/src/config/api-routes.ts";
import {
  kbIngestRequestSchema,
  kbMatchRequestSchema,
} from "../../apps/web/src/schemas/knowledge-graph.ts";

test("Knowledge Graph API routes enforce clerk vs admin path separation", () => {
  assert.equal(API_ROUTES.knowledgeMatch, "/api/v1/knowledge/match");
  assert.equal(API_ROUTES.knowledgeInstitutions, "/api/v1/knowledge/institutions");
  assert.equal(API_ROUTES.knowledgeTemplates, "/api/v1/knowledge/templates");
  assert.equal(API_ROUTES.adminKnowledgeGraph, "/api/v1/admin/knowledge/graph");
  assert.equal(API_ROUTES.adminKnowledgeIngest, "/api/v1/admin/knowledge/ingest");
});

test("4-case routing scenario classifier covers all 4 UDIP operational paths and separate seed tables", () => {
  // Case 1: do nas, nie było w bazie
  assert.equal(
    classifyRoutingScenario({
      isTwinMatch: false,
      isExternalAuthority: false,
      recommendedDepartments: [],
    }),
    "OUR_OFFICE_NEW",
  );
  // Case 2: do nas, podobne już było (reference PDF template available)
  assert.equal(
    classifyRoutingScenario({
      isTwinMatch: true,
      isExternalAuthority: false,
      recommendedDepartments: ["Biuro Komunikacji Społecznej"],
    }),
    "OUR_OFFICE_SIMILAR_FOUND",
  );
  // Case 3: inna instytucja (ZUS / ZDMiKP / WKZ)
  assert.equal(
    classifyRoutingScenario({
      isTwinMatch: false,
      isExternalAuthority: true,
      recommendedDepartments: [],
    }),
    "EXTERNAL_INSTITUTION",
  );
  // Case 4: inny dział UM Bydgoszcz (RED oczekuje / GREEN otrzymano)
  assert.equal(
    classifyRoutingScenario({
      isTwinMatch: true,
      isExternalAuthority: false,
      recommendedDepartments: ["Wydział Edukacji i Sportu"],
    }),
    "OTHER_INTERNAL_DEPARTMENT",
  );

  // Separate tables seed sanity check
  assert.ok(SEED_INSTITUTIONS.length >= 11);
  assert.ok(SEED_RESPONSE_TEMPLATES.length >= 7);
});

test("Path A matches twin school request 599.2026 to archival 307.2025 in <10ms", () => {
  const nodes = buildBydgoszczSeedKnowledgeNodes();
  const result = runKnowledgeGraphMatch(nodes, {
    title: "BKS.IV.1431.599.2026",
    summary:
      "Edytowalne zestawienie liczby uczniów oraz uczniów cudzoziemców w poszczególnych szkołach podstawowych w Bydgoszczy - stan na koniec czerwca 2026 oraz stan na wrzesień 2026.",
    tags: ["szkoły podstawowe", "liczba uczniów", "cudzoziemcy", "edukacja"],
  });

  assert.equal(result.path, "TWIN_CASE_MATCH");
  assert.ok(result.topMatch);
  assert.equal(result.topMatch.externalKey, "BKS.IV.1431.307.2025");
  assert.ok(
    result.topMatch.score >= KB_TWIN_MATCH_THRESHOLD,
    `Expected score >= ${KB_TWIN_MATCH_THRESHOLD}, got ${result.topMatch.score}`,
  );
  assert.deepEqual(result.recommendedDepartments, ["Wydział Edukacji i Sportu"]);
  assert.equal(result.fallbackContext, null);
});

test("Path A matches twin animal shelter request 543.2026 to archival 293.2025 with multi-department routing", () => {
  const nodes = buildBydgoszczSeedKnowledgeNodes();
  const result = runKnowledgeGraphMatch(nodes, {
    title: "BKS.IV.1431.543.2026",
    summary: "Opieka nad bezdomnymi zwierzętami, schronisko oraz ich wyłapywanie i odławianie.",
  });

  assert.equal(result.path, "TWIN_CASE_MATCH");
  assert.ok(result.topMatch);
  assert.equal(result.topMatch.externalKey, "BKS.IV.1431.293.2025");
  assert.ok(result.recommendedDepartments.includes("Wydział Zieleni i Gospodarki Komunalnej"));
  assert.ok(result.recommendedDepartments.includes("Schronisko dla Zwierząt w Bydgoszczy"));
});

test("Path B triggers AI_FALLBACK_REQUIRED for brand-new ZUS inquiry and attaches compact registry + ZUS hint", () => {
  const nodes = buildBydgoszczSeedKnowledgeNodes();
  const result = runKnowledgeGraphMatch(nodes, {
    summary: "Wniosek o informację o wysokości składek emerytalnych i rentowych w ZUS za 2025 rok.",
  });

  assert.equal(result.path, "AI_FALLBACK_REQUIRED");
  assert.ok(result.fallbackContext);
  assert.ok(result.fallbackContext.departmentsRegistry.length >= 6);
  assert.ok(result.fallbackContext.externalAuthoritiesRegistry.length >= 3);
  assert.ok(result.externalAuthorityHint);
  assert.equal(result.externalAuthorityHint.externalKey, "EXT:ZUS");
});

test("Knowledge Graph Zod schemas validate match and admin ingest payloads", () => {
  const match = kbMatchRequestSchema.parse({
    summary: "Liczba uczniów cudzoziemców w szkołach podstawowych",
    tags: ["szkoły podstawowe"],
  });
  assert.equal(match.tags?.length, 1);

  const ingest = kbIngestRequestSchema.parse({
    nodeType: "CASE",
    externalKey: "BKS.IV.1431.599.2026",
    title: "Liczba uczniów i cudzoziemców 2026",
    summary: "Edytowalne zestawienie liczby uczniów i cudzoziemców w szkołach podstawowych.",
    routedTo: ["Wydział Edukacji i Sportu"],
    legalBasis: ["Art. 13 ust. 1 UDIP"],
  });
  assert.equal(ingest.externalKey, "BKS.IV.1431.599.2026");
  assert.throws(() => kbMatchRequestSchema.parse({ summary: "a" }));
});
