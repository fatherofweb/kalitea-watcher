import type { NormalizedOffer, DedupedOffer } from './types.js';

export function dedupe(offers: NormalizedOffer[]): DedupedOffer[] {
  const map = new Map<string, DedupedOffer>();
  for (const o of offers) {
    const existing = map.get(o.dedupKey);
    if (!existing) {
      map.set(o.dedupKey, { ...o, sources: [o.source] });
      continue;
    }
    const sources = existing.sources.includes(o.source)
      ? existing.sources
      : [...existing.sources, o.source];
    if (o.pricePerPerson < existing.pricePerPerson) {
      map.set(o.dedupKey, { ...o, sources });
    } else {
      existing.sources = sources;
    }
  }
  return [...map.values()];
}
