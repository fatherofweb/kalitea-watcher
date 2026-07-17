import { expect, test } from 'vitest';
import { computeAlerts } from '../src/core/diff.js';
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
  dedupKey: 'k1',
  ...p,
});

test('new offer alerts when unseen', () => {
  const alerts = computeAlerts([o({})], new Map(), new Map());
  expect(alerts).toHaveLength(1);
  expect(alerts[0]!.kind).toBe('new');
});
test('unchanged offer does not alert', () => {
  const state = new Map([['k1', { dedupKey: 'k1', lastPrice: 380 }]]);
  const alertState = new Map([['k1', { dedupKey: 'k1', lastAlertedPrice: 380 }]]);
  expect(computeAlerts([o({})], state, alertState)).toHaveLength(0);
});
test('price drop alerts', () => {
  const state = new Map([['k1', { dedupKey: 'k1', lastPrice: 400 }]]);
  const alerts = computeAlerts([o({ pricePerPerson: 380 })], state, new Map());
  expect(alerts).toHaveLength(1);
  expect(alerts[0]!.kind).toBe('price_drop');
  expect(alerts[0]!.previousPrice).toBe(400);
});
test('no re-alert at already-alerted price', () => {
  const state = new Map([['k1', { dedupKey: 'k1', lastPrice: 400 }]]);
  const alertState = new Map([['k1', { dedupKey: 'k1', lastAlertedPrice: 380 }]]);
  expect(computeAlerts([o({ pricePerPerson: 380 })], state, alertState)).toHaveLength(0);
});
