# Neste sesjon — handover

Sist oppdatert 2026-05-23 (etter Phase 16 — Analytics-polishbølge).

## TL;DR

Hele Analytics-modulen har blitt strammet etter at Michel begynte å
bruke den i praksis. Pillar-snitt er nå ærlige (tomme poster regnes
ikke med), Skjul-funksjonen virker konsistent i begge retninger, og
duplikat-detektoren fanger flere par enn ren fingerprint-match.

Bundle 470 KB. 161 tester grønne. 16 Phase-leveranser totalt.

## Hva som er pushet i dag (2026-05-23)

7 commits i Phase 16-sekvensen:
- `b37fb83` Mangler-tall-fiks + full body i modal + Skjul-fra-analyse
- `c137d51` Badge fra 📌 Pipeline → ⏳ Mangler tall + oransje farge
- `49cfb95` v0.16: drill-down + klikkbare dots + sortering + Vis mer
- `b4665c6` v0.16.1: tydeligere Skjul-knapp + Slett bare demo-data
- `cdab7ff` v0.16.2: Skjul-knapp som SVG-sirkel + Finn duplikater
- `47838cc` v0.16.3: untick-fiks + inline Vis skjulte + bredere dup-detektor
- `8b766e2` v0.16.4: ekskluder 0-engagement-poster fra snitt
- `67aa964` v0.16.5: layout-overlap-fiks i Per pilar-rader

## Anbefalt flyt nå

Systemet er ferdig nok for daglig bruk. Min ærlige anbefaling: ikke bygg
mer denne uken. Bruk systemet, la friksjonen melde seg, og bring den
til neste økt.

Konkret ukentlig rutine:
1. Mandag: kjør Inspirasjon på leadership-in-tech-nyhetsbrev → legg
   1-2 forslag til Pipeline-idé
2. Onsdag: jobb idé til Klar via Ghostwriter (article-reaction-modus
   eller standard) — bruk Voice Profile sin tone slider per pilar
3. Torsdag eller fredag: publiser på LinkedIn → mark som Publisert i
   Pipeline med URL og dato → live-hook syncer til Analytics → fyll
   inn tall fra LinkedIn-app uka etter
4. Søndag: sjekk Analytics → klikk pilar-raden for å se hvilke poster
   som lå bak snittet → bruk det som rotasjons-input neste uke

## Phase 17-kandidater (ingen ligger akutt på)

- **Voice-coaching med few-shot:** gi LLM 2-3 av Michels faktiske
  publiserte poster som few-shot eksempler i prompten (utvidelse av
  michelPosts-blokken)
- **Bulk-import gamle LinkedIn-poster** til Pipeline med pilar-tagging
- **Calendar-tab integrasjon med Ghostwriter** — "Plassér…"-knappen
  ruter direkte til Ghostwriter for ukens pilar
- **Backend for scheduled publishing** (bryter gratis-stack)
- **Standalone HTML-rapport-eksport** fra Analytics (for styre-prat)
- **"Hjelp meg fylle inn"-knapp** på Inspirasjon-suggestion-cards som
  ber LLM stille spørsmål til Michel for å finne den ekte scenen
- **Per-modell-feedback-loop:** lagre om Sonnet vs Flash vs Claude
  gir bedre output for hvilke pilarer og foreslå optimal default

Ingen av disse løser et konkret problem rapportert ennå — så de bør
vente til faktisk bruk avgjør prioritet.

## Sanity-tester ved oppstart

```bash
cd ~/Documents/Claude/Projects/Content\ Brain
npm run test                          # 161 unit-tester
node scripts/build.js --bundle-only   # dist/index.html ~470 KB
```

## Når vi snakkes igjen

Si noe sånt som *"Klar for neste økt — har brukt systemet noen dager"*.
Da plukker jeg opp herfra og spør om hva som faktisk frustrerte deg i
løpet av uken, slik at vi bygger basert på reell friksjon.
