import { supa } from './supabase.js';
import type { DedupedOffer } from '../core/types.js';
import type { OfferStateRow } from '../core/diff.js';

export async function loadOfferState(): Promise<Map<string, OfferStateRow>> {
  const { data, error } = await supa().from('offer_state').select('dedup_key,last_price');
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [
      r.dedup_key as string,
      { dedupKey: r.dedup_key as string, lastPrice: r.last_price as number },
    ]),
  );
}

export async function upsertOfferState(offers: DedupedOffer[]): Promise<void> {
  if (offers.length === 0) return;
  const now = new Date().toISOString();
  const rows = offers.map((o) => ({
    dedup_key: o.dedupKey,
    source: o.sources.join(','),
    last_price: o.pricePerPerson,
    last_seen_at: now,
  }));
  const { error } = await supa().from('offer_state').upsert(rows, { onConflict: 'dedup_key' });
  if (error) throw error;
}
