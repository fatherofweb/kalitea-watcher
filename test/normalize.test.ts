import { expect, test } from 'vitest';
import { villaKey, pppPerNight, dedupKey, normalize } from '../src/core/normalize.js';
import type { RawOffer } from '../src/core/types.js';

test('villaKey strips diacritics and lowercases', () => {
  expect(villaKey('Vila Đorđe  Studio')).toBe('vila dorde studio');
  expect(villaKey('KALITHÉA Palace')).toBe('kalithea palace');
});
test('pppPerNight', () => {
  expect(pppPerNight(380, 10)).toBe(38);
  expect(pppPerNight(266, 7)).toBeCloseTo(38, 0);
  expect(pppPerNight(100, 0)).toBe(100); // guard
});
test('dedupKey format', () => {
  expect(
    dedupKey({
      villaKey: 'v',
      unitType: '1/2',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-11',
      transportType: 'own',
    }),
  ).toBe('v|1/2|2026-08-01|2026-08-11|own');
});
test('normalize fills derived fields', () => {
  const raw: RawOffer = {
    source: 's',
    villa: 'Vila X',
    unitType: '1/2',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-11',
    nights: 10,
    pricePerPerson: 380,
    transportType: 'own',
    isPackage: false,
    url: 'u',
  };
  const n = normalize(raw);
  expect(n.villaKey).toBe('vila x');
  expect(n.pppPerNight).toBe(38);
  expect(n.dedupKey).toBe('vila x|1/2|2026-08-01|2026-08-11|own');
});
