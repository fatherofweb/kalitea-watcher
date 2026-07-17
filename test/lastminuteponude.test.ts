import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseListing } from '../src/sources/lastminuteponude.js';

const listing = readFileSync('test/fixtures/lmp-listing.html', 'utf-8');

test('parseListing extracts Kalitea teaser cards with valid fields', () => {
  const offers = parseListing(listing);
  expect(offers.length).toBeGreaterThan(0);
  for (const o of offers) {
    expect(o.source).toBe('lastminuteponude');
    expect(o.villa.length).toBeGreaterThan(0);
    expect(o.unitType).toMatch(/^1\/\d$/);
    expect(o.pricePerPerson).toBeGreaterThan(0);
    expect(o.url).toContain('/Kalitea/');
    expect(o.url.startsWith('https://')).toBe(true);
  }
});

test('parses the Aparthotel Oceanis (Mayak) card correctly', () => {
  const offers = parseListing(listing);
  const oceanis = offers.find((o) => /oceanis/i.test(o.villa));
  expect(oceanis).toBeDefined();
  expect(oceanis!.pricePerPerson).toBe(249);
  expect(oceanis!.nights).toBe(10);
  expect(oceanis!.unitType).toBe('1/2');
  expect(oceanis!.dateFrom).toBe('2026-07-19');
  expect(oceanis!.dateTo).toBe('2026-07-29');
  expect(oceanis!.villa).toMatch(/Mayak/i); // agencija u zagradi
  // Cena u opisu je autobuski prevoz → package (klasična "zamka")
  expect(oceanis!.transportType).toBe('package');
  expect(oceanis!.url).toContain('/21048');
});
