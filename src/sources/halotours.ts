import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { RawOffer } from '../core/types.js';
import type { SourceAdapter } from './types.js';
import { fetchHtml } from './http.js';
import { parseSerbianDate } from '../core/dates.js';

const LISTING_URL = 'https://www.halotours.rs/aranzman/kalitea-letovanje/';
const YEAR = 2026;

// Pozicijska cenovna matrica (mesec × tip jedinice). Baza = AUTOBUS, cena po osobi.
// Jedinice: S2 = dvokrevetni studio (= "1/2"), S3→1/3, S4→1/4.
// ZAŠTITA: preskačemo "Cena zakupa apartmana SOPSTVENI PREVOZ" tabelu (cena je za ceo
// apartman, ne po osobi) — inače bi cene bile pogrešne. Autobus cena se jasno označi.

function cellText($: CheerioAPI, td: AnyNode): string {
  return $(td).text().replace(/\s+/g, ' ').trim();
}

function toInt(text: string): number {
  const n = parseInt(text.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function nightsBetween(from: string, to: string): number {
  const d = (Date.parse(to) - Date.parse(from)) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}

const UNIT_MAP: Record<string, string> = { S2: '1/2', S3: '1/3', S4: '1/4' };

export function parseDetail(html: string, url: string): RawOffer[] {
  const $ = cheerio.load(html);
  const offers: RawOffer[] = [];

  const tables = $('table').toArray();
  for (const table of tables) {
    if (offers.length > 0) break; // parsiraj samo PRVU cenovnu tabelu (= autobuska)
    const tableText = $(table).text();
    const headingBefore = $(table).prevUntil('table').text();
    // preskoči "Cena zakupa apartmana" tabelu (cena za ceo apartman, ne po osobi)
    if (/zakup|po studiju|apartmanu/i.test(tableText + ' ' + headingBefore)) continue;

    const $rows = $(table).find('tr');
    let villa = 'Nepoznata vila';
    let periods: { from: string; to: string }[] = [];
    const unitRows: AnyNode[] = [];

    $rows.each((_i, row) => {
      const cells = $(row).find('td, th').toArray();
      const texts = cells.map((c) => cellText($, c));
      const first = texts[0] ?? '';
      if (/^vila\b/i.test(first)) villa = first;
      if (/^boravak/i.test(first)) {
        periods = texts
          .map((t) => t.match(/(\d{1,2}\.\d{1,2}\.?)\s+(\d{1,2}\.\d{1,2}\.?)/))
          .map((m) => (m ? { from: m[1]!, to: m[2]! } : null))
          .filter((x): x is { from: string; to: string } => x !== null);
      } else if (texts.some((t) => /^S[234]$/.test(t))) {
        unitRows.push(row);
      }
    });

    if (periods.length === 0 || unitRows.length === 0) continue;

    for (const row of unitRows) {
      const cells = $(row).find('td, th').toArray();
      const texts = cells.map((c) => cellText($, c));
      const unitCode = texts.find((t) => /^S[234]$/.test(t));
      if (!unitCode) continue;
      const unitType = UNIT_MAP[unitCode]!;
      // desno-poravnanje: poslednjih N ćelija = cene za N perioda
      const priceCells = texts.slice(texts.length - periods.length);
      for (let j = 0; j < periods.length; j++) {
        const price = toInt(priceCells[j] ?? '');
        if (price <= 0) continue;
        let dateFrom: string;
        let dateTo: string;
        try {
          dateFrom = parseSerbianDate(periods[j]!.from, YEAR);
          dateTo = parseSerbianDate(periods[j]!.to, YEAR);
        } catch {
          continue;
        }
        offers.push({
          source: 'halotours',
          villa,
          unitType,
          dateFrom,
          dateTo,
          nights: nightsBetween(dateFrom, dateTo),
          pricePerPerson: price,
          transportType: 'package', // autobuska baza — sopstveni se proverava u programu
          isPackage: true,
          url,
        });
      }
    }
  }

  return offers;
}

export const halotours: SourceAdapter = {
  id: 'halotours',
  async run(): Promise<RawOffer[]> {
    const html = await fetchHtml(LISTING_URL);
    const offers = parseDetail(html, LISTING_URL);
    if (offers.length === 0) throw new Error('0 offers parsed (markup?)');
    return offers;
  },
};
