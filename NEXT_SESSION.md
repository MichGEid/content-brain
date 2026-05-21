# Neste sesjon — handover

Sist oppdatert 2026-05-21 (etter Phase 10 — Analytics auto-sync fra Pipeline).

## TL;DR

Du kan nå publisere et nytt LinkedIn-innlegg, markere Pipeline-kortet som
Publisert med URL og dato, og raden dukker opp i Analytics → Mangler
metrikker automatisk. Ingen LinkedIn-CSV-eksport for ukentlige innlegg
mer. Bundle ~375 KB. 92 unit-tester grønne.

- ✅ Phase 9.1: Edit-modal sortIndex-fiks (status-endring via dropdown
  flytter posten til toppen av ny lane)
- ✅ Phase 10: `syncPublishedPostsToMetrics` med init-hook og live-hook
- ✅ Pipeline-sourced rader merkes med 📌-badge i metrics-tabellen
- ✅ 10 nye unit-tester

## 🌅 Anbefalt rekkefølge neste økt

### 1. Røyk-test live-flyten i prod (3 min)

Forutsetter at endringene fra v0.10 er pushet til main:

1. Åpne https://michgeid.github.io/content-brain/ (StaticCrypt-passord)
2. Pipeline → finn et innlegg du har publisert
3. Klikk kortet → sett status til **Publisert**, dato i Publisert-feltet,
   lim inn LinkedIn-URL → Lagre
4. Bytt til **Analytics**-tab → **Mangler metrikker** (eller filteret som
   står på fra forrige økt)
5. Du skal se posten i tabellen med en 📌 Pipeline-badge ved siden av
   "Vis detaljer"-knappen
6. Skriv inn visn/likes/komm/shares → tab/klikk ut av feltet → ✓ Lagret
7. Bekreft at reload bevarer tallene

### 2. Cutler-artikkelen som ligger på vent

Leadership in Tech #311 (14. mai 2026) — John Cutler om "glue people" —
treffer Pilar 1 (Connective leadership). URL:
`https://leadershipintech.com/newsletters/2277?sid=bdea9f87-f72c-4075-896f-499f5e0044ee`

Når du er klar: capture som idé i Pipeline med URL → "→ Ghostwriter" →
article-reaction-modus åpner automatisk (smart routing fra Phase 2.5).

### 3. Mulige Phase 11-kandidater

- **Bulk-import gamle LinkedIn-poster** til Pipeline med pilar-tagging
  (også Phase 2+ i Analytics-roadmap) — gjør sync-funksjonen mer
  produktiv ved å backfille historisk data
- **Calendar-tab integrasjon med Ghostwriter-poster** — "Plassér…"-knappen
  ruter direkte til Ghostwriter for ukens pilar hvis ingen draft eksisterer
- **Backend for scheduled publishing** — første gang vi bryter gratis-stack-
  prinsippet, så krever bevisst avgjørelse
- **"Mangler URL"-varsel** på Pipeline-kort som er Publisert uten LinkedIn-
  URL (ellers fanger ikke sync-funksjonen dem)
- **Standalone HTML-rapport-eksport** fra Analytics — for styre-prat eller
  egen refleksjon

## Kjente begrensninger etter Phase 10

1. **Posts uten LinkedIn-URL fanges ikke** av sync-funksjonen. Det er
   bevisst (URL er hovednøkkelen for matching), men det betyr at du må
   huske å fylle inn URL-feltet i edit-modalen.
2. **Live-hook fyrer på hver upsertPost av en published post** — ikke bare
   ved status-overgangen. Idempotent, så ingen praktisk konsekvens, men
   det ringer Analytics-modulen oftere enn strengt nødvendig.
3. **Pipeline-sourced rader er fortsatt "ekte" data** så snart du fyller
   inn tall. Hvis du senere importerer LinkedIn-CSV, blir radene
   oppdatert med eksport-data via URL-dedupe. Da overskriver eksport-
   tall det du har skrevet inn manuelt.

## Sanity-tester du bør kjøre etter ny økt

```bash
cd ~/Documents/Claude/Projects/Content\ Brain
npm run test                          # 92 unit-tester
node scripts/build.js --bundle-only   # produserer dist/index.html ~375 KB
```

## Når vi snakkes igjen

Åpne ny chat i Content Brain-prosjektet og skriv noe som
*"Klar for neste økt — Analytics-sync er testet."* Da plukker jeg opp her,
fra Cutler-artikkelen eller en av Phase 11-kandidatene, alt etter hva du
er lystig på.
