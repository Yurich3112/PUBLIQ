import "server-only";
import type { UdipRedactionRange, UdipRedactionState } from "../../schemas/udip.ts";

function splitsSurrogatePair(text: string, offset: number) {
  const left = text.charCodeAt(offset - 1);
  const right = text.charCodeAt(offset);
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff;
}

/** JavaScript string offsets are UTF-16 code units, as are browser text selections. */
export function applyUdipRedactions(text: string, ranges: readonly UdipRedactionRange[]) {
  for (const [start, end] of ranges) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= end || end > text.length
      || splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) return null;
  }
  const merged: UdipRedactionRange[] = [];
  for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const previous = merged.at(-1);
    if (previous && start < previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  const parts = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    parts.push(text.slice(cursor, start));
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return { ranges: merged, text: parts.join("") };
}

const rules = [
  { kind: "pesel", pattern: /(?<!\d)\d{11}(?!\d)/g },
  { kind: "email", pattern: /(?<![A-Z\d.!#$%&'*+/=?^_\x60{|}~-])[A-Z\d.!#$%&'*+/=?^_\x60{|}~-]{1,64}@[A-Z\d-]{1,63}(?:\.[A-Z\d-]{1,63})+(?![A-Z\d-])/gi },
  { kind: "phone", pattern: /(?<![\p{L}\d])(?:\+48[ .-]{0,3}|0048[ .-]{0,3})?(?:\d[ .()-]{0,3}){8}\d(?![\p{L}\d])/gu },
] as const;

export function suggestUdipRedactions(text: string): UdipRedactionState["suggestions"] {
  return rules.flatMap(({ kind, pattern }) => Array.from(text.matchAll(pattern), match => ({
    kind, range: [match.index, match.index + match[0].length] as UdipRedactionRange,
  }))).sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
}
