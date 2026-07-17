import { expect, test } from 'vitest';
import { formatBatchSummary } from '../src/notify/format.js';
import type { Alert } from '../src/core/diff.js';
import type { DedupedOffer } from '../src/core/types.js';

function offer(p: Partial<DedupedOffer>): DedupedOffer {
  return {
    source: 'clocktravel',
    sources: ['clocktravel'],
    villa: 'Vila X',
    villaKey: 'vila x',
    unitType: '1/2',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-11',
    nights: 10,
    pricePerPerson: 200,
    pppPerNight: 20,
    transportType: 'own',
    isPackage: false,
    url: 'u',
    dedupKey: 'k',
    ...p,
  };
}

test('summary lists count, source, and cheapest first', () => {
  const alerts: Alert[] = [
    { kind: 'new', offer: offer({ villa: 'A', pricePerPerson: 300, pppPerNight: 30 }) },
    { kind: 'new', offer: offer({ villa: 'B', pricePerPerson: 100, pppPerNight: 10 }) },
    { kind: 'new', offer: offer({ villa: 'C', pricePerPerson: 200, pppPerNight: 20 }) },
  ];
  const msg = formatBatchSummary(alerts, 38);
  expect(msg).toContain('3 novih');
  expect(msg).toContain('clocktravel: 3');
  expect(msg).toContain('100€/os');
  // najjeftinija (100) mora doći pre najskuplje (300) u sažetku
  expect(msg.indexOf('100€/os')).toBeLessThan(msg.indexOf('300€/os'));
});
