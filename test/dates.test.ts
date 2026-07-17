import { expect, test } from 'vitest';
import { parseSerbianDate } from '../src/core/dates.js';

test('parses "1. avgust"', () => {
  expect(parseSerbianDate('1. avgust', 2026)).toBe('2026-08-01');
});
test('parses "24. jul"', () => {
  expect(parseSerbianDate('24. jul', 2026)).toBe('2026-07-24');
});
test('parses numeric "03.08"', () => {
  expect(parseSerbianDate('03.08', 2026)).toBe('2026-08-03');
});
test('throws on garbage', () => {
  expect(() => parseSerbianDate('xyz', 2026)).toThrow();
});
