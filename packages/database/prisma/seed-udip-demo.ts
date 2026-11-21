import { createHash } from "node:crypto";
import { createDatabaseClient } from "../dist/index.js";

const ownerUuid = process.argv[2];
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(ownerUuid ?? "")) {
  throw new Error("Provide DATABASE_URL and the UUID of an existing human user as the first argument");
}

const database = createDatabaseClient({ connectionString: databaseUrl });
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const year = Number(today.slice(0, 4));
const firstDay = Date.UTC(year, 0, 1);
const day = (offset: number) => new Date(Math.max(firstDay, Date.parse(today) + offset * 86_400_000));
const topics = ["Rozkład komunikacji miejskiej", "Dostępność szkół", "Inwestycje drogowe", "Tereny zielone", "Wydatki na kulturę",
  "Infrastruktura sportowa", "Oświetlenie ulic", "Program opieki nad zwierzętami", "Dane o parkowaniu", "Zarządzenia dotyczące edukacji"];
const deadlines = [5, 6, 7, 8, 9, -4, -3, -1, 0, 1];
const stages = ["A", "B", "C", "D"] as const;

try {
  const created = await database.$transaction(async tx => {
    const owner = await tx.user.findUnique({ where: { uuid: ownerUuid }, select: { keycloakUuid: true } });
    if (!owner?.keycloakUuid) throw new Error("Choose a local UUID for a human user already signed in to Modulon");
    await tx.$queryRaw`SELECT uuid FROM "user" WHERE uuid = ${ownerUuid}::uuid FOR NO KEY UPDATE`;
    let count = 0;
    for (const [index, topic] of topics.entries()) {
      const clientRequestId = `3da0f1c0-5a4d-4b08-8d3b-${year}${String(index + 1).padStart(8, "0")}`;
      if (await tx.udipCase.findUnique({ where: { ownerUuid_clientRequestId: { ownerUuid, clientRequestId } }, select: { uuid: true } })) continue;
      const [counter] = await tx.$queryRaw<{ last_number: number }[]>`
        INSERT INTO udip_case_counter (year, last_number) VALUES (${year}::integer, 1)
        ON CONFLICT (year) DO UPDATE SET last_number = udip_case_counter.last_number + 1 RETURNING last_number
      `;
      const receivedDate = day(-17 + index);
      const dueDate = day(deadlines[index]);
      const text = `Syntetyczny wniosek demonstracyjny: ${topic}.`;
      const record = await tx.udipCase.create({ data: {
        ownerUuid, clientRequestId, requestHash: createHash("sha256").update(text).digest("hex"),
        signature: `BKS.IV.1431.${counter.last_number}.${year}`, year, subject: topic,
        receivedDate, dueDate, status: stages[index % stages.length], documents: { create: {
          uploadedByUuid: ownerUuid, kind: "request", status: "ready", mediaType: "text/plain",
          size: Buffer.byteLength(text), extractedText: text,
        } },
      }, select: { uuid: true } });
      if (index === 0) {
        await tx.udipDepartmentAssignment.create({ data: { caseUuid: record.uuid, departmentCode: "DEMO-TRANSPORT", departmentName: "Transport" } });
        const answer = "Syntetyczna odpowiedź wydziału do demonstracji.";
        const unit = await tx.udipDepartmentAssignment.create({ data: {
          caseUuid: record.uuid, departmentCode: "DEMO-ORGANIZACJA", departmentName: "Organizacja", respondedAt: new Date(),
        }, select: { uuid: true } });
        await tx.udipDocument.create({ data: { caseUuid: record.uuid, assignmentUuid: unit.uuid,
          uploadedByUuid: ownerUuid, kind: "departmentReply", status: "ready", mediaType: "text/plain",
          size: Buffer.byteLength(answer), extractedText: answer } });
      }
      count++;
    }
    return count;
  }, { timeout: 30_000 });
  console.log(`[ok] UDIP demo ${year}: ${created} new cases. Existing cases preserved.`);
} finally { await database.$disconnect(); }
