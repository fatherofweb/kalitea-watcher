import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { RawOffer } from '../core/types.js';
import type { SourceAdapter } from './types.js';
import { fetchHtml, jitterDelay } from './http.js';
import { parseSerbianDate } from '../core/dates.js';

const BASE = 'https://www.oktopod.rs';
const CATEGORY_URL = `${BASE}/sr/kalitea/578`;
const YEAR = 2026;

// Kalitea (Halkidiki) vile su na detalj-stranama (matrica CSSTableGenerator).
// Baza = autobuski paket; sopstveni = baza − 30€ (termini sa `*` NEMAJU umanjenje).
// PAŽNJA: "Kalithea" postoji i na Rodosu (Faliraki) — filtriramo samo Halkidiki vile.

export function parseCategory(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href*="/sr/putovanje/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const m = href.match(/^\/sr\/putovanje\/(vila-[a-z0-9-]*kalitea[a-z0-9-]*\/\d+)$/i);
    if (!m) return;
    if (/faliraki|rodos/i.test(href)) return; // Rodos, ne Halkidiki
    urls.add(`${BASE}/sr/putovanje/${m[1]}`);
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

function nightsBetween(from: string, to: string): number {
  const d = (Date.parse(to) - Date.parse(from)) / 86400000;
  return d > 0 ? Math.round(d) : 0;
}

export function parseDetail(html: string, url: string): RawOffer[] {
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text();
  // sigurnosni filter: preskoči Rodos/Faliraki, zahtevaj Kaliteu
  if (/faliraki|rodos/i.test(h1) || !/kalitea/i.test(h1)) return [];
  const villa = (h1.split('/')[0] ?? '').trim() || 'Nepoznata vila';

  const offers: RawOffer[] = [];

  $('table.CSSTableGenerator').each((_, table) => {
    const $rows = $(table).find('tr');
    let periods: { from: string; to: string }[] = [];
    const unitRows: AnyNode[] = [];

    $rows.each((_i, row) => {
      const cells = $(row).find('td, th').toArray();
      const texts = cells.map((c) => cellText($, c));
      // datumski red: većina ćelija je "DD.MM. DD.MM."
      const dateCells = texts.map((t) => t.match(/(\d{1,2}\.\d{1,2}\.?)\s+(\d{1,2}\.\d{1,2}\.?)/));
      const dateCount = dateCells.filter(Boolean).length;
      if (dateCount >= 2 && dateCount >= texts.length / 2) {
        periods = dateCells
          .map((m) => (m ? { from: m[1]!, to: m[2]! } : null))
          .filter((x): x is { from: string; to: string } => x !== null);
      } else if (texts[0] && /^\s*1\/2\b/.test(texts[0])) {
        unitRows.push(row);
      }
    });

    if (periods.length === 0 || unitRows.length === 0) return;

    for (const row of unitRows) {
      const cells = $(row).find('td, th').toArray();
      // desno-poravnanje: poslednjih N ćelija = cene za N perioda
      const priceCells = cells.slice(cells.length - periods.length);
      for (let j = 0; j < periods.length; j++) {
        const raw = cellText($, priceCells[j]!);
        if (!raw || raw === '-' || !/\d/.test(raw)) continue;
        const isStarred = raw.includes('*');
        const base = toInt(raw);
        if (base <= 0) continue;
        let dateFrom: string;
        let dateTo: string;
        try {
          dateFrom = parseSerbianDate(periods[j]!.from, YEAR);
          dateTo = parseSerbianDate(periods[j]!.to, YEAR);
        } catch {
          continue;
        }
        // `*` termini nemaju umanjenje za sopstveni
        const ownPrice = isStarred ? base : base - 30;
        if (ownPrice <= 0) continue;
        offers.push({
          source: 'oktopod',
          villa,
          unitType: '1/2',
          dateFrom,
          dateTo,
          nights: nightsBetween(dateFrom, dateTo),
          pricePerPerson: ownPrice,
          transportType: 'own',
          isPackage: isStarred,
          url,
        });
      }
    }
  });

  return offers;
}

export const oktopod: SourceAdapter = {
  id: 'oktopod',
  async run(): Promise<RawOffer[]> {
    const categoryHtml = await fetchHtml(CATEGORY_URL);
    const villaUrls = parseCategory(categoryHtml);
    if (villaUrls.length === 0) throw new Error('0 Kalitea vila u kategoriji (markup?)');
    const all: RawOffer[] = [];
    for (const villaUrl of villaUrls) {
      await jitterDelay();
      try {
        const detailHtml = await fetchHtml(villaUrl);
        all.push(...parseDetail(detailHtml, villaUrl));
      } catch (e) {
        console.error(`[oktopod] detail fail ${villaUrl}: ${String(e)}`);
      }
    }
    return all;
  },
};
