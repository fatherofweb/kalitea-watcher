import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseListing, parseDetail } from '../src/sources/clocktravel.js';

const listing = readFileSync('test/fixtures/clocktravel-listing.html', 'utf-8');
const detail = readFileSync('test/fixtures/clocktravel-detail.html', 'utf-8');

test('parseListing returns Kalitea villa detail URLs', () => {
  const urls = parseListing(listing);
  expect(urls.length).toBeGreaterThanOrEqual(10);
  expect(urls.every((u) => /\/halkidiki\/kalithea\/[a-z0-9-]+\/$/.test(u))).toBe(true);
  expect(urls).toContain('https://clocktravel.rs/letovanje/grcka/halkidiki/kalithea/vila-anna-studios/');
});

test('parseDetail extracts 1/2 offers with derived sopstveni price', () => {
  const url = 'https://clocktravel.rs/letovanje/grcka/halkidiki/kalithea/vila-anna-studios/';
  const offers = parseDetail(detail, url);
  expect(offers.length).toBeGreaterThan(0);
  for (const o of offers) {
    expect(o.source).toBe('clocktravel');
    expect(o.unitType).toBe('1/2');
    expect(o.transportType).toBe('own'); // izvedena sopstveni cena
    expect(o.villa).toMatch(/Anna/i);
    expect(o.nights).toBe(10);
    expect(o.pricePerPerson).toBeGreaterThan(0);
    expect(o.dateFrom).toMatch(/^2026-\d\d-\d\d$/);
  }
});

test('derives action-price sopstveni correctly (99 red, action → -20 = 79)', () => {
  const url = 'https://clocktravel.rs/letovanje/grcka/halkidiki/kalithea/vila-anna-studios/';
  const offers = parseDetail(detail, url);
  // 1/2 STD, prva kolona: <del>169*</del><span red>99</span> → akcijska, -20 → 79, boravak od 22.05.
  const may22 = offers.find((o) => o.dateFrom === '2026-05-22');
  expect(may22).toBeDefined();
  expect(may22!.pricePerPerson).toBe(79);
  expect(may22!.dateTo).toBe('2026-06-01');
  expect(may22!.isPackage).toBe(true); // zvezdica
});
