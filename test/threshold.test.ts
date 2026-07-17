import { expect, test } from 'vitest';
import { isRelevant, isBelowThreshold, isFutureDeparture } from '../src/core/threshold.js';
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

test('relevant = 1/2 (transport not filtered)', () => {
  expect(isRelevant(o({}))).toBe(true);
  expect(isRelevant(o({ transportType: 'package' }))).toBe(true); // prevoz se ne filtrira
  expect(isRelevant(o({ unitType: '1/3' }))).toBe(false);
});
test('below threshold', () => {
  expect(isBelowThreshold(o({ pppPerNight: 37 }), 38)).toBe(true);
  expect(isBelowThreshold(o({ pppPerNight: 38 }), 38)).toBe(false);
});
test('future departure filter (drops past)', () => {
  const today = '2026-07-17';
  expect(isFutureDeparture('2026-05-25', today)).toBe(false); // prošlost
  expect(isFutureDeparture('2026-07-17', today)).toBe(true); // danas
  expect(isFutureDeparture('2026-08-03', today)).toBe(true); // budućnost
  expect(isFutureDeparture('19. jul', today)).toBe(true); // ne-ISO → zadrži
});
