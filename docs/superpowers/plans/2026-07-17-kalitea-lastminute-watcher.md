# Kalitea Last-Minute Watcher — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scraper koji svakih 30 min prati last-minute ponude za Kaliteu (sopstveni prevoz, 1/2), snima u Supabase, i šalje Telegram alert samo na novu ponudu ili pad cene; javlja i kad izvor pukne.

**Architecture:** TypeScript job pokrenut GitHub Actions cron-om. Registry adaptera skrejpuje izvore (Cheerio), rezultati se normalizuju → dedupliciraju → uporede sa poslednjim viđenim stanjem (`offer_state`) → alertuju kroz Telegram. Per-izvor zdravlje (`source_health`) okida fail/blokada/markup-change/oporavak poruke.

**Tech Stack:** Node 20, TypeScript (strict), tsx, vitest, cheerio, @supabase/supabase-js, native fetch, Telegram Bot API, GitHub Actions.

## Global Constraints

- TypeScript `strict: true`; ESM (`"type": "module"`), relativni importi sa `.js` ekstenzijom.
- Node 20+ (native `fetch`, `AbortSignal.timeout`).
- Nijedan izvor ne ruši ostale: svaki adapter u try/catch u orkestratoru.
- Rate limit: sekvencijalno, jitter pauza 2–5s između HTTP zahteva; browser User-Agent; poštuj robots crawl-delay (≥1s).
- Prag `THRESHOLD_PPPPN` default 38 EUR — **samo ⭐ oznaka**, ne filtrira.
- Ne izmišljaj podatke: polje koje se ne parsira → izostavljeno/`null`, nikad pogađano.
- Svi novci u EUR, celobrojni; datumi ISO `YYYY-MM-DD`, godina 2026.
- Env: `SUPABASE_URL, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, THRESHOLD_PPPPN, HEARTBEAT_HOUR`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore` (postoji — dopuni), `src/.gitkeep`

**Interfaces:**
- Produces: radni `npm test`, `npm run scrape`; ESM+strict TS okruženje.

- [ ] **Step 1: package.json**

```json
{
  "name": "kalitea-watcher",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "scrape": "tsx src/index.ts",
    "scrape:dry": "DRY_RUN=1 tsx src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "cheerio": "^1.0.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^20.16.0"
  }
}
```

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 4: .env.example**

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
THRESHOLD_PPPPN=38
HEARTBEAT_HOUR=8
```

- [ ] **Step 5: Install & verify**

Run: `npm install && npm run typecheck`
Expected: instalira, `tsc` prolazi (nema fajlova još → bez grešaka).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: project scaffold (ts strict, esm, vitest)"
```

---

### Task 2: Core types + normalize

**Files:**
- Create: `src/core/types.ts`, `src/core/normalize.ts`, `src/core/dates.ts`
- Test: `test/normalize.test.ts`, `test/dates.test.ts`

**Interfaces:**
- Produces:
  - `RawOffer`, `NormalizedOffer`, `DedupedOffer`, `TransportType` (types.ts)
  - `villaKey(s): string`, `pppPerNight(price, nights): number`, `dedupKey(o): string`, `normalize(raw: RawOffer): NormalizedOffer` (normalize.ts)
  - `parseSerbianDate(s: string, year: number): string` → ISO `YYYY-MM-DD` (dates.ts)

- [ ] **Step 1: types.ts**

```ts
export type TransportType = 'own' | 'package';

export interface RawOffer {
  source: string;
  villa: string;
  unitType: string;       // '1/2', '1/3', '1/4'
  dateFrom: string;       // ISO YYYY-MM-DD
  dateTo: string;         // ISO YYYY-MM-DD
  nights: number;
  pricePerPerson: number; // EUR, sopstveni prevoz
  transportType: TransportType;
  isPackage: boolean;     // termin sa '*'
  url: string;
}

export interface NormalizedOffer extends RawOffer {
  villaKey: string;
  pppPerNight: number;
  dedupKey: string;
}

export interface DedupedOffer extends NormalizedOffer {
  sources: string[];      // svi izvori koji su prijavili isti objekat
}
```

- [ ] **Step 2: Write failing tests for dates.ts**

```ts
// test/dates.test.ts
import { expect, test } from 'vitest';
import { parseSerbianDate } from '../src/core/dates.js';

test('parses "1. avgust"', () => {
  expect(parseSerbianDate('1. avgust', 2026)).toBe('2026-08-01');
});
test('parses "24. jul"', () => {
  expect(parseSerbianDate('24. jul', 2026)).toBe('2026-07-24');
});
test('parses numeric "03.08"', () => {
  expect(parseSerbianDate('03.08', 2026)).toBe('2026-08-03');
});
test('throws on garbage', () => {
  expect(() => parseSerbianDate('xyz', 2026)).toThrow();
});
```

- [ ] **Step 3: Run — verify fail**

Run: `npx vitest run test/dates.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement dates.ts**

```ts
const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, mart: 3, april: 4, maj: 5, jun: 6,
  jul: 7, avgust: 8, septembar: 9, oktobar: 10, novembar: 11, decembar: 12,
};

export function parseSerbianDate(input: string, year: number): string {
  const s = input.trim().toLowerCase();
  // "1. avgust" / "1 avgust"
  const named = s.match(/^(\d{1,2})\.?\s+([a-zčćšđž]+)/);
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2]];
    if (month && day >= 1 && day <= 31) return iso(year, month, day);
  }
  // "03.08" / "3.8." / "03.08.2026"
  const numeric = s.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const y = numeric[3] ? Number(numeric[3]) : year;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return iso(y, month, day);
  }
  throw new Error(`Neparsabilan datum: "${input}"`);
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
```

- [ ] **Step 5: Run — verify pass**

Run: `npx vitest run test/dates.test.ts` → PASS

- [ ] **Step 6: Write failing tests for normalize.ts**

```ts
// test/normalize.test.ts
import { expect, test } from 'vitest';
import { villaKey, pppPerNight, dedupKey, normalize } from '../src/core/normalize.js';
import type { RawOffer } from '../src/core/types.js';

test('villaKey strips diacritics and lowercases', () => {
  expect(villaKey('Vila Đorđe  Studio')).toBe('vila dorde studio');
  expect(villaKey('KALITHÉA Palace')).toBe('kalithea palace');
});
test('pppPerNight', () => {
  expect(pppPerNight(380, 10)).toBe(38);
  expect(pppPerNight(266, 7)).toBeCloseTo(38, 0);
  expect(pppPerNight(100, 0)).toBe(100); // guard
});
test('dedupKey format', () => {
  expect(dedupKey({ villaKey: 'v', unitType: '1/2', dateFrom: '2026-08-01', dateTo: '2026-08-11', transportType: 'own' }))
    .toBe('v|1/2|2026-08-01|2026-08-11|own');
});
test('normalize fills derived fields', () => {
  const raw: RawOffer = { source: 's', villa: 'Vila X', unitType: '1/2', dateFrom: '2026-08-01', dateTo: '2026-08-11', nights: 10, pricePerPerson: 380, transportType: 'own', isPackage: false, url: 'u' };
  const n = normalize(raw);
  expect(n.villaKey).toBe('vila x');
  expect(n.pppPerNight).toBe(38);
  expect(n.dedupKey).toBe('vila x|1/2|2026-08-01|2026-08-11|own');
});
```

- [ ] **Step 7: Run — verify fail**

Run: `npx vitest run test/normalize.test.ts` → FAIL

- [ ] **Step 8: Implement normalize.ts**

```ts
import type { RawOffer, NormalizedOffer } from './types.js';

export function villaKey(villa: string): string {
  return villa
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
  villaKey: string; unitType: string; dateFrom: string; dateTo: string; transportType: string;
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
```

- [ ] **Step 9: Run — verify pass**

Run: `npx vitest run test/normalize.test.ts test/dates.test.ts` → PASS

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat(core): types, normalize, serbian date parsing"
```

---

### Task 3: Dedup

**Files:**
- Create: `src/core/dedupe.ts`
- Test: `test/dedup.test.ts`

**Interfaces:**
- Consumes: `NormalizedOffer`, `DedupedOffer` (Task 2)
- Produces: `dedupe(offers: NormalizedOffer[]): DedupedOffer[]`

- [ ] **Step 1: Write failing test**

```ts
// test/dedup.test.ts
import { expect, test } from 'vitest';
import { dedupe } from '../src/core/dedupe.js';
import type { NormalizedOffer } from '../src/core/types.js';

const base: Omit<NormalizedOffer, 'source' | 'pricePerPerson'> = {
  villa: 'Vila X', villaKey: 'vila x', unitType: '1/2',
  dateFrom: '2026-08-01', dateTo: '2026-08-11', nights: 10,
  transportType: 'own', isPackage: false, url: 'u', pppPerNight: 0,
  dedupKey: 'vila x|1/2|2026-08-01|2026-08-11|own',
};

test('collapses same key, keeps cheapest, merges sources', () => {
  const offers: NormalizedOffer[] = [
    { ...base, source: 'A', pricePerPerson: 400, pppPerNight: 40 },
    { ...base, source: 'B', pricePerPerson: 380, pppPerNight: 38 },
  ];
  const out = dedupe(offers);
  expect(out).toHaveLength(1);
  expect(out[0]!.pricePerPerson).toBe(380);
  expect(out[0]!.sources.sort()).toEqual(['A', 'B']);
});

test('different keys stay separate', () => {
  const offers: NormalizedOffer[] = [
    { ...base, source: 'A', pricePerPerson: 380, pppPerNight: 38 },
    { ...base, source: 'A', pricePerPerson: 380, pppPerNight: 38, dateTo: '2026-08-08', dedupKey: 'vila x|1/2|2026-08-01|2026-08-08|own' },
  ];
  expect(dedupe(offers)).toHaveLength(2);
});
```

- [ ] **Step 2: Run — verify fail** → `npx vitest run test/dedup.test.ts` → FAIL

- [ ] **Step 3: Implement dedupe.ts**

```ts
import type { NormalizedOffer, DedupedOffer } from './types.js';

export function dedupe(offers: NormalizedOffer[]): DedupedOffer[] {
  const map = new Map<string, DedupedOffer>();
  for (const o of offers) {
    const existing = map.get(o.dedupKey);
    if (!existing) {
      map.set(o.dedupKey, { ...o, sources: [o.source] });
      continue;
    }
    const sources = existing.sources.includes(o.source)
      ? existing.sources
      : [...existing.sources, o.source];
    if (o.pricePerPerson < existing.pricePerPerson) {
      map.set(o.dedupKey, { ...o, sources });
    } else {
      existing.sources = sources;
    }
  }
  return [...map.values()];
}
```

- [ ] **Step 4: Run — verify pass** → PASS

- [ ] **Step 5: Commit** → `git add -A && git commit -m "feat(core): dedupe by key, cheapest wins, merge sources"`

---

### Task 4: Diff (alerts) + threshold

**Files:**
- Create: `src/core/diff.ts`, `src/core/threshold.ts`
- Test: `test/diff.test.ts`, `test/threshold.test.ts`

**Interfaces:**
- Consumes: `DedupedOffer` (Task 2)
- Produces:
  - `isRelevant(o): boolean`, `isBelowThreshold(o, threshold): boolean` (threshold.ts)
  - `OfferStateRow {dedupKey, lastPrice}`, `AlertStateRow {dedupKey, lastAlertedPrice}`, `Alert {kind:'new'|'price_drop', offer, previousPrice?}`, `computeAlerts(current, offerState, alertState): Alert[]` (diff.ts)

- [ ] **Step 1: threshold tests**

```ts
// test/threshold.test.ts
import { expect, test } from 'vitest';
import { isRelevant, isBelowThreshold } from '../src/core/threshold.js';
import type { DedupedOffer } from '../src/core/types.js';

const o = (p: Partial<DedupedOffer>): DedupedOffer => ({
  source: 's', sources: ['s'], villa: 'V', villaKey: 'v', unitType: '1/2',
  dateFrom: '2026-08-01', dateTo: '2026-08-11', nights: 10, pricePerPerson: 380,
  pppPerNight: 38, transportType: 'own', isPackage: false, url: 'u', dedupKey: 'k', ...p,
});

test('relevant = own + 1/2', () => {
  expect(isRelevant(o({}))).toBe(true);
  expect(isRelevant(o({ transportType: 'package' }))).toBe(false);
  expect(isRelevant(o({ unitType: '1/3' }))).toBe(false);
});
test('below threshold', () => {
  expect(isBelowThreshold(o({ pppPerNight: 37 }), 38)).toBe(true);
  expect(isBelowThreshold(o({ pppPerNight: 38 }), 38)).toBe(false);
});
```

- [ ] **Step 2: Run — fail; implement threshold.ts**

```ts
import type { DedupedOffer } from './types.js';

export function isRelevant(o: DedupedOffer): boolean {
  return o.transportType === 'own' && o.unitType === '1/2';
}

export function isBelowThreshold(o: DedupedOffer, threshold: number): boolean {
  return o.pppPerNight < threshold;
}
```

Run: `npx vitest run test/threshold.test.ts` → PASS

- [ ] **Step 3: diff tests**

```ts
// test/diff.test.ts
import { expect, test } from 'vitest';
import { computeAlerts } from '../src/core/diff.js';
import type { DedupedOffer } from '../src/core/types.js';

const o = (p: Partial<DedupedOffer>): DedupedOffer => ({
  source: 's', sources: ['s'], villa: 'V', villaKey: 'v', unitType: '1/2',
  dateFrom: '2026-08-01', dateTo: '2026-08-11', nights: 10, pricePerPerson: 380,
  pppPerNight: 38, transportType: 'own', isPackage: false, url: 'u', dedupKey: 'k1', ...p,
});

test('new offer alerts when unseen', () => {
  const alerts = computeAlerts([o({})], new Map(), new Map());
  expect(alerts).toHaveLength(1);
  expect(alerts[0]!.kind).toBe('new');
});
test('unchanged offer does not alert', () => {
  const state = new Map([['k1', { dedupKey: 'k1', lastPrice: 380 }]]);
  const alertState = new Map([['k1', { dedupKey: 'k1', lastAlertedPrice: 380 }]]);
  expect(computeAlerts([o({})], state, alertState)).toHaveLength(0);
});
test('price drop alerts', () => {
  const state = new Map([['k1', { dedupKey: 'k1', lastPrice: 400 }]]);
  const alerts = computeAlerts([o({ pricePerPerson: 380 })], state, new Map());
  expect(alerts).toHaveLength(1);
  expect(alerts[0]!.kind).toBe('price_drop');
  expect(alerts[0]!.previousPrice).toBe(400);
});
test('no re-alert at already-alerted price', () => {
  const state = new Map([['k1', { dedupKey: 'k1', lastPrice: 400 }]]);
  const alertState = new Map([['k1', { dedupKey: 'k1', lastAlertedPrice: 380 }]]);
  expect(computeAlerts([o({ pricePerPerson: 380 })], state, alertState)).toHaveLength(0);
});
```

- [ ] **Step 4: Run — fail; implement diff.ts**

```ts
import type { DedupedOffer } from './types.js';

export interface OfferStateRow { dedupKey: string; lastPrice: number; }
export interface AlertStateRow { dedupKey: string; lastAlertedPrice: number; }
export interface Alert { kind: 'new' | 'price_drop'; offer: DedupedOffer; previousPrice?: number; }

export function computeAlerts(
  current: DedupedOffer[],
  offerState: Map<string, OfferStateRow>,
  alertState: Map<string, AlertStateRow>,
): Alert[] {
  const alerts: Alert[] = [];
  for (const o of current) {
    const prevState = offerState.get(o.dedupKey);
    const prevAlert = alertState.get(o.dedupKey);
    const notYetAlertedAtThisPrice = !prevAlert || o.pricePerPerson < prevAlert.lastAlertedPrice;
    if (!prevState) {
      if (notYetAlertedAtThisPrice) alerts.push({ kind: 'new', offer: o });
    } else if (o.pricePerPerson < prevState.lastPrice && notYetAlertedAtThisPrice) {
      alerts.push({ kind: 'price_drop', offer: o, previousPrice: prevState.lastPrice });
    }
  }
  return alerts;
}
```

Run: `npx vitest run test/diff.test.ts` → PASS

- [ ] **Step 5: Commit** → `git add -A && git commit -m "feat(core): threshold + alert diff (new + price drops, anti-spam)"`

---

### Task 5: Supabase schema + store modules

**Files:**
- Create: `supabase/schema.sql`, `src/store/supabase.ts`, `src/store/snapshot.ts`, `src/store/offerState.ts`, `src/store/alertState.ts`, `src/store/health.ts`
- Test: `test/health.test.ts`

**Interfaces:**
- Consumes: `DedupedOffer`, `OfferStateRow`, `AlertStateRow` (Tasks 2/4)
- Produces:
  - `supa()` → SupabaseClient singleton
  - `createRun(): Promise<number>`, `insertOffers(runId, offers): Promise<void>`, `finishRun(runId, {sourcesOk, sourcesFailed, offersCount})` (snapshot.ts)
  - `loadOfferState(): Promise<Map<string, OfferStateRow>>`, `upsertOfferState(offers): Promise<void>` (offerState.ts)
  - `loadAlertState(): Promise<Map<string, AlertStateRow>>`, `recordAlerted(dedupKey, price): Promise<void>` (alertState.ts)
  - `FailureType`, `HealthTransition`, `classifyFailure(err): FailureType`, `applyResult(prev, ok, offerCount, failureType?): HealthTransition` (pure), `loadHealth()/saveHealth()` (health.ts)

- [ ] **Step 1: schema.sql**

```sql
create table if not exists runs (
  run_id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  sources_ok int, sources_failed int, offers_count int
);

create table if not exists offers (
  id bigserial primary key,
  run_id bigint references runs(run_id),
  source text not null,
  villa text not null,
  villa_key text not null,
  unit_type text not null,
  date_from date not null,
  date_to date not null,
  nights int not null,
  price_per_person int not null,
  ppp_per_night numeric not null,
  transport_type text not null,
  is_package boolean not null default false,
  url text,
  scraped_at timestamptz not null default now()
);

create table if not exists offer_state (
  dedup_key text primary key,
  source text,
  last_price int not null,
  last_seen_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now()
);

create table if not exists alert_state (
  dedup_key text primary key,
  last_alerted_price int not null,
  last_alerted_at timestamptz not null default now()
);

create table if not exists source_health (
  source text primary key,
  consecutive_failures int not null default 0,
  last_ok_at timestamptz,
  last_error text,
  last_failure_type text
);

create table if not exists meta (
  key text primary key,
  value text
); -- npr. last_heartbeat_date
```

Apliciraj kroz Supabase MCP `apply_migration` ili SQL editor.

- [ ] **Step 2: supabase.ts**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;
export function supa(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY nisu postavljeni');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
```

- [ ] **Step 3: health.ts — pure logic first (TDD)**

```ts
// test/health.test.ts
import { expect, test } from 'vitest';
import { applyResult, classifyFailure } from '../src/store/health.js';

const prev = { source: 'X', consecutiveFailures: 0, lastOkAt: null as string | null };

test('OK->OK no transition', () => {
  const t = applyResult(prev, true, 5);
  expect(t.becameFailing).toBe(false);
  expect(t.recovered).toBe(false);
});
test('OK->FAIL becomes failing', () => {
  const t = applyResult(prev, false, 0, 'fetch');
  expect(t.becameFailing).toBe(true);
  expect(t.consecutiveFailures).toBe(1);
  expect(t.failureType).toBe('fetch');
});
test('3rd consecutive reaches threshold', () => {
  const t = applyResult({ ...prev, consecutiveFailures: 2 }, false, 0, 'block');
  expect(t.consecutiveFailures).toBe(3);
  expect(t.reachedThreshold).toBe(true);
});
test('FAIL->OK recovers', () => {
  const t = applyResult({ ...prev, consecutiveFailures: 2 }, true, 4);
  expect(t.recovered).toBe(true);
  expect(t.consecutiveFailures).toBe(0);
});
test('classifyFailure detects block vs markup vs fetch', () => {
  expect(classifyFailure(new Error('HTTP 403'))).toBe('block');
  expect(classifyFailure(new Error('HTTP 429'))).toBe('block');
  expect(classifyFailure(new Error('0 offers parsed'))).toBe('markup');
  expect(classifyFailure(new Error('network timeout'))).toBe('fetch');
});
```

Run: FAIL, pa implementiraj čistu logiku + IO odvojeno:

```ts
export type FailureType = 'fetch' | 'block' | 'markup';

export interface HealthRow {
  source: string;
  consecutiveFailures: number;
  lastOkAt: string | null;
}
export interface HealthTransition {
  source: string;
  becameFailing: boolean;
  recovered: boolean;
  consecutiveFailures: number;
  reachedThreshold: boolean;
  failureType?: FailureType;
}

export function classifyFailure(err: unknown): FailureType {
  const m = String(err instanceof Error ? err.message : err).toLowerCase();
  if (m.includes('403') || m.includes('429') || m.includes('cloudflare') || m.includes('challenge')) return 'block';
  if (m.includes('0 offers') || m.includes('markup') || m.includes('empty parse')) return 'markup';
  return 'fetch';
}

export function applyResult(prev: HealthRow, ok: boolean, _offerCount: number, failureType?: FailureType): HealthTransition {
  if (ok) {
    return {
      source: prev.source, becameFailing: false,
      recovered: prev.consecutiveFailures > 0,
      consecutiveFailures: 0, reachedThreshold: false,
    };
  }
  const cf = prev.consecutiveFailures + 1;
  return {
    source: prev.source, becameFailing: prev.consecutiveFailures === 0,
    recovered: false, consecutiveFailures: cf,
    reachedThreshold: cf >= 3, failureType,
  };
}
```

Then add IO helpers in same file:

```ts
import { supa } from './supabase.js';

export async function loadHealth(source: string): Promise<HealthRow> {
  const { data } = await supa().from('source_health').select('*').eq('source', source).maybeSingle();
  return {
    source,
    consecutiveFailures: data?.consecutive_failures ?? 0,
    lastOkAt: data?.last_ok_at ?? null,
  };
}

export async function saveHealth(t: HealthTransition, error?: string): Promise<void> {
  const patch: Record<string, unknown> = { source: t.source, consecutive_failures: t.consecutiveFailures };
  if (t.consecutiveFailures === 0) patch.last_ok_at = new Date().toISOString();
  if (error) { patch.last_error = error; patch.last_failure_type = t.failureType ?? null; }
  await supa().from('source_health').upsert(patch, { onConflict: 'source' });
}
```

Run: `npx vitest run test/health.test.ts` → PASS

- [ ] **Step 4: snapshot.ts / offerState.ts / alertState.ts (IO — verifikuju se u Task 8 dry-run/integraciji)**

```ts
// src/store/snapshot.ts
import { supa } from './supabase.js';
import type { DedupedOffer } from '../core/types.js';

export async function createRun(): Promise<number> {
  const { data, error } = await supa().from('runs').insert({}).select('run_id').single();
  if (error) throw error;
  return data!.run_id as number;
}

export async function insertOffers(runId: number, offers: DedupedOffer[]): Promise<void> {
  if (offers.length === 0) return;
  const rows = offers.map((o) => ({
    run_id: runId, source: o.sources.join(','), villa: o.villa, villa_key: o.villaKey,
    unit_type: o.unitType, date_from: o.dateFrom, date_to: o.dateTo, nights: o.nights,
    price_per_person: o.pricePerPerson, ppp_per_night: o.pppPerNight,
    transport_type: o.transportType, is_package: o.isPackage, url: o.url,
  }));
  const { error } = await supa().from('offers').insert(rows);
  if (error) throw error;
}

export async function finishRun(runId: number, s: { sourcesOk: number; sourcesFailed: number; offersCount: number }): Promise<void> {
  await supa().from('runs').update({
    finished_at: new Date().toISOString(),
    sources_ok: s.sourcesOk, sources_failed: s.sourcesFailed, offers_count: s.offersCount,
  }).eq('run_id', runId);
}
```

```ts
// src/store/offerState.ts
import { supa } from './supabase.js';
import type { DedupedOffer } from '../core/types.js';
import type { OfferStateRow } from '../core/diff.js';

export async function loadOfferState(): Promise<Map<string, OfferStateRow>> {
  const { data, error } = await supa().from('offer_state').select('dedup_key,last_price');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.dedup_key as string, { dedupKey: r.dedup_key, lastPrice: r.last_price }]));
}

export async function upsertOfferState(offers: DedupedOffer[]): Promise<void> {
  if (offers.length === 0) return;
  const now = new Date().toISOString();
  const rows = offers.map((o) => ({
    dedup_key: o.dedupKey, source: o.sources.join(','), last_price: o.pricePerPerson, last_seen_at: now,
  }));
  const { error } = await supa().from('offer_state').upsert(rows, { onConflict: 'dedup_key' });
  if (error) throw error;
}
```

```ts
// src/store/alertState.ts
import { supa } from './supabase.js';
import type { AlertStateRow } from '../core/diff.js';

export async function loadAlertState(): Promise<Map<string, AlertStateRow>> {
  const { data, error } = await supa().from('alert_state').select('dedup_key,last_alerted_price');
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.dedup_key as string, { dedupKey: r.dedup_key, lastAlertedPrice: r.last_alerted_price }]));
}

export async function recordAlerted(dedupKey: string, price: number): Promise<void> {
  await supa().from('alert_state').upsert(
    { dedup_key: dedupKey, last_alerted_price: price, last_alerted_at: new Date().toISOString() },
    { onConflict: 'dedup_key' },
  );
}
```

- [ ] **Step 5: Commit** → `git add -A && git commit -m "feat(store): supabase schema + snapshot/state/health modules"`

---

### Task 6: Telegram notify + message formatting

**Files:**
- Create: `src/notify/telegram.ts`, `src/notify/format.ts`
- Test: `test/format.test.ts`

**Interfaces:**
- Consumes: `Alert` (Task 4), `HealthTransition` (Task 5), `DedupedOffer`
- Produces:
  - `sendTelegram(text: string): Promise<void>` (telegram.ts)
  - `formatAlert(a: Alert, threshold: number): string`, `formatSourceFailure(t, error): string`, `formatRecovery(source): string`, `formatEscalation(source): string`, `formatAllFailed(sources): string`, `formatHeartbeat(count, best): string` (format.ts)

- [ ] **Step 1: format tests**

```ts
// test/format.test.ts
import { expect, test } from 'vitest';
import { formatAlert, formatSourceFailure, formatHeartbeat } from '../src/notify/format.js';
import type { Alert } from '../src/core/diff.js';
import type { DedupedOffer } from '../src/core/types.js';

const offer: DedupedOffer = {
  source: 'lmp', sources: ['Mayak-Tours'], villa: 'Vila X', villaKey: 'vila x', unitType: '1/2',
  dateFrom: '2026-08-03', dateTo: '2026-08-13', nights: 10, pricePerPerson: 360,
  pppPerNight: 36, transportType: 'own', isPackage: false, url: 'https://x/y', dedupKey: 'k',
};

test('new-offer alert shows ⭐ when below threshold and total for two', () => {
  const msg = formatAlert({ kind: 'new', offer }, 38);
  expect(msg).toContain('Vila X');
  expect(msg).toContain('720'); // 360*2 za dvoje
  expect(msg).toContain('⭐');
  expect(msg).toContain('Mayak-Tours');
  expect(msg).toContain('https://x/y');
});
test('price drop shows old->new', () => {
  const msg = formatAlert({ kind: 'price_drop', offer, previousPrice: 400 }, 38);
  expect(msg).toContain('400');
  expect(msg).toContain('360');
});
test('source failure names type', () => {
  const msg = formatSourceFailure({ source: 'lmp', becameFailing: true, recovered: false, consecutiveFailures: 1, reachedThreshold: false, failureType: 'block' }, 'HTTP 403');
  expect(msg).toContain('lmp');
  expect(msg.toLowerCase()).toContain('blokada');
});
test('heartbeat', () => {
  expect(formatHeartbeat(12, offer)).toContain('12');
});
```

- [ ] **Step 2: Run — fail; implement format.ts**

```ts
import type { Alert } from '../core/diff.js';
import type { DedupedOffer } from '../core/types.js';
import type { HealthTransition, FailureType } from '../store/health.js';

const FAIL_LABEL: Record<FailureType, string> = {
  fetch: 'ne može da dohvati (mreža/HTTP)',
  block: 'blokada (403/429/Cloudflare)',
  markup: 'markup se promenio (0 ponuda gde ih je ranije bilo)',
};

export function formatAlert(a: Alert, threshold: number): string {
  const o = a.offer;
  const star = o.pppPerNight < threshold ? ' ⭐' : '';
  const forTwo = o.pricePerPerson * 2;
  const head = a.kind === 'new' ? '🆕 Nova ponuda' : '📉 Pala cena';
  const priceLine = a.kind === 'price_drop' && a.previousPrice
    ? `Cena/os: ~${a.previousPrice}~ → *${o.pricePerPerson} €*`
    : `Cena/os: *${o.pricePerPerson} €*`;
  return [
    `${head}${star}`,
    `*${o.villa}* (${o.unitType})`,
    `Termin: ${o.dateFrom} → ${o.dateTo} (${o.nights} noći)`,
    priceLine,
    `Za dvoje: *${forTwo} €*  |  ${o.pppPerNight} €/os/noć`,
    `Izvor: ${o.sources.join(', ')}`,
    o.url,
  ].join('\n');
}

export function formatSourceFailure(t: HealthTransition, error: string): string {
  const label = t.failureType ? FAIL_LABEL[t.failureType] : 'nepoznat razlog';
  return `⚠️ Izvor *${t.source}* pao: ${label}\n${error}`;
}

export function formatRecovery(source: string): string {
  return `✅ Izvor *${source}* ponovo radi.`;
}

export function formatEscalation(source: string): string {
  return `‼️ Izvor *${source}* mrtav 3 puta zaredom — parser verovatno treba popravku.`;
}

export function formatAllFailed(sources: string[]): string {
  return `‼️ SVI izvori pali u ovom runu: ${sources.join(', ')}. Nešto globalno ne valja.`;
}

export function formatHeartbeat(count: number, best: DedupedOffer | null): string {
  const bestLine = best ? `Najbolje: ${best.villa} — ${best.pricePerPerson} €/os (${best.pppPerNight}/noć)` : 'Nema relevantnih ponuda trenutno.';
  return `💓 Živ sam. Pratim ${count} relevantnih ponuda.\n${bestLine}`;
}
```

Run: `npx vitest run test/format.test.ts` → PASS

- [ ] **Step 3: Implement telegram.ts**

```ts
export async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) throw new Error('TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID nisu postavljeni');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: 'Markdown', disable_web_page_preview: false }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}: ${await res.text()}`);
}
```

- [ ] **Step 4: Commit** → `git add -A && git commit -m "feat(notify): telegram sender + message formatting"`

---

### Task 7: Source adapter interface + registry + lastminuteponude adapter

**Files:**
- Create: `src/sources/types.ts`, `src/sources/registry.ts`, `src/sources/http.ts`, `src/sources/lastminuteponude.ts`
- Test: `test/lastminuteponude.test.ts`
- Fixtures: `test/fixtures/lmp-listing.html`, `test/fixtures/lmp-detail.html`

**Interfaces:**
- Consumes: `RawOffer` (Task 2), `parseSerbianDate` (Task 2)
- Produces:
  - `SourceAdapter { id: string; run(): Promise<RawOffer[]> }` (types.ts)
  - `adapters: SourceAdapter[]` (registry.ts)
  - `fetchHtml(url): Promise<string>` sa browser UA + timeout + throw na 403/429 (http.ts)
  - `parseListing(html: string): { villa: string; url: string }[]` (samo `/Kalitea/` linkovi), `parseDetail(html: string, url: string): RawOffer[]` (lastminuteponude.ts)

**Napomena o selektorima:** sajt je div-baziran, sa sidebar/promo šumom. Selektori se pišu **iterativno protiv sačuvanih fixture-a** (Step 1–2), NE naslepo. Strategija je fiksna: (a) listing → svi `a[href*="/Kalitea/"][href*="leto-2026-letovanje"]`, uzmi naziv iz teksta/tab, dedup po URL; (b) detail → skvoiraj na glavni sadržaj (ne sidebar), nađi sekciju „Sopstveni prevoz", iz nje čitaj redove: termin (dva datuma), broj noćenja, `1/2` cena/os; termin sa `*` → `isPackage=true` (za Automobilom se preskače). Autobuski/avio sekcije se ignorišu.

- [ ] **Step 1: Capture fixtures (živi sajt, jednokratno)**

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
mkdir -p test/fixtures
curl -sL -A "$UA" "https://www.lastminuteponude.com/Grčka/Kalitea/Automobilom" -o test/fixtures/lmp-listing.html
# uzmi jedan Kalitea detail URL iz listinga i snimi ga:
curl -sL -A "$UA" "https://www.lastminuteponude.com/Grčka/Kalitea/Mayak-Tours/leto-2026-letovanje/21048" -o test/fixtures/lmp-detail.html
```

- [ ] **Step 2: Inspect fixtures & write assertions from REAL values**

Otvori `lmp-detail.html`, nađi glavni offer kontejner i sekciju „Sopstveni prevoz". Zabeleži stvarne vrednosti (vila, bar jedan termin, `1/2` cena) i upiši ih kao očekivane u test. Primer skeleta (vrednosti zameni stvarnim iz fixture-a):

```ts
// test/lastminuteponude.test.ts
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseListing, parseDetail } from '../src/sources/lastminuteponude.js';

const listing = readFileSync('test/fixtures/lmp-listing.html', 'utf-8');
const detail = readFileSync('test/fixtures/lmp-detail.html', 'utf-8');

test('parseListing returns only Kalitea offer links', () => {
  const items = parseListing(listing);
  expect(items.length).toBeGreaterThan(0);
  expect(items.every((i) => i.url.includes('/Kalitea/'))).toBe(true);
  expect(items.every((i) => i.url.startsWith('https://'))).toBe(true);
});

test('parseDetail extracts own-transport 1/2 offers with valid fields', () => {
  const offers = parseDetail(detail, 'https://www.lastminuteponude.com/Grčka/Kalitea/Mayak-Tours/leto-2026-letovanje/21048');
  expect(offers.length).toBeGreaterThan(0);
  for (const o of offers) {
    expect(o.transportType).toBe('own');
    expect(o.unitType).toMatch(/^1\/\d$/);
    expect(o.dateFrom).toMatch(/^2026-\d\d-\d\d$/);
    expect(o.nights).toBeGreaterThan(0);
    expect(o.pricePerPerson).toBeGreaterThan(0);
    expect(o.villa.length).toBeGreaterThan(0);
  }
  // Zameni stvarnom vrednošću iz fixture-a nakon inspekcije:
  // expect(offers.some(o => o.pricePerPerson === <STVARNA_CENA>)).toBe(true);
});
```

- [ ] **Step 3: Run — verify fail** → `npx vitest run test/lastminuteponude.test.ts` → FAIL

- [ ] **Step 4: Implement types.ts + http.ts**

```ts
// src/sources/types.ts
import type { RawOffer } from '../core/types.js';
export interface SourceAdapter { id: string; run(): Promise<RawOffer[]>; }
```

```ts
// src/sources/http.ts
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'sr,en;q=0.8' }, signal: AbortSignal.timeout(25000) });
  if (res.status === 403 || res.status === 429) throw new Error(`HTTP ${res.status} (blokada) na ${url}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} na ${url}`);
  return res.text();
}

export function jitterDelay(minMs = 2000, maxMs = 5000): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}
```

- [ ] **Step 5: Implement lastminuteponude.ts (iterate selektore dok test ne prođe)**

```ts
import * as cheerio from 'cheerio';
import type { RawOffer } from '../core/types.js';
import type { SourceAdapter } from './types.js';
import { fetchHtml, jitterDelay } from './http.js';
import { parseSerbianDate } from '../core/dates.js';

const BASE = 'https://www.lastminuteponude.com';
const LISTING_URL = `${BASE}/Grčka/Kalitea/Automobilom`;
const YEAR = 2026;

export function parseListing(html: string): { villa: string; url: string }[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const items: { villa: string; url: string }[] = [];
  $('a[href*="/Kalitea/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (!href.includes('leto-2026-letovanje')) return;
    const url = href.startsWith('http') ? href : BASE + href;
    const clean = url.split('?')[0]!;
    if (seen.has(clean)) return;
    seen.add(clean);
    items.push({ villa: $(el).text().trim() || clean, url: clean });
  });
  return items;
}

// STRATEGIJA: skvoiraj na glavni offer kontejner, nađi "Sopstveni prevoz" sekciju,
// iz nje čitaj termin + 1/2 cenu. Selektore doraditi protiv fixture-a.
export function parseDetail(html: string, url: string): RawOffer[] {
  const $ = cheerio.load(html);
  const villa = ($('h1').first().text().trim() || 'Nepoznata vila');
  const offers: RawOffer[] = [];
  // Pseudo-konkretno: pronaći blok čiji naslov/tekst sadrži "Sopstveni prevoz",
  // pa u njemu iterirati redove sa terminom i "1/2" cenom. Primer okvira:
  $('*:contains("Sopstveni prevoz")').last().closest('[class]').find('tr, li, .row').each((_, row) => {
    const text = $(row).text().replace(/\s+/g, ' ').trim();
    const isPackage = text.includes('*');
    const term = text.match(/(\d{1,2}[.\s][a-zčćšđž0-9.]+)\s*[-–]\s*(\d{1,2}[.\s][a-zčćšđž0-9.]+)/i);
    const price12 = text.match(/1\/2[^0-9]{0,20}(\d{2,4})/);
    const nightsM = text.match(/(\d{1,2})\s*no/i);
    if (!term || !price12) return;
    try {
      const dateFrom = parseSerbianDate(term[1]!, YEAR);
      const dateTo = parseSerbianDate(term[2]!, YEAR);
      const nights = nightsM ? Number(nightsM[1]) : nightsBetween(dateFrom, dateTo);
      offers.push({
        source: 'lastminuteponude', villa, unitType: '1/2', dateFrom, dateTo, nights,
        pricePerPerson: Number(price12[1]), transportType: 'own', isPackage, url,
      });
    } catch { /* preskoči nevalidan red */ }
  });
  return offers;
}

function nightsBetween(from: string, to: string): number {
  const d = (Date.parse(to) - Date.parse(from)) / 86400000;
  return d > 0 ? d : 1;
}

export const lastminuteponude: SourceAdapter = {
  id: 'lastminuteponude',
  async run(): Promise<RawOffer[]> {
    const listingHtml = await fetchHtml(LISTING_URL);
    const items = parseListing(listingHtml);
    const all: RawOffer[] = [];
    for (const item of items) {
      await jitterDelay();
      try {
        const detailHtml = await fetchHtml(item.url);
        all.push(...parseDetail(detailHtml, item.url));
      } catch (e) {
        console.error(`[lmp] detail fail ${item.url}: ${String(e)}`);
      }
    }
    if (items.length > 0 && all.length === 0) throw new Error('0 offers parsed (markup?)');
    return all;
  },
};
```

> Iteriraj `parseDetail` selektore protiv `lmp-detail.html` dok Step 2 test ne prođe sa stvarnim vrednostima. Ako se pokaže da neki termin nudi i `1/3`/`1/4`, proširi `unitType` hvatanje analogno.

- [ ] **Step 6: registry.ts**

```ts
import type { SourceAdapter } from './types.js';
import { lastminuteponude } from './lastminuteponude.js';
export const adapters: SourceAdapter[] = [lastminuteponude];
```

- [ ] **Step 7: Run — verify pass** → `npx vitest run test/lastminuteponude.test.ts` → PASS

- [ ] **Step 8: Commit** → `git add -A && git commit -m "feat(sources): adapter interface, http, lastminuteponude parser + fixtures"`

---

### Task 8: Orchestrator

**Files:**
- Create: `src/index.ts`
- Test: manuelno `npm run scrape:dry` (bez slanja/upisa) + `npm run scrape` protiv realnog Supabase/Telegram

**Interfaces:**
- Consumes: sve iz Tasks 2–7.

- [ ] **Step 1: Implement index.ts**

```ts
import { adapters } from './sources/registry.js';
import { normalize } from './core/normalize.js';
import { dedupe } from './core/dedupe.js';
import { computeAlerts } from './core/diff.js';
import { isRelevant } from './core/threshold.js';
import type { RawOffer, DedupedOffer } from './core/types.js';
import { createRun, insertOffers, finishRun } from './store/snapshot.js';
import { loadOfferState, upsertOfferState } from './store/offerState.js';
import { loadAlertState, recordAlerted } from './store/alertState.js';
import { loadHealth, saveHealth, applyResult, classifyFailure } from './store/health.js';
import { sendTelegram } from './notify/telegram.js';
import { formatAlert, formatSourceFailure, formatRecovery, formatEscalation, formatAllFailed, formatHeartbeat } from './notify/format.js';
import { supa } from './store/supabase.js';

const DRY = process.env.DRY_RUN === '1';
const THRESHOLD = Number(process.env.THRESHOLD_PPPPN ?? '38');
const HEARTBEAT_HOUR = Number(process.env.HEARTBEAT_HOUR ?? '8');

async function notify(text: string): Promise<void> {
  if (DRY) { console.log('--- TELEGRAM ---\n' + text + '\n'); return; }
  await sendTelegram(text);
}

async function main(): Promise<void> {
  const runId = DRY ? -1 : await createRun();
  const collected: RawOffer[] = [];
  const failed: string[] = [];
  let ok = 0;

  for (const adapter of adapters) {
    const prev = DRY ? { source: adapter.id, consecutiveFailures: 0, lastOkAt: null } : await loadHealth(adapter.id);
    try {
      const offers = await adapter.run();
      collected.push(...offers);
      ok++;
      const t = applyResult(prev, true, offers.length);
      if (!DRY) await saveHealth(t);
      if (t.recovered) await notify(formatRecovery(adapter.id));
      console.log(`[${adapter.id}] ok: ${offers.length} ponuda`);
    } catch (e) {
      failed.push(adapter.id);
      const ftype = classifyFailure(e);
      const t = applyResult(prev, false, 0, ftype);
      if (!DRY) await saveHealth(t, String(e));
      if (t.becameFailing) await notify(formatSourceFailure(t, String(e)));
      if (t.reachedThreshold) await notify(formatEscalation(adapter.id));
      console.error(`[${adapter.id}] FAIL: ${String(e)}`);
    }
  }

  if (failed.length === adapters.length && adapters.length > 0) {
    await notify(formatAllFailed(failed));
  }

  const deduped = dedupe(collected.map(normalize));
  const relevant = deduped.filter(isRelevant);

  const offerState = DRY ? new Map() : await loadOfferState();
  const alertState = DRY ? new Map() : await loadAlertState();
  const alerts = computeAlerts(relevant, offerState, alertState);

  for (const a of alerts) {
    await notify(formatAlert(a, THRESHOLD));
    if (!DRY) await recordAlerted(a.offer.dedupKey, a.offer.pricePerPerson);
  }

  if (!DRY) {
    await insertOffers(runId, deduped);
    await upsertOfferState(relevant);
    await finishRun(runId, { sourcesOk: ok, sourcesFailed: failed.length, offersCount: deduped.length });
    await maybeHeartbeat(relevant);
  }

  console.log(`Gotovo. ${deduped.length} deduplic. ponuda, ${relevant.length} relevantnih, ${alerts.length} alerta.`);
}

async function maybeHeartbeat(relevant: DedupedOffer[]): Promise<void> {
  const hour = new Date().getUTCHours();
  if (hour !== HEARTBEAT_HOUR) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supa().from('meta').select('value').eq('key', 'last_heartbeat_date').maybeSingle();
  if (data?.value === today) return;
  const best = relevant.slice().sort((a, b) => a.pppPerNight - b.pppPerNight)[0] ?? null;
  await sendTelegram(formatHeartbeat(relevant.length, best));
  await supa().from('meta').upsert({ key: 'last_heartbeat_date', value: today }, { onConflict: 'key' });
}

main().catch((e) => { console.error('Fatalna greška:', e); process.exit(1); });
```

> **Napomena:** fajl je `src/core/dedupe.ts` (Task 3), import je `./core/dedupe.js`. Usklađeno.

- [ ] **Step 2: Dry-run protiv fixture-a nije moguć bez mreže; umesto toga typecheck**

Run: `npm run typecheck`
Expected: PASS (sve putanje/typovi se slažu).

- [ ] **Step 3: Commit** → `git add -A && git commit -m "feat: orchestrator wiring scrape->dedup->diff->notify->persist + heartbeat"`

---

### Task 9: GitHub Actions workflow + README + live smoke test

**Files:**
- Create: `.github/workflows/scrape.yml`, `README.md`

**Interfaces:** none (deployment).

- [ ] **Step 1: scrape.yml**

```yaml
name: kalitea-scrape
on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch: {}
concurrency:
  group: kalitea-scrape
  cancel-in-progress: false
jobs:
  scrape:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run scrape
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          THRESHOLD_PPPPN: '38'
          HEARTBEAT_HOUR: '8'
```

- [ ] **Step 2: README.md** — setup koraci: kreiranje Supabase projekta + `supabase/schema.sql`, kreiranje Telegram bota (`@BotFather`) i dobijanje `chat_id` (`https://api.telegram.org/bot<TOKEN>/getUpdates` posle slanja poruke botu), postavljanje GitHub secrets, `npm run scrape:dry` za lokalnu proveru.

- [ ] **Step 3: Live smoke test (lokalno, sa .env)**

Run: `npm run scrape:dry`
Expected: ispis „--- TELEGRAM ---" blokova za sve što bi poslao, bez upisa u bazu. Proveri da parsira > 0 ponuda i da su cene realne.

- [ ] **Step 4: Prvi pravi run**

Run: `npm run scrape` (sa popunjenim `.env`)
Expected: upisano u `offers`/`offer_state`, prvi put stižu alerti za sve relevantne ponude (jer je `offer_state` prazan). Naredni runovi tihi dok nema promene.

- [ ] **Step 5: Commit + push**

```bash
git add -A && git commit -m "ci: github actions cron every 30min + README + smoke test"
```

---

## Self-Review

**Spec coverage:**
- Izvor (agregator, Automobilom, samo sopstveni) → Task 7 ✅
- Dedup po (villa+unit+termin+transport) → Task 3 ✅
- Snapshot u Supabase (offers) → Task 5 ✅
- Diff po ključu vs offer_state (ne ceo run) → Task 4 + 8 ✅
- Alert: nova ponuda + pad cene, ⭐ ispod 38 → Task 4/6 ✅
- Tišina kad nema promene → Task 4 (anti-spam alert_state) ✅
- Telegram → Task 6 ✅
- Otpornost: try/catch po adapteru, rate limit jitter → Task 7/8 ✅
- Per-sajt fail/blokada/markup/oporavak/3-eskalacija/all-failed → Task 5/6/8 ✅
- Heartbeat jednom dnevno → Task 8 ✅
- Bez filtera po datumu; bez klima/parking/udaljenost → Task 4/7 (ne skupljaju se) ✅
- GitHub Actions */30 → Task 9 ✅

**Placeholder scan:** parser selektori u Task 7 su namerno iterativni protiv fixture-a (jedini pošten pristup za nepoznat markup); strategija i testovi su konkretni. Ostali moduli imaju potpun kod.

**Type consistency:** fajl `src/core/dedupe.ts` usklađen svuda (Task 3 kreira, Task 8 importuje). `RawOffer`/`NormalizedOffer`/`DedupedOffer`/`Alert`/`HealthTransition`/`OfferStateRow`/`AlertStateRow` konzistentni kroz Tasks 2–8.
