import { expect, test } from 'vitest';
import { isRelevant, isBelowThreshold } from '../src/core/threshold.js';
import type { DedupedOffer } from '../src/core/types.js';

const o = (p: Partial<DedupedOffer>): DedupedOffer => ({
  source: 's',
  sources: ['s'],
  villa: 'V',
  villaKey: 'v',
  unitType: '1/2',
  dateFrom: '2026-08-01',
  dateTo: '2026-08-11',
  nights: 10,
  pricePerPerson: 380,
  pppPerNight: 38,
  transportType: 'own',
  isPackage: false,
  url: 'u',
  dedupKey: 'k',
  ...p,
});

test('relevant = own + 1/2', () => {
  expect(isRelevant(o({}))).toBe(true);
  expect(isRelevant(o({ transportType: 'package' }))).toBe(false);
  expect(isRelevant(o({ unitType: '1/3' }))).toBe(false);
});
test('below threshold', () => {
  expect(isBelowThreshold(o({ pppPerNight: 37 }), 38)).toBe(true);
  expect(isBelowThreshold(o({ pppPerNight: 38 }), 38)).toBe(false);
});
