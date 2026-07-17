import { expect, test } from 'vitest';
import { parseSerbianDate, parseDepartures } from '../src/core/dates.js';

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

test('parseDepartures: single date', () => {
  expect(parseDepartures('19. jul', 2026)).toEqual(['2026-07-19']);
});
test('parseDepartures: multiple days sharing month "18. i 28. jul"', () => {
  expect(parseDepartures('18. i 28. jul', 2026)).toEqual(['2026-07-18', '2026-07-28']);
});
test('parseDepartures: comma-separated "18, 28. avgust"', () => {
  expect(parseDepartures('18, 28. avgust', 2026)).toEqual(['2026-08-18', '2026-08-28']);
});
test('parseDepartures: numeric single "03.08"', () => {
  expect(parseDepartures('03.08', 2026)).toEqual(['2026-08-03']);
});
test('parseDepartures: unparseable → empty', () => {
  expect(parseDepartures('Maj - Oktobar', 2026)).toEqual([]);
});
