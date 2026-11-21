import "server-only";
import { getResolvedPDFJS } from "unpdf";
import { fromBufferPromise } from "yauzl";
import { SaxesParser } from "saxes";
import { udipMaxTextChars } from "../../schemas/udip.ts";
import type { UdipFile } from "./upload.ts";

const wordNamespaces = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const maxWordXmlBytes = 4 * 1024 * 1024;

async function pdfText(content: UdipFile["content"]) {
  const { getDocument } = await getResolvedPDFJS();
  const loading = getDocument({ data: content.slice(), verbosity: 0, useSystemFonts: true });
  try {
    const document = await loading.promise;
    if (document.numPages > 100) throw new Error("PDF page limit exceeded");
    let result = "";
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const reader = page.streamTextContent().getReader();
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const item of value.items) {
            if ("str" in item) result += item.str + (item.hasEOL ? "\n" : " ");
            if (result.length > udipMaxTextChars) throw new Error("PDF text limit exceeded");
          }
        }
        result += "\n";
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
        page.cleanup();
      }
    }
    return result;
  } finally { await loading.destroy(); }
}

async function wordText(content: UdipFile["content"]) {
  const archive = await fromBufferPromise(Buffer.from(content.buffer, content.byteOffset, content.byteLength), {
    lazyEntries: true, validateEntrySizes: true,
  });
  try {
    for await (const entry of archive.eachEntry()) {
      if (entry.fileName !== "word/document.xml") continue;
      if (entry.uncompressedSize > maxWordXmlBytes) throw new Error("Word XML limit exceeded");
      const stream = await archive.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        length += chunk.byteLength;
        if (length > maxWordXmlBytes) throw new Error("Word XML limit exceeded");
        chunks.push(chunk);
      }
      const xml = Buffer.concat(chunks, length);
      const encoding = xml[0] === 0xff && xml[1] === 0xfe ? "utf-16le"
        : xml[0] === 0xfe && xml[1] === 0xff ? "utf-16be" : "utf-8";
      const parser = new SaxesParser({ xmlns: true });
      let readText = false;
      let result = "";
      const append = (text: string) => {
        result += text;
        if (result.length > udipMaxTextChars) throw new Error("Word text limit exceeded");
      };
      parser.on("doctype", () => { throw new Error("Word XML document type declarations are unsupported"); });
      parser.on("opentag", tag => {
        if (!wordNamespaces.has(tag.uri)) return;
        if (tag.local === "t") readText = true;
        if (tag.local === "tab") append("\t");
        if (tag.local === "br" || tag.local === "cr") append("\n");
      });
      parser.on("text", text => { if (readText) append(text); });
      parser.on("closetag", tag => {
        if (!wordNamespaces.has(tag.uri)) return;
        if (tag.local === "t") readText = false;
        if (tag.local === "p") append("\n");
      });
      parser.write(new TextDecoder(encoding, { fatal: true }).decode(xml)).close();
      return result;
    }
    return "";
  } finally { archive.close(); }
}

export async function extractUdipText(file: UdipFile) {
  try {
    const text = file.mediaType === "application/pdf" ? await pdfText(file.content) : await wordText(file.content);
    return text.replaceAll("\0", "").trim() || null;
  } catch { return null; }
}
