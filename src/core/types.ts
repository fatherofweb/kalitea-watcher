export type TransportType = 'own' | 'package';

export interface RawOffer {
  source: string;
  villa: string;
  unitType: string; // '1/2', '1/3', '1/4'
  dateFrom: string; // ISO YYYY-MM-DD
  dateTo: string; // ISO YYYY-MM-DD
  nights: number;
  pricePerPerson: number; // EUR, sopstveni prevoz
  transportType: TransportType;
  isPackage: boolean; // termin sa '*'
  url: string;
}

export interface NormalizedOffer extends RawOffer {
  villaKey: string;
  pppPerNight: number;
  dedupKey: string;
}

export interface DedupedOffer extends NormalizedOffer {
  sources: string[]; // svi izvori koji su prijavili isti objekat
}
