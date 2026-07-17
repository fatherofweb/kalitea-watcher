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
| Deploy/cron | **GitHub Actions** (besplatno) | Nema serverless limita, secrets+logovi ugrađeni, 0€. Railway odbačen: ne rešava blokadu (isti datacenter IP), a Actions je dovoljan. Sistem je potrošan (radi par nedelja dok se ne rezerviše). |
| Frekvencija | **Statični izvori svakih 30 min** (jedan workflow) | Dobro pokrivanje bez rizika; alert ide samo na promenu pa frekvencija ne pravi šum. |
| lastminuteponude rendering | **Statičan (Cheerio), Playwright samo kao fallback** | Provera pokazala: podaci (cene, vile) su već u server-renderovanom HTML-u (HTTP 200, Cloudflare ne izaziva challenge). Nema potrebe za headless → nema teškog otiska koji se blokira. |
| Filter po datumu dolaska | **Uklonjen** | Korisnik gleda termin sam; šalje se sve za Kaliteu bez obzira na datum polaska. |
| Okidač alerta | **Svaka NOVA Kalitea ponuda (1/2, sopstveni) + svaki pad cene** | Prag 38€/os/noć NIJE kapija — samo označava (⭐) ponude ispod reference od 380. |
| Prag (kao oznaka) | **38 EUR/os/noć** | Ponude ispod dobijaju ⭐ u poruci; ne filtriraju šta stiže. |
| Mayak Tours (Cloudflare 522) | **Preskoči direktan scraping** | Isti inventar/cene dolaze preko subagenata (Eta, Salvador...); dedup ih spaja. Nula krhkosti Cloudflare-a. |
| Kontiki | **Preskoči** | robots.txt disallow — poštuje se. |
| Heartbeat | **Da, jednom dnevno ujutru** | Da se zna da job radi; tišina inače. |
| Izvori | **Agregator (lastminuteponude) kao kičma + proširiv set portala/agencija, dedup preko svih** | Tržište je 1 agregator + N agencija; „svi last-minute sajtovi" = agregator + koliko portala dodamo. Registry-based, lako se raste. |
| Redosled izgradnje | **agregator (dokaz petlje) → dodavanje portala → polish** | Agregator je statičan i najširi; dokazuje celu petlju bez Playwright-a. |

## 3. Izvori

**Realnost tržišta:** postoji jedan pravi agregator (lastminuteponude.com) + gomila
pojedinačnih agencija. „Svi last-minute sajtovi" = agregator kao kičma + proširiv
set portala/agencija. Svaki izvor je zaseban adapter u registru; dedup ide preko svih.

**Pravilo prihvatanja izvora:** sajt koji čisto skrejpuje (server-renderovan, robots
dozvoljava, bez tvrdog challenge-a) → ide u produkciju. Sajt iza tvrdog Cloudflare-a,
čist JS bez podataka u HTML-u, ili robots-disallow → **preskače se i loguje zašto**.

| Izvor | Status | Napomena |
|---|---|---|
| lastminuteponude.com/Grčka/Kalitea/**Automobilom** | **KIČMA — AKTIVAN** (Cheerio) | Agregator. Zasebna URL kategorija za sopstveni prevoz. Pokazuje agenciju po ponudi (npr. Mayak-Tours) → pokriva ceo inventar sa atribucijom. Server-renderovan HTML (potvrđeno). |
| halotours.rs, hellenatravel.rs, clocktravel.rs, hedonictravel.rs, oktopod.rs, dreamland.travel, timtravel.rs, filiptravel.rs, dreamtours.rs | **KANDIDATI** — dodaju se u fazi 2 | Pojedinačne agencije/portali. Svaki se proveri na skrejpabilnost; prolazi → adapter + registar, pada → logovan preskok. Redosled po lakoći/čistoći markupa. |
| ~~etaturs.rs, salvadortravel.rs~~ | Niži prioritet | Mayak subagenti — isti inventar već dolazi preko agregatora sa atribucijom; dedup bi ih svakako spojio. Dodaju se samo ako treba više svežine. |
| ~~mayaktours.com~~ | Preskočeno | Cloudflare 522; pokriveno preko agregatora (Mayak vidljiv u agregatoru). |
| ~~kontiki.rs~~ | Preskočeno | robots.txt disallow — poštuje se. |

**Rizik jedne tačke otkaza** ublažen: više izvora + `source_health` + per-sajt
fail/blokada/markup-change alert (vidi §12).

## 4. Stack & runtime

- TypeScript, `strict: true`. Pokretanje kroz `tsx`.
- **Cheerio** za sve server-renderovane izvore (podrazumevano). **Playwright samo kao
  fallback** za pojedinačni izvor kome podaci nisu u HTML-u (za sada nijedan takav).
- Supabase (Postgres) za snapshotove i state.
- Telegram Bot API za notifikacije.
- GitHub Actions cron za orkestraciju.

## 5. Struktura projekta

```
src/
  sources/
    types.ts            # SourceAdapter interfejs
    registry.ts         # lista aktivnih adaptera (dodavanje = 1 upis)
    lastminuteponude.ts # kičma (aktivan)
    <portal>.ts         # dodatni portali/agencije, po jedan fajl (faza 2)
  core/
    types.ts            # Offer, RawOffer, tipovi
    normalize.ts        # villa_key, ppp_per_night, transport klasifikacija
    dedup.ts            # spajanje po ključu, najniža cena, lista izvora
    diff.ts             # poređenje po dedup ključu vs offer_state
    threshold.ts        # relevantnost + ⭐ oznaka
  store/
    supabase.ts         # klijent
    snapshot.ts         # upis offers
    offerState.ts       # poslednje viđeno stanje po ključu (za diff)
    alertState.ts       # last_alerted_price po ključu (anti-spam)
    health.ts           # source_health: consecutive_failures, last_ok_at, prelazi
  notify/
    telegram.ts         # slanje poruka
    format.ts           # formatiranje alert/ops/heartbeat poruka
  index.ts              # orkestrator (registry → scrape → dedup → diff → notify)
test/
  fixtures/             # sačuvan HTML po izvoru
  *.test.ts             # parser unit testovi + core unit testovi
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
diff. Diff se radi **po dedup ključu vs poslednje viđeno stanje**, a NE poređenjem
celog prošlog runa: ako neki izvor u datom runu padne, njegove ponude ne smeju da
budu pogrešno protumačene kao „nestale".

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

## 10. Relevantnost & prag (kao oznaka)

Ponuda je **relevantna za alert** ako zadovoljava:
- lokacija Kalitea, tip `1/2`, `transport_type='own'`.
- **Bez filtera po datumu dolaska** — korisnik gleda termin sam; šalje se sve.
- `nights` proizvoljno (obično 7 ili 10, ali se ne filtrira).

Prag `ppp_per_night < 38 EUR` **NIJE kapija** — služi samo da se ponuda označi ⭐
(ispod reference od 380/os/10 noći). Ne odlučuje da li stiže, samo kako je prikazana.

## 11. Notifikacije & tišina

Telegram alert se šalje na **promenu stanja** (poređenje po dedup ključu vs
`offer_state`, ne vs ceo prošli run):
1. **Nova ponuda** — relevantna (Kalitea, 1/2, sopstveni), nema je u `offer_state`.
2. **Cena pala** — isti dedup ključ, niža `last_price` nego u `offer_state`.

Nepromenjene ponude se **ne re-šalju** (`alert_state` čuva poslednju alertovanu cenu).
Ako nema nove ponude ni pada cene → **ništa se ne šalje**.

Ponude sa `ppp_per_night < 38` dobijaju ⭐ oznaku u poruci (ispod reference).

Format alert poruke (po objektu): vila, tip jedinice, termin (od–do), broj noći,
cena po osobi (sopstveni), ukupno za dvoje, ppp/noć, ⭐ ako ispod praga, udaljenost
od plaže, parking, klima, izvor(i), link.

## 12. Otpornost & per-sajt fail alerti

- Svaki adapter u `try/catch`; jedan padne → ostali nastavljaju.
- Rate limit: **sekvencijalno** sa jitter pauzom 2–5s između izvora.
- Svaki pad se loguje: koji izvor, koja greška, kada.

**Per-sajt notifikacije (korisnik hoće da zna ČIM nešto pukne, ne tek na 3):**
- **OK → pao (bilo koji razlog):** odmah ⚠️ poruka sa razlogom i tipom problema.
- **Tri tipa problema** se razlikuju u poruci:
  1. **Ne može da dohvati** — network/HTTP greška, timeout.
  2. **Blokada** — HTTP 403/429 ili Cloudflare challenge stranica.
  3. **Markup se promenio** — dohvatio HTTP 200 ali parser vratio **0 ponuda** gde je
     ranije (u `source_health.last_ok_at`) vraćao > 0. Verovatna promena strukture.
- **Dok i dalje pao:** ćuti (ne ponavlja istu poruku svakih 30 min).
- **Pao → OK (oporavak):** ✅ „X ponovo radi".
- **Eskalacija:** `consecutive_failures >= 3` → jači ‼️ „X mrtav 3 puta zaredom".
- **Svi izvori padnu u jednom runu:** poseban ops-alert (tišina inače izgleda isto
  kao „nema ništa novo").

## 13. Heartbeat

Jednom dnevno (prvi run posle npr. 08:00) šalje kratku poruku: "živ sam, pratim N
relevantnih ponuda, trenutno najbolje: <vila> <cena>". Kontroliše se poljem u `runs`
ili poređenjem datuma poslednjeg heartbeat-a.

## 14. Konfiguracija (env / GitHub secrets)

`SUPABASE_URL, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
THRESHOLD_PPPPN (default 38, samo za ⭐ oznaku), HEARTBEAT_HOUR (default 8)`
(Nema ARRIVAL_FROM/TO — filter po datumu je uklonjen.)

## 15. Testiranje

- **Parser unit testovi** nad `test/fixtures/*.html` — dokaz tačne ekstrakcije,
  posebno sopstveni-vs-paket split i `*` semantike.
- **Dry-run mode** — cela petlja (dedup/diff/prag/format) nad fixture-ima, ispisuje
  nameravanu notifikaciju bez slanja i bez live saobraćaja.
- Core moduli (`normalize`, `dedup`, `diff`, `threshold`) — čisti unit testovi.

## 16. Fazna izgradnja

1. **Dokaz petlje:** skele + Supabase šema + Telegram + core (dedup / diff-po-ključu /
   ⭐ oznaka) + **lastminuteponude (Cheerio, `Automobilom`)** adapter sa fixture testom
   + GitHub Actions workflow (`scrape.yml`, `*/30`). Cela petlja radi end-to-end.
2. **Dodavanje portala/agencija** iz liste kandidata (§3): za svaki — proba
   skrejpabilnosti → adapter + fixture test + upis u registar, ili logovan preskok.
   Dedup preko svih.
3. **Polish otpornosti:** `source_health` + per-sajt fail/blokada/markup-change alert
   + oporavak + 3-fail eskalacija + all-fail alert + dnevni heartbeat.

## 17. Otvoreni rizici

- Tačan markup svakog sajta nije poznat unapred; fixture-i se prave povlačenjem
  živih stranica tokom implementacije. Ako je sajt dole ili promeni markup u toku
  rada, to se eksplicitno javlja (kroz health/per-sajt alert), ne prećutkuje.
- Detaljne strane po vili na agregatoru možda zahtevaju dodatni GET po ponudi za
  polja kao klima/parking/udaljenost; ako neko polje nije dostupno bez toga, snima se
  `null` a ne izmišlja. Playwright fallback samo ako neki izvor stvarno bude čist JS.
- Za sada nijedan izvor ne zahteva Playwright (agregator je server-renderovan).
- Sistem je **potrošan** — cilj je da izdrži par nedelja dok se ne rezerviše, ne
  godinama; bias ka jednostavnosti umesto dugoročne robusnosti.
