# Kalitea Last-Minute Watcher

Skrejpuje last-minute ponude za **Kaliteu (Halkidiki)** sa agregatora
[lastminuteponude.com](https://www.lastminuteponude.com), snima u Supabase, i šalje
**Telegram** alert samo kad se pojavi nova ponuda ili padne cena. Ćuti kad nema promene.
Vrti se na **GitHub Actions cron-u** svakih 30 min.

> Potrošan alat — namenjen da radi par nedelja dok ne rezervišeš, ne zauvek.

## Šta radi

- Parsira teaser kartice za Kaliteu (vila, agencija, tip **1/2**, broj noćenja, datum
  polaska, cena/os, link). Dedup preko više listing strana.
- Alert na **novu ponudu** ili **pad cene** (poređenje po ključu vs poslednje viđeno
  stanje). Ne re-šalje isto na istoj ceni.
- Ponude ispod **38 €/os/noć** (tvoja referenca od 380 za 10 noći) dobijaju ⭐.
- Per-sajt **fail/blokada/markup-change/oporavak** poruke + dnevni heartbeat.

## ⚠️ Važno ograničenje (pošteno)

Agregator prikazuje teaser cenu koja je **često za autobuski prevoz**, a precizan
cenovnik za **sopstveni prevoz** stoji „u programu putovanja" (PDF/agencijski sajt) i
**nije u HTML-u**. Zato:
- Poruka jasno kaže na koji se prevoz cena odnosi (i kad je autobus, da proveriš sopstveni).
- Ti otvoriš link i vidiš tačan sopstveni cenovnik, termin i detalje (klima/parking).
- Alat je **signal „pojavilo se nešto, idi pogledaj"**, ne zamena za program putovanja.

Trenutno agregator ima malo Kalitea ponuda; za više pokrivenosti kasnije se dodaju
agencijski izvori (vidi `src/sources/registry.ts` — dodavanje = jedan adapter + upis).

## Setup

### 1. Supabase
1. Napravi projekat na [supabase.com](https://supabase.com).
2. U SQL editoru pokreni `supabase/schema.sql`.
3. Uzmi `Project URL` i `service_role` ključ (Settings → API).

### 2. Telegram bot
1. U Telegramu piši `@BotFather` → `/newbot` → dobiješ **bot token**.
2. Pošalji bilo koju poruku svom botu.
3. Otvori `https://api.telegram.org/bot<TOKEN>/getUpdates` → nađi `chat.id` — to je tvoj **chat id**.

### 3. Lokalno pokretanje
```bash
cp .env.example .env   # popuni vrednosti
npm install
npm run scrape:dry     # skrejpuje uživo, ispisuje šta bi poslao (ništa ne šalje/upisuje)
npm run scrape         # pravi run: upis u Supabase + Telegram alerti
```

### 4. Deploy (GitHub Actions)
1. Push repo na GitHub.
2. Settings → Secrets and variables → Actions → dodaj:
   `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
3. Workflow `.github/workflows/scrape.yml` se pokreće svakih 30 min (i ručno preko
   „Run workflow").

## Razvoj
```bash
npm test        # vitest, 27 testova
npm run typecheck
```

Dizajn i plan: `docs/superpowers/specs/` i `docs/superpowers/plans/`.
