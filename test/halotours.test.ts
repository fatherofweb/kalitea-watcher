import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDetail } from '../src/sources/halotours.js';

const listing = readFileSync('test/fixtures/halotours-listing.html', 'utf-8');

test('parseDetail extracts S2→1/2 bus offers with correct per-person prices', () => {
  const offers = parseDetail(listing, 'https://www.halotours.rs/aranzman/kalitea-letovanje/');
  expect(offers.length).toBeGreaterThan(0);
  const u12 = offers.filter((o) => o.unitType === '1/2');
  expect(u12.length).toBeGreaterThan(0);
  for (const o of u12) {
    expect(o.source).toBe('halotours');
    expect(o.transportType).toBe('package'); // autobuska baza
    expect(o.pricePerPerson).toBeGreaterThan(0);
    expect(o.dateFrom).toMatch(/^2026-\d\d-\d\d$/);
    expect(o.villa).toMatch(/grigoriou/i);
  }
  // S2 prizemlje, prvi termin 30.05.→08.06. = 179 € (iz fixture-a)
  const may30 = u12.find((o) => o.dateFrom === '2026-05-30' && o.pricePerPerson === 179);
  expect(may30).toBeDefined();
  expect(may30!.nights).toBe(9);
});

test('does not leak apartment-rental (zakup) prices as per-person', () => {
  const offers = parseDetail(listing, 'x');
  // cena zakupa celog apartmana je stotinama viša; po osobi bus cene su < 600
  expect(offers.every((o) => o.pricePerPerson < 700)).toBe(true);
});
