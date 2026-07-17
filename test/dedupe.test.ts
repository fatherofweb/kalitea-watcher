import { expect, test } from 'vitest';
import { dedupe } from '../src/core/dedupe.js';
import type { NormalizedOffer } from '../src/core/types.js';

const base: Omit<NormalizedOffer, 'source' | 'pricePerPerson'> = {
  villa: 'Vila X',
  villaKey: 'vila x',
  unitType: '1/2',
  dateFrom: '2026-08-01',
  dateTo: '2026-08-11',
  nights: 10,
  transportType: 'own',
  isPackage: false,
  url: 'u',
  pppPerNight: 0,
  dedupKey: 'vila x|1/2|2026-08-01|2026-08-11|own',
};

test('collapses same key, keeps cheapest, merges sources', () => {
  const offers: NormalizedOffer[] = [
    { ...base, source: 'A', pricePerPerson: 400, pppPerNight: 40 },
    { ...base, source: 'B', pricePerPerson: 380, pppPerNight: 38 },
  ];
  const out = dedupe(offers);
  expect(out).toHaveLength(1);
  expect(out[0]!.pricePerPerson).toBe(380);
  expect(out[0]!.sources.sort()).toEqual(['A', 'B']);
});

test('different keys stay separate', () => {
  const offers: NormalizedOffer[] = [
    { ...base, source: 'A', pricePerPerson: 380, pppPerNight: 38 },
    {
      ...base,
      source: 'A',
      pricePerPerson: 380,
      pppPerNight: 38,
      dateTo: '2026-08-08',
      dedupKey: 'vila x|1/2|2026-08-01|2026-08-08|own',
    },
  ];
  expect(dedupe(offers)).toHaveLength(2);
});
