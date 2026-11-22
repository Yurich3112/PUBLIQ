import "server-only";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FINAL_RESPONSES_DIRS = [
  path.resolve(process.cwd(), "data", "final_responses"),
  path.resolve(process.cwd(), "..", "..", "data", "final_responses"),
];

function safeBaseName(fileName: string): string | null {
  const base = path.basename(fileName.trim());
  if (!base || base === "." || base === ".." || base.includes("/") || base.includes("\\")) {
    return null;
  }
  return base;
}

export async function resolveFinalResponsesDir(): Promise<string> {
  for (const dir of FINAL_RESPONSES_DIRS) {
    try {
      await readdir(dir);
      return dir;
    } catch {
      continue;
    }
  }
  const fallback = FINAL_RESPONSES_DIRS[0];
  await mkdir(fallback, { recursive: true });
  return fallback;
}

export async function findFinalResponseFile(
  fileNameOrCaseNumber: string,
): Promise<{ filePath: string; fileName: string; kind: "txt" | "pdf" } | null> {
  const safeName = safeBaseName(fileNameOrCaseNumber);
  if (!safeName) return null;

  for (const dir of FINAL_RESPONSES_DIRS) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }

    // 1. Exact filename match
    const exact = entries.find(entry => entry === safeName);
    if (exact) {
      return {
        filePath: path.join(dir, exact),
        fileName: exact,
        kind: exact.toLowerCase().endsWith(".txt") ? "txt" : "pdf",
      };
    }

    // 2. Match by case number (prefer scrubbed .txt for LLM context, then .pdf)
    const matching = entries.filter(entry => entry.includes(safeName));
    if (matching.length === 0) continue;
    const preferredTxt = matching.find(entry => entry.toLowerCase().endsWith(".txt"));
    if (preferredTxt) {
      return { filePath: path.join(dir, preferredTxt), fileName: preferredTxt, kind: "txt" };
    }
    const preferredPdf =
      matching.find(entry => entry.startsWith("Odpowiedź") && entry.toLowerCase().endsWith(".pdf")) ??
      matching.find(entry => entry.toLowerCase().endsWith(".pdf"));
    if (preferredPdf) {
      return { filePath: path.join(dir, preferredPdf), fileName: preferredPdf, kind: "pdf" };
    }
  }
  return null;
}

export async function readFinalResponseReferenceText(
  fileNameOrCaseNumber: string,
): Promise<{ fileName: string; text: string } | null> {
  const match = await findFinalResponseFile(fileNameOrCaseNumber);
  if (!match || match.kind !== "txt") return null;
  try {
    const text = (await readFile(match.filePath, "utf8")).trim();
    return text ? { fileName: match.fileName, text } : null;
  } catch {
    return null;
  }
}

export async function saveFinalizedResponseTxt(
  caseNumber: string,
  scrubbedText: string,
): Promise<string | null> {
  const cleanCase = caseNumber.replace(/[^A-Za-z0-9._-]/g, "");
  if (!cleanCase || !scrubbedText.trim()) return null;
  try {
    const dir = await resolveFinalResponsesDir();
    const fileName = `Odpowiedź - ${cleanCase}.anonymised.txt`;
    await writeFile(path.join(dir, fileName), `${scrubbedText.trim()}\n`, "utf8");
    return fileName;
  } catch {
    return null;
  }
}
