import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectOcrFileKind,
  ocrAnalysisResponseSchema,
  verifiedOcrPayloadSchema,
} from '../../apps/web/src/schemas/ocr.ts';

const validFixture = {
  status: 'ok',
  executor: 'pyworker',
  engine: {
    detector: 'rapidocr-dbnet-onnx',
    recognizer: 'ollama:qwen2.5vl:3b',
  },
  duration_ms: 1420,
  page_count: 1,
  assembled_text: 'ILE PUNKTÓW SPRZEDAŻY ALKOHOLU',
  stamp_metadata: {
    received_date: '2026-01-09',
    registry_number: '3468/2026',
    raw_stamp_lines: ['Data wpływu: 09.01.2026', 'nr wpływu: 3468/2026'],
  },
  legibility: {
    status: 'legible',
    average_confidence: 0.89,
    low_confidence_ratio: 0.1,
    recommend_clarification: false,
    reason: null,
  },
  pages: [
    {
      page_index: 0,
      width: 1654,
      height: 2339,
      source_mode: 'handwritten_ocr',
      grid_removed: true,
      preview_image_data_url: 'data:image/png;base64,iVBORw0KGgo=',
      lines: [
        {
          line_id: 'p0_l0',
          zone: 'handwriting',
          bbox: [210, 645, 980, 74],
          text: 'ILE PUNKTÓW',
          word_ids: ['p0_w0', 'p0_w1'],
        },
      ],
      words: [
        {
          id: 'p0_w0',
          line_id: 'p0_l0',
          text: 'ILE',
          bbox: [210, 650, 95, 62],
          confidence: 0.94,
          zone: 'handwriting',
          aligned_by: 'exact',
        },
        {
          id: 'p0_w1',
          line_id: 'p0_l0',
          text: 'PUNKTÓW',
          bbox: [320, 650, 260, 62],
          confidence: 0.84,
          zone: 'handwriting',
          aligned_by: 'exact',
        },
      ],
    },
  ],
};

test('ocrAnalysisResponseSchema accepts valid payload and rejects unknown/out-of-range fields', () => {
  const parsed = ocrAnalysisResponseSchema.parse(validFixture);
  assert.equal(parsed.stamp_metadata.received_date, '2026-01-09');
  assert.equal(parsed.pages[0].words.length, 2);

  assert.throws(() => ocrAnalysisResponseSchema.parse({ ...validFixture, extra: 'nope' }));
  assert.throws(() => ocrAnalysisResponseSchema.parse({
    ...validFixture,
    pages: [{
      ...validFixture.pages[0],
      words: [{ ...validFixture.pages[0].words[0], confidence: 1.5 }],
    }],
  }));
  assert.throws(() => ocrAnalysisResponseSchema.parse({
    ...validFixture,
    pages: [{
      ...validFixture.pages[0],
      words: [{ ...validFixture.pages[0].words[0], bbox: [0, 0, 0, 10] }],
    }],
  }));
});

test('verifiedOcrPayloadSchema validates finalized clerk handoff payload', () => {
  const payload = verifiedOcrPayloadSchema.parse({
    fileName: 'Wniosek - BKS.IV.1431.16.2026.pdf',
    pageCount: 1,
    verifiedText: 'Ile punktów sprzedaży alkoholu przybyło w Bydgoszczy?',
    receivedDate: '2026-01-09',
    registryNumber: '3468/2026',
    editedWordCount: 2,
    totalWordCount: 24,
    averageConfidence: 0.87,
    verifiedAt: '2026-11-21T16:00:00.000Z',
  });
  assert.equal(payload.editedWordCount, 2);
  assert.throws(() => verifiedOcrPayloadSchema.parse({
    ...payload,
    verifiedText: '   ',
  }));
});

test('detectOcrFileKind validates PDF, PNG, and JPEG magic bytes', () => {
  assert.equal(detectOcrFileKind(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])), 'pdf');
  assert.equal(detectOcrFileKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(detectOcrFileKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(detectOcrFileKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), null);
  assert.equal(detectOcrFileKind(new Uint8Array([])), null);
});
