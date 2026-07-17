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

export function formatHeartbeat(count: number, best: DedupedOffer | null): string {
  const bestLine = best
    ? `Najbolje: ${best.villa} — ${best.pricePerPerson} €/os (${best.pppPerNight}/noć)`
    : 'Nema relevantnih ponuda trenutno.';
  return `💓 Živ sam. Pratim ${count} relevantnih ponuda.\n${bestLine}`;
}
