import type { SourceAdapter } from './types.js';
import { lastminuteponude } from './lastminuteponude.js';
import { clocktravel } from './clocktravel.js';

export const adapters: SourceAdapter[] = [lastminuteponude, clocktravel];
