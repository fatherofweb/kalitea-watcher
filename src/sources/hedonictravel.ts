import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { RawOffer } from '../core/types.js';
import type { SourceAdapter } from './types.js';
import { fetchHtml, jitterDelay } from './http.js';
import { parseSerbianDate } from '../core/dates.js';

const BASE = 'https://www.hedonictravel.rs';
const GRID_URL = `${BASE}/sr/strana/last-minute-kalitea`;
const YEAR = 2026;

// Grid vila → detalj-strana svake vile (matrica po osobi, autobus baza).
// Snižena cena: stara je precrtana (line-through), nova je CRVENA (#ff0000) → uzima novu.
// Sopstveni = baza − 30€ (−20€ za akcijske/`*` termine). Emituje IZVEDENU sopstveni cenu.

export function parseGrid(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href*="/sr/letovanje/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/^\/sr\/letovanje\/[a-z0-9-]+\/\d+$/i);
    if (m) urls.add(BASE + href);
  });
  return [...urls];
}

function cellText($: CheerioAPI, td: AnyNode): string {
  return $(td).text().replace(/\s+/g, ' ').trim();
}

function toInt(text: string): number {
  const n = parseInt(text.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

interface PriceCell {
  current: number;
  isAction: boolean;
  isStarred: boolean;
}

function parsePriceCell($: CheerioAPI, td: AnyNode): PriceCell | null {
  const $td = $(td);
  const full = $td.text().replace(/\s+/g, ' ').trim();
  if (!full || full === '/' || !/\d/.test(full)) return null;
  const isStarred = full.includes('*');
  // nova (aktuelna) cena je crvena
  const redSpan = $td
    .find('span, strong, font')
    .filter((_, e) => /#ff0000|color:\s*red/i.test($(e).attr('style') ?? '') || ($(e).attr('color') ?? '') === '#ff0000')
    .first();
  if (redSpan.length && toInt(redSpan.text()) > 0) {
    return { current: toInt(redSpan.text()), isAction: true, isStarred };
  }
  // bez crvene: ukloni precrtanu (staru) pa uzmi ostatak
  const $clone = $td.clone();
  $clone.find('[style*="line-through"], del, s, strike').remove();
  const current = toInt($clone.text());
  if (current > 0) return { current, isAction: false, isStarred };
  return null;
}

function isDateRow(texts: string[]): boolean {
  const dates = texts.filter((t) => /^\d{1,2}\.\d{1,2}\.?$/.test(t));
  return dates.length >= 3 && dates.length >= texts.length / 2;
}

export function parseDetail(html: string, url: string): RawOffer[] {
  const $ = cheerio.load(html);
  if (!/kalitea/i.test($('h1, h2, title').text())) return []; // sigurnosni filter
  const offers: RawOffer[] = [];

  $('table').each((_, table) => {
    const $rows = $(table).find('tr');
    let villa = 'Nepoznata vila';
    const dateRows: string[][] = [];
    const unitRows: AnyNode[] = [];

    $rows.each((_i, row) => {
      const cells = $(row).find('td, th').toArray();
      const texts = cells.map((c) => cellText($, c));
      const first = texts[0] ?? '';
      if (cells.length === 1 && /^vila\b/i.test(first)) villa = first.replace(/\s+$/, '').trim();
      else if (isDateRow(texts)) dateRows.push(texts);
      else if (/^\s*1\/2\b/.test(first)) unitRows.push(row);
    });

    // prve dve datumske vrste = boravak od / boravak do
    if (dateRows.length < 2 || unitRows.length === 0) return;
    const odRow = dateRows[0]!;
    const doRow = dateRows[1]!;
    const n = Math.min(odRow.length, doRow.length);

    for (const row of unitRows) {
      const cells = $(row).find('td, th').toArray();
      const priceCells = cells.slice(cells.length - n); // desno-poravnanje
      for (let j = 0; j < n; j++) {
        const price = parsePriceCell($, priceCells[j]!);
        if (!price) continue;
        let dateFrom: string;
        let dateTo: string;
        try {
          dateFrom = parseSerbianDate(odRow[j]!, YEAR);
          dateTo = parseSerbianDate(doRow[j]!, YEAR);
        } catch {
          continue;
        }
        const nights = Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000);
        const reduction = price.isAction || price.isStarred ? 20 : 30;
        const ownPrice = price.current - reduction;
        if (ownPrice <= 0 || nights <= 0) continue;
        offers.push({
          source: 'hedonictravel',
          villa,
          unitType: '1/2',
          dateFrom,
          dateTo,
          nights,
          pricePerPerson: ownPrice,
          transportType: 'own',
          isPackage: price.isStarred,
          url,
        });
      }
    }
  });

  return offers;
}

export const hedonictravel: SourceAdapter = {
  id: 'hedonictravel',
  async run(): Promise<RawOffer[]> {
    const gridHtml = await fetchHtml(GRID_URL);
    const villaUrls = parseGrid(gridHtml);
    if (villaUrls.length === 0) throw new Error('0 vila u gridu (markup?)');
    const all: RawOffer[] = [];
    for (const villaUrl of villaUrls) {
      await jitterDelay();
      try {
        const detailHtml = await fetchHtml(villaUrl);
        all.push(...parseDetail(detailHtml, villaUrl));
      } catch (e) {
        console.error(`[hedonictravel] detail fail ${villaUrl}: ${String(e)}`);
      }
    }
    return all;
  },
};
