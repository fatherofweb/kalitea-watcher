import * as cheerio from 'cheerio';
import type { RawOffer, TransportType } from '../core/types.js';
import type { SourceAdapter } from './types.js';
import { fetchHtml } from './http.js';

const LISTING_URL = 'https://hellenatravel.rs/last-minute-ponude';

// Čist kartični izvor: data-mesto / data-termin (već ISO) / data-nocenja, cena PO OSOBI,
// tip 1/2 direktno, prevoz u tekstu kartice. Nema Kalitea ponuda uvek — široki „čekač".

export interface HellenaCard {
  mesto: string;
  villa: string;
  dateFrom: string;
  nights: number;
  units: { unitType: string; price: number }[];
  transport: TransportType;
  url: string;
}

function addNights(isoFrom: string, nights: number): string {
  const t = Date.parse(isoFrom);
  if (Number.isNaN(t) || nights <= 0) return '';
  return new Date(t + nights * 86400000).toISOString().slice(0, 10);
}

export function parseCards(html: string): HellenaCard[] {
  const $ = cheerio.load(html);
  const cards: HellenaCard[] = [];
  $('.destination-item[data-mesto]').each((_, el) => {
    const $card = $(el);
    const mesto = ($card.attr('data-mesto') ?? '').trim();
    const dateFrom = ($card.attr('data-termin') ?? '').trim();
    const nights = Number($card.attr('data-nocenja') ?? '0');
    const $a = $card.find('h3 a').first();
    const title = $a.text().trim();
    const villa = (title.split('/')[0] ?? title).trim();
    const url = $a.attr('href') ?? LISTING_URL;
    const content = $card.find('.destination-content').text().replace(/\s+/g, ' ');
    const units: { unitType: string; price: number }[] = [];
    for (const m of content.matchAll(/(1\/\d)\s*(?:\([^)]*\))?\s*-?\s*(\d{2,4})\s*€/g)) {
      units.push({ unitType: m[1]!, price: Number(m[2]) });
    }
    const transport: TransportType = /sopstveni/i.test(content)
      ? 'own'
      : /autobus/i.test(content)
        ? 'package'
        : 'own';
    cards.push({ mesto, villa, dateFrom, nights, units, transport, url });
  });
  return cards;
}

export function cardsToOffers(cards: HellenaCard[]): RawOffer[] {
  const offers: RawOffer[] = [];
  for (const c of cards) {
    for (const u of c.units) {
      offers.push({
        source: 'hellenatravel',
        villa: c.villa,
        unitType: u.unitType,
        dateFrom: c.dateFrom,
        dateTo: addNights(c.dateFrom, c.nights),
        nights: c.nights,
        pricePerPerson: u.price,
        transportType: c.transport,
        isPackage: c.transport === 'package',
        url: c.url,
      });
    }
  }
  return offers;
}

export const hellenatravel: SourceAdapter = {
  id: 'hellenatravel',
  async run(): Promise<RawOffer[]> {
    const html = await fetchHtml(LISTING_URL);
    const cards = parseCards(html);
    if (cards.length === 0) throw new Error('0 kartica (markup?)');
    const kalitea = cards.filter((c) => /kalitea/i.test(c.mesto) || /kalitea/i.test(c.villa));
    return cardsToOffers(kalitea);
  },
};
