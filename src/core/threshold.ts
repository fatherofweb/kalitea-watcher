import type { DedupedOffer } from './types.js';

export function isRelevant(o: DedupedOffer): boolean {
  return o.transportType === 'own' && o.unitType === '1/2';
}

export function isBelowThreshold(o: DedupedOffer, threshold: number): boolean {
  return o.pppPerNight < threshold;
}
