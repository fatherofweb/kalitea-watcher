import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { RawOffer, TransportType } from '../core/types.js';
import type { SourceAdapter } from './types.js';
import { fetchHtml } from './http.js';
import { parseSerbianDate } from '../core/dates.js';

const LISTING_URL = 'https://hellenatravel.rs/last-minute-ponude';
const DEST_URL = 'https://hellenatravel.rs/grcka-apartmani/kalitea';
const YEAR = 2026;

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

function cellText($: CheerioAPI, td: AnyNode): string {
  return $(td).text().replace(/\s+/g, ' ').trim();
}

function toInt(text: string): number {
  const n = parseInt(text.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// Ako je cena snižena: stara je precrtana (<del>/<s>/<strike>), nova je aktuelna.
// Vraća AKTUELNU (novu) cenu + da li je snižena + da li ima zvezdicu.
function parsePriceCell($: CheerioAPI, td: AnyNode): { current: number; isStarred: boolean } | null {
  const $td = $(td);
  const full = $td.text().replace(/\s+/g, ' ').trim();
  if (!full || full === '-' || !/\d/.test(full)) return null;
  const isStarred = full.includes('*');
  // ukloni precrtani (stari) tekst → ostaje nova cena
  const $clone = $td.clone();
  $clone.find('del, s, strike').remove();
  const current = toInt($clone.text());
  if (current > 0) return { current, isStarred };
  // ako je sve bilo u precrtanom, uzmi prvi broj iz punog teksta
  const any = toInt(full);
  return any > 0 ? { current: any, isStarred } : null;
}

// Destinacijska strana: sezonski cenovnik po vili (Vila Beyond Atlantis…).
// TIP/STRUKTURA × termin. 1/2 = dvokrevetni. Cena = smeštaj po osobi, sopstveni prevoz
// (bus se ne pominje). Snižene cene: precrtana stara + nova → uzima novu.
export function parseDestination(html: string): RawOffer[] {
  const $ = cheerio.load(html);
  const offers: RawOffer[] = [];

  $('table').each((_, table) => {
    const $rows = $(table).find('tr');
    let villa = 'Nepoznata vila';
    let periods: { from: string; to: string }[] = [];
    const unitRows: AnyNode[] = [];

    $rows.each((_i, row) => {
      const cells = $(row).find('td, th').toArray();
      const texts = cells.map((c) => cellText($, c));
      const first = texts[0] ?? '';
      if (cells.length <= 2 && /\/\s*kalitea/i.test(first)) {
        villa = (first.split('/')[0] ?? first).trim();
      } else if (/tip\s*\/\s*struktura/i.test(first)) {
        periods = texts
          .map((t) => t.match(/(\d{1,2}\.\d{1,2})\.?\s+(\d{1,2}\.\d{1,2})/))
          .map((m) => (m ? { from: m[1]!, to: m[2]! } : null))
          .filter((x): x is { from: string; to: string } => x !== null);
      } else if (/^\s*1\/2\b/.test(first)) {
        unitRows.push(row);
      }
    });

    if (periods.length === 0 || unitRows.length === 0) return;

    for (const row of unitRows) {
      const cells = $(row).find('td, th').toArray();
      const priceCells = cells.slice(cells.length - periods.length);
      for (let j = 0; j < periods.length; j++) {
        const price = parsePriceCell($, priceCells[j]!);
        if (!price) continue;
        let dateFrom: string;
        let dateTo: string;
        try {
          dateFrom = parseSerbianDate(periods[j]!.from, YEAR);
          dateTo = parseSerbianDate(periods[j]!.to, YEAR);
        } catch {
          continue;
        }
        const nights = Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000);
        offers.push({
          source: 'hellenatravel',
          villa,
          unitType: '1/2',
          dateFrom,
          dateTo,
          nights: nights > 0 ? nights : 0,
          pricePerPerson: price.current,
          transportType: 'own', // smeštaj, bus se ne pominje — proveri prevoz u agenciji
          isPackage: price.isStarred,
          url: DEST_URL,
        });
      }
    }
  });

  return offers;
}

export const hellenatravel: SourceAdapter = {
  id: 'hellenatravel',
  async run(): Promise<RawOffer[]> {
    // Primarno: destinacijska strana (Vila Beyond Atlantis cenovnik).
    const destHtml = await fetchHtml(DEST_URL);
    const offers = parseDestination(destHtml);
    // Dodatno (best-effort): last-minute lista kao široki čekač za Kaliteu.
    try {
      const cards = parseCards(await fetchHtml(LISTING_URL));
      const kalitea = cards.filter((c) => /kalitea/i.test(c.mesto) || /kalitea/i.test(c.villa));
      offers.push(...cardsToOffers(kalitea));
    } catch (e) {
      console.error(`[hellenatravel] last-minute lista: ${String(e)}`);
    }
    if (offers.length === 0 && !/tip\s*\/\s*struktura/i.test(destHtml)) {
      throw new Error('0 offers + nema cenovnik strukture (markup?)');
    }
    return offers;
  },
};
