import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { LOGGED_ACCESS } from "@/schemas/access";
import { getAccess } from "@/server/auth/access";
import { loadUdipCaseById } from "@/server/udip-cases";

const SAMPLE_DOCS_DIRS = [
  path.resolve(process.cwd(), "docs", "Przykładowe wnioski i odpowiedzi -20261121T114640Z-1-001", "Przykładowe wnioski i odpowiedzi"),
  path.resolve(process.cwd(), "..", "..", "docs", "Przykładowe wnioski i odpowiedzi -20261121T114640Z-1-001", "Przykładowe wnioski i odpowiedzi"),
];

async function findSamplePdfForCase(caseNumber: string): Promise<{ filePath: string; fileName: string } | null> {
  for (const dir of SAMPLE_DOCS_DIRS) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    const pdfs = entries.filter(name => name.toLowerCase().endsWith(".pdf") && name.includes(caseNumber));
    if (pdfs.length === 0) continue;
    const preferred =
      pdfs.find(name => name.startsWith("Odpowiedź")) ??
      pdfs.find(name => name.startsWith("Kwerenda")) ??
      pdfs.find(name => name.startsWith("Doprecyzowanie")) ??
      pdfs[0];
    return { filePath: path.join(dir, preferred), fileName: preferred };
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ uuid: string }> },
) {
  const access = await getAccess(LOGGED_ACCESS);
  if (access.status !== "allowed") {
    return NextResponse.json({ status: "denied" }, { status: access.status === "unauthenticated" ? 401 : 403 });
  }

  const { uuid } = await context.params;
  const record = await loadUdipCaseById(uuid);
  if (!record) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const match = await findSamplePdfForCase(record.caseNumber);
  if (!match) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const bytes = await readFile(match.filePath);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(match.fileName)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
