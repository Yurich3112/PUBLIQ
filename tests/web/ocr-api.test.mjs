import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDocumentWithPyworker,
  OcrWorkerError,
  resolvePyworkerOcrEndpoint,
} from '../../apps/web/src/server/ocr.ts';

const VALID_TOKEN = 'test-token-' + 'c'.repeat(40);
const VALID_ENV = {
  PYWORKER_URL: 'http://127.0.0.1:8010',
  PYWORKER_API_TOKEN: VALID_TOKEN,
};

const VALID_OCR_RESPONSE = {
  status: 'ok',
  executor: 'pyworker',
  engine: {
    detector: 'rapidocr-dbnet-onnx',
    recognizer: 'ollama:qwen2.5vl:3b',
  },
  duration_ms: 950,
  page_count: 1,
  assembled_text: 'ILE PUNKTÓW SPRZEDAŻY ALKOHOLU',
  stamp_metadata: {
    received_date: '2026-01-09',
    registry_number: '3468/2026',
    raw_stamp_lines: ['Data wpływu: 09.01.2026', 'nr wpływu: 3468/2026'],
  },
  legibility: {
    status: 'legible',
    average_confidence: 0.88,
    low_confidence_ratio: 0.1,
    recommend_clarification: false,
    reason: null,
  },
  pages: [
    {
      page_index: 0,
      width: 1200,
      height: 1600,
      source_mode: 'handwritten_ocr',
      grid_removed: true,
      preview_image_data_url: 'data:image/png;base64,iVBORw0KGgo=',
      lines: [
        {
          line_id: 'p0_l0',
          zone: 'handwriting',
          bbox: [20, 40, 400, 50],
          text: 'ILE PUNKTÓW',
          word_ids: ['p0_w0', 'p0_w1'],
        },
      ],
      words: [
        {
          id: 'p0_w0',
          line_id: 'p0_l0',
          text: 'ILE',
          bbox: [20, 40, 120, 50],
          confidence: 0.94,
          zone: 'handwriting',
          aligned_by: 'exact',
        },
        {
          id: 'p0_w1',
          line_id: 'p0_l0',
          text: 'PUNKTÓW',
          bbox: [160, 40, 260, 50],
          confidence: 0.82,
          zone: 'handwriting',
          aligned_by: 'exact',
        },
      ],
    },
  ],
};

test('resolvePyworkerOcrEndpoint enforces loopback or explicit private-network opt-in', () => {
  const endpoint = resolvePyworkerOcrEndpoint(VALID_ENV);
  assert.equal(endpoint.url.href, 'http://127.0.0.1:8010/v1/tasks/ocr');

  assert.throws(
    () => resolvePyworkerOcrEndpoint({ PYWORKER_URL: 'http://pyworker:8010', PYWORKER_API_TOKEN: VALID_TOKEN }),
    error => error instanceof OcrWorkerError && error.code === 'unavailable' && error.httpStatus === 503,
  );

  const privateEndpoint = resolvePyworkerOcrEndpoint({
    PYWORKER_URL: 'http://pyworker:8010',
    PYWORKER_API_TOKEN: VALID_TOKEN,
    PYWORKER_ALLOW_PRIVATE_NETWORK: 'true',
  });
  assert.equal(privateEndpoint.url.hostname, 'pyworker');

  assert.throws(
    () => resolvePyworkerOcrEndpoint({ PYWORKER_URL: 'http://127.0.0.1:8010', PYWORKER_API_TOKEN: 'short' }),
    error => error instanceof OcrWorkerError && error.httpStatus === 503,
  );
});

test('analyzeDocumentWithPyworker forwards bearer auth, octet-stream, and validates response schema', async () => {
  let capturedUrl = '';
  let capturedHeaders = null;
  const mockFetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = init.headers;
    return new Response(JSON.stringify(VALID_OCR_RESPONSE), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await analyzeDocumentWithPyworker(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
    fileName: 'Wniosek - BKS.IV.1431.16.2026.pdf',
    env: VALID_ENV,
    fetchImpl: mockFetch,
  });

  assert.equal(capturedUrl, 'http://127.0.0.1:8010/v1/tasks/ocr');
  assert.equal(capturedHeaders.Authorization, `Bearer ${VALID_TOKEN}`);
  assert.equal(capturedHeaders['Content-Type'], 'application/octet-stream');
  assert.equal(result.stamp_metadata.registry_number, '3468/2026');
  assert.equal(result.pages[0].words.length, 2);
});

test('analyzeDocumentWithPyworker maps worker HTTP errors and timeouts to sanitized codes', async () => {
  const cases = [
    [413, 'tooLarge', 413],
    [415, 'unsupportedMediaType', 415],
    [422, 'invalidDocument', 422],
    [503, 'unavailable', 503],
    [504, 'timeout', 504],
  ];

  for (const [status, expectedCode, expectedHttp] of cases) {
    await assert.rejects(
      analyzeDocumentWithPyworker(new Uint8Array([1, 2, 3]), {
        fileName: 'scan.png',
        env: VALID_ENV,
        fetchImpl: async () => new Response(JSON.stringify({ error: 'internal' }), { status }),
      }),
      error => error instanceof OcrWorkerError && error.code === expectedCode && error.httpStatus === expectedHttp,
    );
  }

  await assert.rejects(
    analyzeDocumentWithPyworker(new Uint8Array([1, 2, 3]), {
      fileName: 'scan.png',
      env: VALID_ENV,
      fetchImpl: async () => {
        const err = new Error('timed out');
        err.name = 'TimeoutError';
        throw err;
      },
    }),
    error => error instanceof OcrWorkerError && error.code === 'timeout' && error.httpStatus === 504,
  );
});
