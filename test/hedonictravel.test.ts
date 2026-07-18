import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseGrid, parseDetail } from '../src/sources/hedonictravel.js';

const grid = readFileSync('test/fixtures/hedonic-listing.html', 'utf-8');
const detail = readFileSync('test/fixtures/hedonic-detail.html', 'utf-8');

test('parseGrid returns villa detail URLs', () => {
  const urls = parseGrid(grid);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((u) => /\/sr\/letovanje\/[a-z0-9-]+\/\d+$/i.test(u))).toBe(true);
  expect(urls).toContain('https://www.hedonictravel.rs/sr/letovanje/vila-golden-sun/5580');
});

test('parseDetail extracts 1/2 offers with derived sopstveni price', () => {
  const url = 'https://www.hedonictravel.rs/sr/letovanje/vila-golden-sun/5580';
  const offers = parseDetail(detail, url);
  expect(offers.length).toBeGreaterThan(0);
  for (const o of offers) {
    expect(o.source).toBe('hedonictravel');
    expect(o.unitType).toBe('1/2');
    expect(o.transportType).toBe('own');
    expect(o.villa).toMatch(/golden sun/i);
    expect(o.pricePerPerson).toBeGreaterThan(0);
    expect(o.dateFrom).toMatch(/^2026-\d\d-\d\d$/);
  }
});

test('takes NEW (red) price on a discounted term, not the struck-out old one', () => {
  const url = 'https://www.hedonictravel.rs/sr/letovanje/vila-golden-sun/5580';
  const offers = parseDetail(detail, url);
  // 1/2 STD, termin 04.07→14.07: stara [430] precrtana, nova CRVENA 299 → akcija → -20 = 279
  const jul04 = offers.find((o) => o.dateFrom === '2026-07-04' && o.dateTo === '2026-07-14');
  expect(jul04).toBeDefined();
  expect(jul04!.pricePerPerson).toBe(279); // 299 (nova crvena, ne precrtana 430) − 20 (akcija)
  // normalan termin 04.06→14.06: 245 (bez akcije) → -30 = 215
  const jun04 = offers.find((o) => o.dateFrom === '2026-06-04' && o.dateTo === '2026-06-14');
  expect(jun04).toBeDefined();
  expect(jun04!.pricePerPerson).toBe(215);
});
