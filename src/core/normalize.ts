import type { RawOffer, NormalizedOffer } from './types.js';

export function villaKey(villa: string): string {
  return villa
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ukloni kombinujuće dijakritike (č/ć/š/ž → c/c/s/z)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D') // d sa crtom se NE razlaže kroz NFD — mapiraj ručno
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function pppPerNight(pricePerPerson: number, nights: number): number {
  if (nights <= 0) return pricePerPerson;
  return Math.round((pricePerPerson / nights) * 100) / 100;
}

export function dedupKey(o: {
  villaKey: string;
  unitType: string;
  dateFrom: string;
  dateTo: string;
  transportType: string;
}): string {
  return [o.villaKey, o.unitType, o.dateFrom, o.dateTo, o.transportType].join('|');
}

export function normalize(raw: RawOffer): NormalizedOffer {
  const vk = villaKey(raw.villa);
  return {
    ...raw,
    villaKey: vk,
    pppPerNight: pppPerNight(raw.pricePerPerson, raw.nights),
    dedupKey: dedupKey({ ...raw, villaKey: vk }),
  };
}
