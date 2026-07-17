import * as cheerio from 'cheerio';
import type { RawOffer } from '../core/types.js';
import type { SourceAdapter } from './types.js';
import { fetchHtml, jitterDelay } from './http.js';
import { parseDepartures } from '../core/dates.js';

const BASE = 'https://www.lastminuteponude.com';
const YEAR = 2026;

// Više Kalitea listing stranica; dedup preko svih hvata preklapanja.
const LISTING_PATHS = [
  '/Grčka/Kalitea',
  '/last-minute/Grčka/Kalitea',
  '/Grčka/Kalitea/Automobilom',
];

function toInt(text: string): number {
  const n = parseInt(text.replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function addNights(isoFrom: string, nights: number): string {
  const t = Date.parse(isoFrom);
  if (Number.isNaN(t) || nights <= 0) return '';
  const d = new Date(t + nights * 86400000);
  return d.toISOString().slice(0, 10);
}

/**
 * Parsira teaser kartice (`ponuda_rezultat_<id>`) sa Kalitea listinga.
 * Kartica daje: vila, agencija, tip 1/2, broj noćenja, datum polaska, cena/os, link.
 * Napomena: prikazana cena je često autobuski prevoz — `transportType` se detektuje
 * iz opisa, a precizan sopstveni cenovnik je u programu putovanja (izvan HTML-a).
 */
export function parseListing(html: string): RawOffer[] {
  const $ = cheerio.load(html);
  const offers: RawOffer[] = [];

  $('li[id^="ponuda_rezultat_"]').each((_, el) => {
    const $card = $(el);

    const link = $card.find('ul.head a[href*="leto-2026-letovanje"]').first().attr('href') ?? '';
    if (!link) return;
    const url = (link.startsWith('http') ? link : BASE + link).split('?')[0]!;

    const place = $card.find('h4 em').first().text().trim();
    const small = $card.find('h4 small').first().text().trim();
    const desc = $card
      .find('p')
      .filter((_i, p) => !$(p).attr('class'))
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();

    // Zadrži samo Kaliteu (listing ume da ubaci unakrsno-promovisane kartice)
    if (!/kalitea/i.test(`${place} ${small} ${desc} ${url}`)) return;

    const villa = small ? small.replace(/^[-–\s]+/, '').trim() : place;

    const agencyTitle = $card.find('a[href*="turisticka-agencija"]').first().attr('title') ?? '';
    const agency = agencyTitle.replace(/^Turistička agencija\s*/i, '').trim() || 'lastminuteponude';

    const h5 = $card.find('h5').first().text().replace(/\s+/g, ' ').trim();
    const nightsM = h5.match(/(\d+)\s*no[cć]/i) ?? desc.match(/(\d+)\s*no[cć]/i);
    const nights = nightsM ? Number(nightsM[1]) : 0;

    const departureM = h5.match(/polaska:\s*([^|]+?)(?:\s*\||$)/i);
    const departure = departureM ? departureM[1]!.trim() : '';

    const unitM = desc.match(/1\/(\d)/);
    const unitType = unitM ? `1/${unitM[1]}` : '1/2';

    const priceText =
      $card.find('.new-price strong').first().text() ||
      $card.find('.price strong').first().text();
    const pricePerPerson = toInt(priceText);
    if (pricePerPerson <= 0) return;

    // Cena se odnosi na prevoz naveden u opisu (često autobus).
    const transportType = /autobus/i.test(desc)
      ? 'package'
      : /sopstveni/i.test(desc)
        ? 'own'
        : 'package';

    const villaLabel = `${villa}${agency && agency !== 'lastminuteponude' ? ` [${agency}]` : ''}`;
    // Polazak može biti višestruk ("18. i 28. jul") → jedna ponuda po datumu.
    const departures = parseDepartures(departure, YEAR);
    for (const dateFrom of departures) {
      offers.push({
        source: 'lastminuteponude',
        villa: villaLabel,
        unitType,
        dateFrom,
        dateTo: addNights(dateFrom, nights),
        nights,
        pricePerPerson,
        transportType,
        isPackage: transportType === 'package',
        url,
      });
    }
  });

  return offers;
}

export const lastminuteponude: SourceAdapter = {
  id: 'lastminuteponude',
  async run(): Promise<RawOffer[]> {
    const all: RawOffer[] = [];
    let fetched = 0;
    for (const path of LISTING_PATHS) {
      await jitterDelay();
      const html = await fetchHtml(BASE + path);
      fetched++;
      all.push(...parseListing(html));
    }
    if (fetched > 0 && all.length === 0) throw new Error('0 offers parsed (markup?)');
    return all;
  },
};
