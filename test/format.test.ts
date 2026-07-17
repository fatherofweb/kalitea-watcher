import { expect, test } from 'vitest';
import { formatAlert, formatSourceFailure, formatHeartbeat } from '../src/notify/format.js';
import type { DedupedOffer } from '../src/core/types.js';

const offer: DedupedOffer = {
  source: 'lmp',
  sources: ['Mayak-Tours'],
  villa: 'Vila X',
  villaKey: 'vila x',
  unitType: '1/2',
  dateFrom: '2026-08-03',
  dateTo: '2026-08-13',
  nights: 10,
  pricePerPerson: 360,
  pppPerNight: 36,
  transportType: 'own',
  isPackage: false,
  url: 'https://x/y',
  dedupKey: 'k',
};

test('new-offer alert shows ⭐ when below threshold and total for two', () => {
  const msg = formatAlert({ kind: 'new', offer }, 38);
  expect(msg).toContain('Vila X');
  expect(msg).toContain('720'); // 360*2 za dvoje
  expect(msg).toContain('⭐');
  expect(msg).toContain('Mayak-Tours');
  expect(msg).toContain('https://x/y');
});
test('price drop shows old->new', () => {
  const msg = formatAlert({ kind: 'price_drop', offer, previousPrice: 400 }, 38);
  expect(msg).toContain('400');
  expect(msg).toContain('360');
});
test('source failure names type', () => {
  const msg = formatSourceFailure(
    {
      source: 'lmp',
      becameFailing: true,
      recovered: false,
      consecutiveFailures: 1,
      reachedThreshold: false,
      failureType: 'block',
    },
    'HTTP 403',
  );
  expect(msg).toContain('lmp');
  expect(msg.toLowerCase()).toContain('blokada');
});
test('heartbeat', () => {
  expect(formatHeartbeat(12, offer)).toContain('12');
});
