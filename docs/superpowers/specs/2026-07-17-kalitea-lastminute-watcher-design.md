# Kalitea Last-Minute Watcher — Design

**Datum:** 2026-07-17
**Autor:** Luka (sa Claude Code)
**Status:** Odobreno za planiranje

## 1. Cilj

Automatski pratiti last-minute ponude za smeštaj u Kalitei (Halkidiki, Grčka),
snimati svaki run u bazu, porediti sa prethodnim, i slati Telegram alert **samo**
kada se pojavi nešto vredno pažnje. Svaka 4 sata. Ako nema promene — tišina.

### Korisnički profil pretrage
- Dve osobe, 1/2 studio ili apartman.
- Sopstveni prevoz (NE paket sa busom).
- Dolazak ~3–4. avgust 2026, prozor 1–6. avgust.
- 7 ili 10 noći.
- Trenutna tržišna referenca: 380 EUR/osobi za 10 noći (760 za dvoje).
  Prag za alert izražen kao **38 EUR po osobi po noćenju**.

## 2. Odluke (potvrđene)

| Odluka | Izbor | Razlog |
|---|---|---|
| Deploy/cron | **GitHub Actions**, dva workflow-a: statični `*/30`, pun (sa Playwright) `hourly` | Pun Playwright bez serverless limita, besplatno, secrets+logovi ugrađeni. Nema web UI potrebe → nema Next.js/Vercel. |
| Frekvencija | **Statični izvori svakih 30 min, Playwright svakih 60 min** | Dobro pokrivanje bez rizika blokade; alert ide samo na promenu pa frekvencija ne pravi šum. |
| Prag | **Normalizacija na cenu po osobi po noćenju (38 EUR)** | Fer poređenje 7- i 10-noćnih ponuda. |
| Mayak Tours (Cloudflare 522) | **Preskoči direktan scraping** | Isti inventar/cene dolaze preko subagenata (Eta, Salvador...); dedup ih spaja. Nula krhkosti Cloudflare-a. |
| Kontiki | **Preskoči** | robots.txt disallow — poštuje se. |
| Heartbeat | **Da, jednom dnevno ujutru** | Da se zna da job radi; tišina inače. |
| Redosled izgradnje | **lastminuteponude → eta turs → ostali** | De-risk najtežeg (Playwright SPA) prvo. |

## 3. Izvori

| Izvor | Mode | Napomena |
|---|---|---|
| lastminuteponude.com/last-minute/Grčka/Kalitea | headless (Playwright) | Angular SPA. Prvi na redu. |
| etaturs.rs | static (Cheerio) | Statičan HTML, tabele po vili. Mayak subagent. |
| salvadortravel.rs | static (Cheerio) | WordPress tabele po vili. Mayak subagent. |
| halotours.rs | static (Cheerio) | Last-minute lista. |
| hellenatravel.rs | static (Cheerio) | Last-minute ponude. |
| ~~mayaktours.com~~ | — | Preskočeno (Cloudflare, pokriveno preko subagenata). |
| ~~kontiki.rs~~ | — | Preskočeno (robots.txt disallow). |

## 4. Stack & runtime

- TypeScript, `strict: true`. Pokretanje kroz `tsx`.
- Cheerio (statični izvori) + Playwright (samo lastminuteponude).
- Supabase (Postgres) za snapshotove i state.
- Telegram Bot API za notifikacije.
- GitHub Actions cron za orkestraciju.

## 5. Struktura projekta

```
src/
  sources/
    types.ts            # SourceAdapter interfejs
    lastminuteponude.ts
    etaturs.ts
    salvadortravel.ts
    halotours.ts
    hellenatravel.ts
  core/
    types.ts            # Offer, RawOffer, tipovi
    normalize.ts        # villa_key, ppp_per_night, transport klasifikacija
    dedup.ts            # spajanje po ključu, najniža cena
    diff.ts             # poređenje sa prošlim runom
    threshold.ts        # relevantnost + prag logika
  store/
    supabase.ts         # klijent
    snapshot.ts         # upis offers, čitanje prošlog runa
    alertState.ts       # last_alerted_price po ključu
    health.ts           # consecutive_failures po izvoru
  notify/
    telegram.ts         # slanje poruka
    format.ts           # formatiranje alert/ops/heartbeat poruka
  index.ts              # orkestrator
test/
  fixtures/             # sačuvan HTML po izvoru
  *.test.ts             # parser unit testovi
```

## 6. Adapter interfejs

```ts
interface SourceAdapter {
  id: string;
  mode: 'static' | 'headless';
  run(): Promise<RawOffer[]>;   // fetch + parse
  parse(html: string): RawOffer[]; // izloženo za fixture testove
}
```

Fetch i parse su razdvojeni tako da `parse` može da se testira nad sačuvanim
HTML fixture-om bez ijednog live requesta.

## 7. Model podataka

### Tabela `offers` (snapshot po run-u)
`id, run_id, source, villa, villa_key, unit_type ('1/2'|'1/3'|'1/4'), date_from,
date_to, nights, price_per_person, ppp_per_night, transport_type ('own'|'package'),
is_package (bool, zvezdica), distance_to_beach (text|null), parking (text|null),
ac ('included'|'surcharge'|null), scraped_at`

### Tabela `offer_state` (poslednje viđeno stanje po ključu)
`dedup_key (PK), source, last_price, last_seen_at, first_seen_at` — koristi se za
diff. Pošto se statični (30 min) i Playwright (60 min) runovi razmiču, diff se radi
**po dedup ključu vs poslednje viđeno stanje**, a NE poređenjem celog prošlog runa
(inače bi statični run pogrešno tretirao Playwright ponude kao „nestale").

### Tabela `alert_state`
`dedup_key (PK), last_alerted_price, last_alerted_at` — sprečava re-spam istog
objekta na istoj ceni.

### Tabela `source_health`
`source (PK), consecutive_failures, last_ok_at, last_error` — okida ops-alert na 3.

### Tabela `runs`
`run_id (PK), started_at, finished_at, sources_ok, sources_failed, offers_count`

## 8. Parsiranje "sopstveni vs paket" (jezgro vrednosti)

Pravilo se enkodira **po agenciji** u njen adapter:
- Termin sa zvezdicom (`*`) = paket aranžman → `is_package=true`, `transport_type='package'`.
  **Ne alertuje se** kao sopstveni.
- Gde agencija ima pravilo "sopstveni = paket − 30 EUR", adapter izračunava
  sopstveni red iz paket cene i eksplicitno ga označava.
- Gde postoji zasebna tabela za sopstveni prevoz, čita se ta tabela.
- Čuvamo i paket i sopstveni redove u `offers`, ali alert logika gleda samo
  `transport_type='own'`.

Svako od ovih pravila mora imati fixture test koji dokazuje tačnu ekstrakciju.
Tiho pogrešan parser je gori od mrtvog — zato testovi nad sačuvanim HTML-om.

## 9. Normalizacija & dedup

- `villa_key` = lowercase, uklonjeni dijakritici i višak razmaka iz naziva vile.
- `ppp_per_night` = `price_per_person / nights`.
- **Dedup ključ** = `villa_key | unit_type | date_from | date_to | transport_type`.
  Isti objekat sa više sajtova → jedan red; zadržava se **najniža cena** i lista
  izvora koji su ga prijavili.

## 10. Prag & relevantnost

Ponuda je **relevantna za alert** ako zadovoljava SVE:
- lokacija Kalitea, tip `1/2`, `transport_type='own'`,
- `date_from` u prozoru 1–6. avgust 2026,
- `nights ∈ {7, 10}`.

Prag: `ppp_per_night < 38 EUR`. Neodgovarajuće ponude se **snimaju** ali ne alertuju.

## 11. Notifikacije & tišina

Telegram alert se šalje samo na **promenu stanja** (poređenje po dedup ključu vs
`offer_state`, ne vs ceo prošli run):
1. **Nova ponuda za avgust** — relevantna, nema je u `offer_state`.
2. **Cena pala** — isti dedup ključ, niža `last_price` nego u `offer_state`.
3. **Ispod praga** — `ppp_per_night < 38` i nije već alertovano na toj (ili nižoj) ceni
   (`alert_state`).

Ako nema kvalifikovanih delti → **ništa se ne šalje**.

Format alert poruke (po objektu): vila, tip jedinice, termin (od–do), broj noći,
cena po osobi (sopstveni), ukupno za dvoje, ppp/noć, udaljenost od plaže, parking,
klima, izvor(i), link.

## 12. Otpornost

- Svaki adapter u `try/catch`; jedan padne → ostali nastavljaju.
- Rate limit: **sekvencijalno** sa jitter pauzom 2–5s između izvora; Playwright poslednji.
- `source_health.consecutive_failures`: na **3 uzastopna pada** istog izvora → ops-alert
  ("parser X mrtav: <razlog>").
- Ako **svi** izvori padnu u jednom runu → ops-alert (tišina inače izgleda isto kao
  "nema ništa novo").
- Svaki pad se loguje: koji izvor, koja greška, kada.

## 13. Heartbeat

Jednom dnevno (prvi run posle npr. 08:00) šalje kratku poruku: "živ sam, pratim N
relevantnih ponuda, trenutno najbolje: <vila> <cena>". Kontroliše se poljem u `runs`
ili poređenjem datuma poslednjeg heartbeat-a.

## 14. Konfiguracija (env / GitHub secrets)

`SUPABASE_URL, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
THRESHOLD_PPPPN (default 38), ARRIVAL_FROM (2026-08-01), ARRIVAL_TO (2026-08-06),
HEARTBEAT_HOUR (default 8)`

## 15. Testiranje

- **Parser unit testovi** nad `test/fixtures/*.html` — dokaz tačne ekstrakcije,
  posebno sopstveni-vs-paket split i `*` semantike.
- **Dry-run mode** — cela petlja (dedup/diff/prag/format) nad fixture-ima, ispisuje
  nameravanu notifikaciju bez slanja i bez live saobraćaja.
- Core moduli (`normalize`, `dedup`, `diff`, `threshold`) — čisti unit testovi.

## 16. Fazna izgradnja

1. **Dokaz petlje:** skele + Supabase šema + Telegram + core (dedup/diff-po-ključu/prag) +
   **lastminuteponude (Playwright)** adapter sa fixture testom + GitHub Actions
   workflow (`scrape-full.yml`, hourly). Cela petlja radi end-to-end na jednom izvoru.
   Drugi workflow (`scrape-static.yml`, `*/30`) se dodaje u fazi 2 kad postoji prvi
   statični izvor.
2. **etaturs** (statičan) + njegova parser pravila i fixture testovi.
3. **salvadortravel, halotours, hellenatravel** (statični).
4. **Polish otpornosti:** source_health + 3-fail ops-alert + all-fail alert + heartbeat.

## 17. Otvoreni rizici

- Tačan markup svakog sajta nije poznat unapred; fixture-i se prave povlačenjem
  živih stranica tokom implementacije. Ako je sajt dole ili promeni markup u toku
  rada, to se eksplicitno javlja (kroz health/ops-alert), ne prećutkuje.
- Playwright na GitHub Actions zahteva `playwright install --with-deps chromium`
  korak u workflow-u.
- Ako neki subagent kasni sa ažuriranjem u odnosu na Mayak, moguće je da propustimo
  ponudu na par sati; prihvaćen trade-off za izbegavanje Cloudflare borbe.
