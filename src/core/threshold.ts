import type { DedupedOffer } from './types.js';

// Relevantno = dvokrevetna jedinica (1/2) za Kaliteu. Prevoz se NE filtrira jer
// agregator objavljuje teaser cenu (često autobus); sopstveni proveravaš u programu.
// Transport se prikazuje u poruci da znaš na šta se cena odnosi.
export function isRelevant(o: DedupedOffer): boolean {
  return o.unitType === '1/2';
}

export function isBelowThreshold(o: DedupedOffer, threshold: number): boolean {
  return o.pppPerNight < threshold;
}
