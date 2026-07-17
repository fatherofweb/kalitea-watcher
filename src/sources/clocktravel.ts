import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { RawOffer } from '../core/types.js';
import type { SourceAdapter } from './types.js';
import { fetchHtml, jitterDelay } from './http.js';
import { parseSerbianDate } from '../core/dates.js';

const BASE = 'https://clocktravel.rs';
const LISTING_URL = `${BASE}/letovanje/grcka/halkidiki/kalithea/`;
const YEAR = 2026;

// Detalj-strana svake Kalitea vile: category listing → linkovi ka vilama.
// Cene su matrica (termin × tip jedinice) na detalju, baza = AUTOBUS.
// Sopstveni = baza − 30€ (−20€ za akcijske crvene cene i termine sa zvezdicom *).
// Hvatamo samo 1/2 jedinice (za dvoje) i emitujemo IZVEDENU sopstveni cenu.

export function parseListing(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href*="/halkidiki/kalithea/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    // detalj vile: .../kalithea/<slug>/  (ne sama kategorija .../kalithea/)
    const m = href.match(/\/halkidiki\/kalithea\/([a-z0-9-]+)\/?$/i);
    if (!m) return;
    urls.add(`${BASE}/letovanje/grcka/halkidiki/kalithea/${m[1]}/`);
  });
  return [...urls];
}

function toInt(text: string): number {
  const n = parseInt(text.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function cellText($: CheerioAPI, td: AnyNode): string {
  return $(td).text().replace(/\s+/g, ' ').trim();
}

interface PriceCell {
  current: number;
  isAction: boolean;
  isStarred: boolean;
}

function parsePriceCell($: CheerioAPI, td: AnyNode): PriceCell | null {
  const $td = $(td);
  const raw = $td.text().replace(/\s+/g, ' ').trim();
  if (!raw || raw === '-' || !/\d/.test(raw)) return null;
  const isStarred = raw.includes('*');
  const redSpan = $td
    .find('span')
    .filter((_, s) => /color\s*:\s*#ff0000/i.test($(s).attr('style') ?? ''))
    .first();
  let current: number;
  let isAction = false;
  if (redSpan.length) {
    current = toInt(redSpan.text());
    isAction = true;
  } else {
    current = toInt(raw);
  }
  if (current <= 0) return null;
  return { current, isAction, isStarred };
}

export function parseDetail(html: string, url: string): RawOffer[] {
  const $ = cheerio.load(html);
  const villa = ($('h1').first().text().split('|')[0] ?? '').trim() || 'Nepoznata vila';
  const offers: RawOffer[] = [];

  $('table.table-striped').each((_, table) => {
    const $rows = $(table).find('tr');
    const tableText = $(table).text();
    const nightsM = tableText.match(/(\d+)\s*no[cć]/i);
    const nights = nightsM ? Number(nightsM[1]) : 0;

    let datesFrom: string[] = [];
    let datesTo: string[] = [];
    const unitRows: AnyNode[] = [];

    $rows.each((_i, row) => {
      const cells = $(row).find('td, th').toArray();
      if (cells.length < 2) return;
      const label = cellText($, cells[0]!).toLowerCase();
      if (label.startsWith('boravak od')) {
        datesFrom = cells.map((c) => cellText($, c));
      } else if (label.startsWith('boravak do')) {
        datesTo = cells.map((c) => cellText($, c));
      } else if (/^\s*1\/2\b/.test(cellText($, cells[0]!))) {
        unitRows.push(row);
      }
    });

    if (datesFrom.length === 0 || unitRows.length === 0) return;

    for (const row of unitRows) {
      const cells = $(row).find('td, th').toArray();
      for (let col = 1; col < cells.length; col++) {
        const price = parsePriceCell($, cells[col]!);
        if (!price) continue;
        const fromRaw = datesFrom[col];
        const toRaw = datesTo[col];
        if (!fromRaw) continue;
        let dateFrom: string;
        let dateTo = '';
        try {
          dateFrom = parseSerbianDate(fromRaw, YEAR);
          if (toRaw) dateTo = parseSerbianDate(toRaw, YEAR);
        } catch {
          continue;
        }
        const reduction = price.isAction || price.isStarred ? 20 : 30;
        const ownPrice = price.current - reduction;
        if (ownPrice <= 0) continue;
        offers.push({
          source: 'clocktravel',
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

export const clocktravel: SourceAdapter = {
  id: 'clocktravel',
  async run(): Promise<RawOffer[]> {
    const listingHtml = await fetchHtml(LISTING_URL);
    const villaUrls = parseListing(listingHtml);
    if (villaUrls.length === 0) throw new Error('0 vila na listingu (markup?)');
    const all: RawOffer[] = [];
    for (const villaUrl of villaUrls) {
      await jitterDelay();
      try {
        const detailHtml = await fetchHtml(villaUrl);
        all.push(...parseDetail(detailHtml, villaUrl));
      } catch (e) {
        console.error(`[clocktravel] detail fail ${villaUrl}: ${String(e)}`);
      }
    }
    return all;
  },
};
