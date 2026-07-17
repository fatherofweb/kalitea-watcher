import { supa } from './supabase.js';
import type { AlertStateRow } from '../core/diff.js';

export async function loadAlertState(): Promise<Map<string, AlertStateRow>> {
  const { data, error } = await supa().from('alert_state').select('dedup_key,last_alerted_price');
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => [
      r.dedup_key as string,
      { dedupKey: r.dedup_key as string, lastAlertedPrice: r.last_alerted_price as number },
    ]),
  );
}

export async function recordAlerted(dedupKey: string, price: number): Promise<void> {
  await supa()
    .from('alert_state')
    .upsert(
      { dedup_key: dedupKey, last_alerted_price: price, last_alerted_at: new Date().toISOString() },
      { onConflict: 'dedup_key' },
    );
}
