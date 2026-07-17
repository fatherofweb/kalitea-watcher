import type { DedupedOffer } from './types.js';

export interface OfferStateRow {
  dedupKey: string;
  lastPrice: number;
}
export interface AlertStateRow {
  dedupKey: string;
  lastAlertedPrice: number;
}
export interface Alert {
  kind: 'new' | 'price_drop';
  offer: DedupedOffer;
  previousPrice?: number;
}

export function computeAlerts(
  current: DedupedOffer[],
  offerState: Map<string, OfferStateRow>,
  alertState: Map<string, AlertStateRow>,
): Alert[] {
  const alerts: Alert[] = [];
  for (const o of current) {
    const prevState = offerState.get(o.dedupKey);
    const prevAlert = alertState.get(o.dedupKey);
    const notYetAlertedAtThisPrice = !prevAlert || o.pricePerPerson < prevAlert.lastAlertedPrice;
    if (!prevState) {
      if (notYetAlertedAtThisPrice) alerts.push({ kind: 'new', offer: o });
    } else if (o.pricePerPerson < prevState.lastPrice && notYetAlertedAtThisPrice) {
      alerts.push({ kind: 'price_drop', offer: o, previousPrice: prevState.lastPrice });
    }
  }
  return alerts;
}
