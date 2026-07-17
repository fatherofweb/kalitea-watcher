import { supa } from './supabase.js';
import type { DedupedOffer } from '../core/types.js';

export async function createRun(): Promise<number> {
  const { data, error } = await supa().from('runs').insert({}).select('run_id').single();
  if (error) throw error;
  return data!.run_id as number;
}

export async function insertOffers(runId: number, offers: DedupedOffer[]): Promise<void> {
  if (offers.length === 0) return;
  const rows = offers.map((o) => ({
    run_id: runId,
    source: o.sources.join(','),
    villa: o.villa,
    villa_key: o.villaKey,
    unit_type: o.unitType,
    date_from: o.dateFrom,
    date_to: o.dateTo,
    nights: o.nights,
    price_per_person: o.pricePerPerson,
    ppp_per_night: o.pppPerNight,
    transport_type: o.transportType,
    is_package: o.isPackage,
    url: o.url,
  }));
  const { error } = await supa().from('offers').insert(rows);
  if (error) throw error;
}

export async function finishRun(
  runId: number,
  s: { sourcesOk: number; sourcesFailed: number; offersCount: number },
): Promise<void> {
  await supa()
    .from('runs')
    .update({
      finished_at: new Date().toISOString(),
      sources_ok: s.sourcesOk,
      sources_failed: s.sourcesFailed,
      offers_count: s.offersCount,
    })
    .eq('run_id', runId);
}
