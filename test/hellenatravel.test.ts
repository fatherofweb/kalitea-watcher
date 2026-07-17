import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCards, cardsToOffers } from '../src/sources/hellenatravel.js';

const listing = readFileSync('test/fixtures/hellenatravel-listing.html', 'utf-8');

test('parseCards extracts many cards with ISO date, nights, per-person units', () => {
  const cards = parseCards(listing);
  expect(cards.length).toBeGreaterThan(50);
  const valentina = cards.find((c) => /valentina/i.test(c.villa));
  expect(valentina).toBeDefined();
  expect(valentina!.mesto).toBe('Paralia');
  expect(valentina!.dateFrom).toBe('2026-07-18');
  expect(valentina!.nights).toBe(5);
  expect(valentina!.units.some((u) => u.unitType === '1/2' && u.price === 115)).toBe(true);
});

test('cardsToOffers flattens units into RawOffers with computed dateTo', () => {
  const cards = parseCards(listing).filter((c) => /valentina/i.test(c.villa));
  const offers = cardsToOffers(cards);
  const u12 = offers.find((o) => o.unitType === '1/2');
  expect(u12).toBeDefined();
  expect(u12!.source).toBe('hellenatravel');
  expect(u12!.dateFrom).toBe('2026-07-18');
  expect(u12!.dateTo).toBe('2026-07-23'); // +5 noći
  expect(u12!.pricePerPerson).toBe(115);
});

test('Kalitea filter yields none today but parser is ready', () => {
  const cards = parseCards(listing);
  const kalitea = cards.filter((c) => /kalitea/i.test(c.mesto));
  expect(kalitea.length).toBe(0); // trenutno nema — čekač spreman
});
