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

// Izbaci polaske u prošlosti (sajtovi drže celu sezonsku tabelu maj–sept).
// ISO datum → poredi sa danas; ne-ISO (nepoznat) → zadrži (ne znamo).
export function isFutureDeparture(dateFrom: string, todayISO: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) return true;
  return dateFrom >= todayISO;
}
