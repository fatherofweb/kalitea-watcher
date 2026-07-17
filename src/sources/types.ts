import type { RawOffer } from '../core/types.js';

export interface SourceAdapter {
  id: string;
  run(): Promise<RawOffer[]>;
}
