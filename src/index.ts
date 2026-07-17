import { adapters } from './sources/registry.js';
import { normalize } from './core/normalize.js';
import { dedupe } from './core/dedupe.js';
import { computeAlerts } from './core/diff.js';
import { isRelevant } from './core/threshold.js';
import type { RawOffer, DedupedOffer } from './core/types.js';
import { createRun, insertOffers, finishRun } from './store/snapshot.js';
import { loadOfferState, upsertOfferState } from './store/offerState.js';
import { loadAlertState, recordAlerted } from './store/alertState.js';
import { loadHealth, saveHealth, applyResult, classifyFailure } from './store/health.js';
import { sendTelegram } from './notify/telegram.js';
import {
  formatAlert,
  formatSourceFailure,
  formatRecovery,
  formatEscalation,
  formatAllFailed,
  formatHeartbeat,
} from './notify/format.js';
import { supa } from './store/supabase.js';

const DRY = process.env.DRY_RUN === '1';
const THRESHOLD = Number(process.env.THRESHOLD_PPPPN ?? '38');
const HEARTBEAT_HOUR = Number(process.env.HEARTBEAT_HOUR ?? '8');

async function notify(text: string): Promise<void> {
  if (DRY) {
    console.log('--- TELEGRAM ---\n' + text + '\n');
    return;
  }
  await sendTelegram(text);
}

async function main(): Promise<void> {
  const runId = DRY ? -1 : await createRun();
  const collected: RawOffer[] = [];
  const failed: string[] = [];
  let ok = 0;

  for (const adapter of adapters) {
    const prev = DRY
      ? { source: adapter.id, consecutiveFailures: 0, lastOkAt: null }
      : await loadHealth(adapter.id);
    try {
      const offers = await adapter.run();
      collected.push(...offers);
      ok++;
      const t = applyResult(prev, true, offers.length);
      if (!DRY) await saveHealth(t);
      if (t.recovered) await notify(formatRecovery(adapter.id));
      console.log(`[${adapter.id}] ok: ${offers.length} ponuda`);
    } catch (e) {
      failed.push(adapter.id);
      const ftype = classifyFailure(e);
      const t = applyResult(prev, false, 0, ftype);
      if (!DRY) await saveHealth(t, String(e));
      if (t.becameFailing) await notify(formatSourceFailure(t, String(e)));
      if (t.reachedThreshold) await notify(formatEscalation(adapter.id));
      console.error(`[${adapter.id}] FAIL: ${String(e)}`);
    }
  }

  if (failed.length === adapters.length && adapters.length > 0) {
    await notify(formatAllFailed(failed));
  }

  const deduped = dedupe(collected.map(normalize));
  const relevant = deduped.filter(isRelevant);

  const offerState = DRY ? new Map() : await loadOfferState();
  const alertState = DRY ? new Map() : await loadAlertState();
  const alerts = computeAlerts(relevant, offerState, alertState);

  for (const a of alerts) {
    await notify(formatAlert(a, THRESHOLD));
    if (!DRY) await recordAlerted(a.offer.dedupKey, a.offer.pricePerPerson);
  }

  if (!DRY) {
    await insertOffers(runId, deduped);
    await upsertOfferState(relevant);
    await finishRun(runId, {
      sourcesOk: ok,
      sourcesFailed: failed.length,
      offersCount: deduped.length,
    });
    await maybeHeartbeat(relevant);
  }

  console.log(
    `Gotovo. ${deduped.length} deduplic. ponuda, ${relevant.length} relevantnih, ${alerts.length} alerta.`,
  );
}

async function maybeHeartbeat(relevant: DedupedOffer[]): Promise<void> {
  const hour = new Date().getUTCHours();
  if (hour !== HEARTBEAT_HOUR) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supa()
    .from('meta')
    .select('value')
    .eq('key', 'last_heartbeat_date')
    .maybeSingle();
  if (data?.value === today) return;
  const best = relevant.slice().sort((a, b) => a.pppPerNight - b.pppPerNight)[0] ?? null;
  await sendTelegram(formatHeartbeat(relevant.length, best));
  await supa().from('meta').upsert({ key: 'last_heartbeat_date', value: today }, { onConflict: 'key' });
}

main().catch((e) => {
  console.error('Fatalna greška:', e);
  process.exit(1);
});
