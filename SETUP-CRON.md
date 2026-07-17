# Pouzdano na 30 min (cron-job.org → GitHub dispatch)

GitHub `schedule` prigušuje na 1–2h. Da bi radilo tačno svakih 30 min, spoljni servis
okida workflow preko `workflow_dispatch` API-ja (izvršava se odmah). Besplatno, ~5 min.

## 1. Napravi GitHub token (fine-grained)
1. Idi na https://github.com/settings/personal-access-tokens/new
2. **Token name:** `kalitea-cron`
3. **Expiration:** npr. 90 dana (dovoljno — alat je potrošan)
4. **Repository access:** Only select repositories → **kalitea-watcher**
5. **Permissions → Repository permissions → Actions:** **Read and write**
6. Generate token → **kopiraj ga** (vidi se samo jednom).

## 2. Napravi nalog na cron-job.org i dodaj job
1. https://cron-job.org → Sign up (besplatno).
2. Create cronjob:
   - **Title:** Kalitea scrape
   - **URL:** `https://api.github.com/repos/fatherofweb/kalitea-watcher/actions/workflows/scrape.yml/dispatches`
   - **Schedule:** Every 30 minutes (ili „Every 30 minutes" preset)
3. **Advanced / Request settings:**
   - **Request method:** `POST`
   - **Request headers** (dodaj sva tri):
     - `Authorization: Bearer <NALEPI_TOKEN_IZ_KORAKA_1>`
     - `Accept: application/vnd.github+json`
     - `X-GitHub-Api-Version: 2022-11-28`
   - **Request body:** `{"ref":"main"}`
4. Save. Uključi „Enable job".

## 3. Provera
- cron-job.org ima „Run now" / „Test run" — klikni; treba HTTP **204** (uspeh, bez tela).
- U GitHub-u: Actions → videćeš novi run pokrenut kao `workflow_dispatch` na vreme.

## Napomene
- GitHub `schedule` (`*/30`) ostaje kao rezerva; concurrency grupa spečava dupli run.
- Ako token istekne (90 dana), samo napravi novi i zameni u cron-job.org headeru.
- Alternativa (plaća se): Railway cron deploy — pouzdano, ali ~3–5€/mes posle trial-a.
