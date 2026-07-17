import type { SourceAdapter } from './types.js';
import { lastminuteponude } from './lastminuteponude.js';
import { clocktravel } from './clocktravel.js';
import { oktopod } from './oktopod.js';
import { halotours } from './halotours.js';
import { hellenatravel } from './hellenatravel.js';

export const adapters: SourceAdapter[] = [
  lastminuteponude,
  clocktravel,
  oktopod,
  halotours,
  hellenatravel,
];
