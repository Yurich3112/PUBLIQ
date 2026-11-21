import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assembleVerifiedBodyText,
  buildClarificationNoticeDraft,
  buildVerifiedPayload,
  findAdjacentWordId,
  findNextUncertainWordId,
  getWordTier,
} from '../../apps/web/src/app/[locale]/ocr/ocr-helpers.ts';

const SAMPLE_ANALYSIS = {
  status: 'ok',
  executor: 'pyworker',
  engine: {
    detector: 'rapidocr-dbnet-onnx',
    recognizer: 'ollama:qwen2.5vl:3b',
  },
  duration_ms: 1500,
  page_count: 1,
  assembled_text: 'ILE PUNKTÓW PRZYBYLO',
  stamp_metadata: {
    received_date: '2026-01-09',
    registry_number: '3468/2026',
    raw_stamp_lines: ['Data wpływu: 09.01.2026', 'nr wpływu: 3468/2026'],
  },
  legibility: {
    status: 'legible',
    average_confidence: 0.78,
    low_confidence_ratio: 0.33,
    recommend_clarification: false,
    reason: null,
  },
  pages: [
    {
      page_index: 0,
      width: 1000,
      height: 1400,
      source_mode: 'handwritten_ocr',
      grid_removed: true,
      preview_image_data_url: 'data:image/png;base64,iVBORw0KGgo=',
      lines: [
        {
          line_id: 'p0_l0',
          zone: 'stamp',
          bbox: [600, 40, 300, 60],
          text: '09.01.2026',
          word_ids: ['p0_w0'],
        },
        {
          line_id: 'p0_l1',
          zone: 'handwriting',
          bbox: [50, 300, 800, 60],
          text: 'ILE PUNKTÓW PRZYBYLO',
          word_ids: ['p0_w1', 'p0_w2', 'p0_w3'],
        },
      ],
      words: [
        {
          id: 'p0_w0',
          line_id: 'p0_l0',
          text: '09.01.2026',
          bbox: [600, 40, 180, 50],
          confidence: 0.96,
          zone: 'stamp',
          aligned_by: 'exact',
        },
        {
          id: 'p0_w1',
          line_id: 'p0_l1',
          text: 'ILE',
          bbox: [50, 300, 90, 50],
          confidence: 0.94,
          zone: 'handwriting',
          aligned_by: 'exact',
        },
        {
          id: 'p0_w2',
          line_id: 'p0_l1',
          text: 'PUNKTÓW',
          bbox: [160, 300, 240, 50],
          confidence: 0.68,
          zone: 'handwriting',
          aligned_by: 'exact',
        },
        {
          id: 'p0_w3',
          line_id: 'p0_l1',
          text: 'PRZYBYLO',
          bbox: [420, 300, 260, 50],
          confidence: 0.42,
          zone: 'handwriting',
          aligned_by: 'split_box',
        },
      ],
    },
  ],
};

test('word tier classification, inline edits, and uncertain navigation work end-to-end', () => {
  const words = SAMPLE_ANALYSIS.pages[0].words;
  assert.equal(getWordTier(words[0], {}), 'stamp');
  assert.equal(getWordTier(words[1], {}), 'high');
  assert.equal(getWordTier(words[2], {}), 'medium');
  assert.equal(getWordTier(words[3], {}), 'low');

  // Cycling through uncertain words jumps between p0_w2 and p0_w3 and ignores stamp/high words.
  assert.deepEqual(findNextUncertainWordId(SAMPLE_ANALYSIS, {}, null), { pageIndex: 0, wordId: 'p0_w2' });
  assert.deepEqual(findNextUncertainWordId(SAMPLE_ANALYSIS, {}, 'p0_w2'), { pageIndex: 0, wordId: 'p0_w3' });
  assert.deepEqual(findNextUncertainWordId(SAMPLE_ANALYSIS, {}, 'p0_w3'), { pageIndex: 0, wordId: 'p0_w2' });

  // Left/right arrow navigation steps through all words in reading order and wraps cleanly.
  assert.deepEqual(findAdjacentWordId(SAMPLE_ANALYSIS, null, 1), { pageIndex: 0, wordId: 'p0_w0' });
  assert.deepEqual(findAdjacentWordId(SAMPLE_ANALYSIS, 'p0_w0', 1), { pageIndex: 0, wordId: 'p0_w1' });
  assert.deepEqual(findAdjacentWordId(SAMPLE_ANALYSIS, 'p0_w1', 1), { pageIndex: 0, wordId: 'p0_w2' });
  assert.deepEqual(findAdjacentWordId(SAMPLE_ANALYSIS, 'p0_w3', 1), { pageIndex: 0, wordId: 'p0_w0' });
  assert.deepEqual(findAdjacentWordId(SAMPLE_ANALYSIS, 'p0_w0', -1), { pageIndex: 0, wordId: 'p0_w3' });

  // Editing clears uncertain status and updates assembled body text without including stamp lines.
  const edits = { p0_w3: 'PRZYBYŁO' };
  assert.equal(getWordTier(words[3], edits), 'verified');
  assert.equal(assembleVerifiedBodyText(SAMPLE_ANALYSIS, edits), 'ILE PUNKTÓW PRZYBYŁO');
  assert.deepEqual(findNextUncertainWordId(SAMPLE_ANALYSIS, edits, null), { pageIndex: 0, wordId: 'p0_w2' });
});

test('buildVerifiedPayload and buildClarificationNoticeDraft produce valid BKS artifacts', () => {
  const payload = buildVerifiedPayload({
    analysis: SAMPLE_ANALYSIS,
    fileName: 'Wniosek - BKS.IV.1431.16.2026.pdf',
    editedWords: { p0_w3: 'PRZYBYŁO' },
    receivedDate: '2026-01-09',
    registryNumber: '3468/2026',
    now: new Date('2026-11-21T16:30:00.000Z'),
  });
  assert.equal(payload.verifiedText, 'ILE PUNKTÓW PRZYBYŁO');
  assert.equal(payload.editedWordCount, 1);
  assert.equal(payload.totalWordCount, 3);
  assert.equal(payload.receivedDate, '2026-01-09');
  assert.equal(payload.registryNumber, '3468/2026');

  const draft = buildClarificationNoticeDraft({
    fileName: 'Wniosek - BKS.IV.1431.16.2026.pdf',
    receivedDate: '2026-01-09',
    registryNumber: '3468/2026',
    todayIso: '2026-11-21',
  });
  assert.match(draft, /URZĄD MIASTA BYDGOSZCZY/);
  assert.match(draft, /7 dni/);
  assert.match(draft, /nr wpływu 3468\/2026/);
  assert.match(draft, /2026-01-09/);
});

test('PL and EN OCR translation catalogs stay in strict key parity', async () => {
  const [pl, en] = await Promise.all([
    readFile('apps/web/messages/pl/ocr.json', 'utf8').then(JSON.parse),
    readFile('apps/web/messages/en/ocr.json', 'utf8').then(JSON.parse),
  ]);
  const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix ? `${prefix}.${k}` : k] : flatten(v, prefix ? `${prefix}.${k}` : k),
  ).sort();
  assert.deepEqual(flatten(pl), flatten(en));
});
