import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCategory, parseDetail } from '../src/sources/oktopod.js';

const category = readFileSync('test/fixtures/oktopod-category.html', 'utf-8');
const detail = readFileSync('test/fixtures/oktopod-detail.html', 'utf-8');

test('parseCategory returns Halkidiki villa URLs, excludes Rodos/Faliraki + hotels', () => {
  const urls = parseCategory(category);
  expect(urls.length).toBeGreaterThanOrEqual(4);
  expect(urls.every((u) => /\/sr\/putovanje\/vila-[a-z0-9-]*kalitea/i.test(u))).toBe(true);
  expect(urls.some((u) => /faliraki|rodos/i.test(u))).toBe(false);
  expect(urls).toContain('https://www.oktopod.rs/sr/putovanje/vila-ava-luxury-kalitea/7119');
});

test('parseDetail extracts 1/2 offers with derived sopstveni price', () => {
  const url = 'https://www.oktopod.rs/sr/putovanje/vila-ava-luxury-kalitea/7119';
  const offers = parseDetail(detail, url);
  expect(offers.length).toBeGreaterThan(0);
  for (const o of offers) {
    expect(o.source).toBe('oktopod');
    expect(o.unitType).toBe('1/2');
    expect(o.transportType).toBe('own');
    expect(o.villa).toMatch(/ava luxury/i);
    expect(o.nights).toBeGreaterThan(0);
    expect(o.pricePerPerson).toBeGreaterThan(0);
    expect(o.dateFrom).toMatch(/^2026-\d\d-\d\d$/);
  }
});

test('applies -30 sopstveni rule for non-starred, none for starred', () => {
  const url = 'https://www.oktopod.rs/sr/putovanje/vila-ava-luxury-kalitea/7119';
  const offers = parseDetail(detail, url);
  // 1/2 STD: 04.06.-14.06. = 295 (bez *) → sopstveni 265; 25.05.-04.06. = 225* → 225 (bez umanjenja)
  const june = offers.find((o) => o.dateFrom === '2026-06-04');
  expect(june).toBeDefined();
  expect(june!.pricePerPerson).toBe(265); // 295 - 30
  expect(june!.nights).toBe(10);
  const mayStar = offers.find((o) => o.dateFrom === '2026-05-25');
  expect(mayStar).toBeDefined();
  expect(mayStar!.pricePerPerson).toBe(225); // * → bez umanjenja
  expect(mayStar!.isPackage).toBe(true);
});
