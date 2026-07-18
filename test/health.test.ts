import { expect, test } from 'vitest';
import { applyResult, classifyFailure } from '../src/store/health.js';

const prev = { source: 'X', consecutiveFailures: 0, lastOkAt: null as string | null };

test('OK->OK no transition', () => {
  const t = applyResult(prev, true, 5);
  expect(t.becameFailing).toBe(false);
  expect(t.recovered).toBe(false);
});
test('single blip does NOT alert (debounce)', () => {
  const t = applyResult(prev, false, 0, 'fetch');
  expect(t.becameFailing).toBe(false); // 1. pad → tišina
  expect(t.consecutiveFailures).toBe(1);
  expect(t.failureType).toBe('fetch');
});
test('OK->FAIL alerts on 2nd consecutive', () => {
  const t = applyResult({ ...prev, consecutiveFailures: 1 }, false, 0, 'fetch');
  expect(t.becameFailing).toBe(true); // 2. uzastopni pad → „pao"
  expect(t.consecutiveFailures).toBe(2);
});
test('single blip then recover does NOT send recovery', () => {
  const t = applyResult({ ...prev, consecutiveFailures: 1 }, true, 4);
  expect(t.recovered).toBe(false); // nije ni prijavljen kao pao
});
test('3rd consecutive reaches threshold', () => {
  const t = applyResult({ ...prev, consecutiveFailures: 2 }, false, 0, 'block');
  expect(t.consecutiveFailures).toBe(3);
  expect(t.reachedThreshold).toBe(true);
});
test('FAIL(>=2)->OK recovers', () => {
  const t = applyResult({ ...prev, consecutiveFailures: 2 }, true, 4);
  expect(t.recovered).toBe(true);
  expect(t.consecutiveFailures).toBe(0);
});
test('classifyFailure detects block vs markup vs fetch', () => {
  expect(classifyFailure(new Error('HTTP 403'))).toBe('block');
  expect(classifyFailure(new Error('HTTP 429'))).toBe('block');
  expect(classifyFailure(new Error('0 offers parsed'))).toBe('markup');
  expect(classifyFailure(new Error('network timeout'))).toBe('fetch');
});
