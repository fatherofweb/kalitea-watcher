import type { Alert } from '../core/diff.js';
import type { DedupedOffer } from '../core/types.js';
import type { HealthTransition, FailureType } from '../store/health.js';

const FAIL_LABEL: Record<FailureType, string> = {
  fetch: 'ne može da dohvati (mreža/HTTP)',
  block: 'blokada (403/429/Cloudflare)',
  markup: 'markup se promenio (0 ponuda gde ih je ranije bilo)',
};

export function formatAlert(a: Alert, threshold: number): string {
  const o = a.offer;
  const star = o.pppPerNight < threshold ? ' ⭐' : '';
  const forTwo = o.pricePerPerson * 2;
  const head = a.kind === 'new' ? '🆕 Nova ponuda' : '📉 Pala cena';
  const priceLine =
    a.kind === 'price_drop' && a.previousPrice !== undefined
      ? `Cena/os: ~${a.previousPrice}~ → *${o.pricePerPerson} €*`
      : `Cena/os: *${o.pricePerPerson} €*`;
  const transportLine =
    o.transportType === 'own'
      ? 'Prevoz: sopstveni'
      : 'Prevoz: cena je za autobus — proveri sopstveni u programu';
  return [
    `${head}${star}`,
    `*${o.villa}* (${o.unitType})`,
    `Termin: ${o.dateFrom} → ${o.dateTo} (${o.nights} noći)`,
    priceLine,
    `Za dvoje: *${forTwo} €*  |  ${o.pppPerNight} €/os/noć`,
    transportLine,
    `Izvor: ${o.sources.join(', ')}`,
    o.url,
  ].join('\n');
}

export function formatSourceFailure(t: HealthTransition, error: string): string {
  const label = t.failureType ? FAIL_LABEL[t.failureType] : 'nepoznat razlog';
  return `⚠️ Izvor *${t.source}* pao: ${label}\n${error}`;
}

export function formatRecovery(source: string): string {
  return `✅ Izvor *${source}* ponovo radi.`;
}

export function formatEscalation(source: string): string {
  return `‼️ Izvor *${source}* mrtav 3 puta zaredom — parser verovatno treba popravku.`;
}

export function formatAllFailed(sources: string[]): string {
  return `‼️ SVI izvori pali u ovom runu: ${sources.join(', ')}. Nešto globalno ne valja.`;
}

// Kad run proizvede puno alerta (npr. prvi put kad se doda izvor sa 100+ termina),
// šalje se JEDAN sažetak umesto stotine poruka — najjeftinije prvo.
export function formatBatchSummary(alerts: Alert[], threshold: number): string {
  const n = alerts.length;
  const bySource = new Map<string, number>();
  for (const a of alerts) {
    const s = a.offer.sources.join(',');
    bySource.set(s, (bySource.get(s) ?? 0) + 1);
  }
  const srcLine = [...bySource.entries()].map(([s, c]) => `${s}: ${c}`).join(', ');
  const top = alerts.slice().sort((a, b) => a.offer.pppPerNight - b.offer.pppPerNight).slice(0, 8);
  const lines = top.map((a) => {
    const o = a.offer;
    const star = o.pppPerNight < threshold ? ' ⭐' : '';
    const tr = o.transportType === 'own' ? 'sopstveni' : 'autobus';
    return `• ${o.villa} — ${o.pricePerPerson}€/os (${o.pppPerNight}/noć) ${o.dateFrom}→${o.dateTo} [${tr}]${star}`;
  });
  const tail = n > top.length ? [`…i još ${n - top.length}. Sve zabeleženo — javiću na svaki pad cene.`] : [];
  return [`🆕 ${n} novih/jeftinijih ponuda (${srcLine})`, 'Najjeftinije:', ...lines, ...tail].join('\n');
}

export function formatHeartbeat(count: number, best: DedupedOffer | null): string {
  const bestLine = best
    ? `Najbolje: ${best.villa} — ${best.pricePerPerson} €/os (${best.pppPerNight}/noć)`
    : 'Nema relevantnih ponuda trenutno.';
  return `💓 Živ sam. Pratim ${count} relevantnih ponuda.\n${bestLine}`;
}
