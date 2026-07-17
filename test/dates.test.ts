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
test('parseDepartures: three days sharing month "18, 23. i 28. jul"', () => {
  expect(parseDepartures('18, 23. i 28. jul', 2026)).toEqual(['2026-07-18', '2026-07-23', '2026-07-28']);
});
test('parseDepartures: different months "28. jul i 04. avgust"', () => {
  expect(parseDepartures('28. jul i 04. avgust', 2026)).toEqual(['2026-07-28', '2026-08-04']);
});
test('parseDepartures: numeric multiple "28.07 i 04.08"', () => {
  expect(parseDepartures('28.07 i 04.08', 2026)).toEqual(['2026-07-28', '2026-08-04']);
});
test('parseDepartures: "ili" separator + slash', () => {
  expect(parseDepartures('18. ili 28. jul', 2026)).toEqual(['2026-07-18', '2026-07-28']);
  expect(parseDepartures('18 / 28. avgust', 2026)).toEqual(['2026-08-18', '2026-08-28']);
});
test('parseDepartures: dedupes repeats', () => {
  expect(parseDepartures('18. i 18. jul', 2026)).toEqual(['2026-07-18']);
});
test('parseDepartures: unparseable → empty (never throws)', () => {
  expect(parseDepartures('Maj - Oktobar', 2026)).toEqual([]);
  expect(parseDepartures('', 2026)).toEqual([]);
  expect(parseDepartures('blabla', 2026)).toEqual([]);
});
