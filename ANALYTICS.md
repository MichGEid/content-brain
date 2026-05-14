# Analytics — LinkedIn Performance Dashboard

**Status:** Phase 1 (CSV-spor) — ferdig 2026-05-13. Modulen lever ved siden av Ghostwriter under `analytics/` og deler ingen state med kjerne-app-en, slik at den kan slås av/på uten å påvirke Pipeline.

## Hvorfor

For å lukke loopen mellom innholdsproduksjon (Ghostwriter, Pipeline) og målbar effekt på LinkedIn. Vi har ingen offentlig API mot personlige LinkedIn-sider, så vi går via LinkedIns dataeksport:

> **Settings & Privacy → Data privacy → Get a copy of your data → "Want something in particular" → hak av Posts, Comments, Connections.**

Filene kommer som .csv i en ZIP i løpet av ~10 minutter til 24 timer. Last opp i Analytics-tab → Importér.

## Arkitektur

```
analytics/
├── csv-parser.js         ← robust CSV (RFC 4180, BOM, quoted fields, escaped quotes)
│                            + LinkedIn-format-deteksjon (filnavn + kolonneheuristikk)
├── analytics-store.js    ← localStorage["contentBrain.analytics"]
│                            { postMetrics, connections, engagerTags, imports, lastImportAt }
├── classifier.js         ← heuristikk: peer / recruit / board / prospect / other
│                            (override via UI lagres permanent)
├── dashboard.js          ← vanilla SVG-charts: bar, line, pilar-bar, heatmap
│                            (ingen Chart.js — bevisst, holder bundle selvstendig)
└── analytics.js          ← orchestrator: tab-UI, sub-tabs, import-flow
```

## Datakilder vi støtter

| LinkedIn-fil       | Innhold                                                | Hva vi bruker det til                  |
|--------------------|--------------------------------------------------------|----------------------------------------|
| `Shares.csv`       | Dine egne innlegg + impressions/likes/comments/shares  | Per-post metrics, trend, pilar-snitt   |
| `Connections.csv`  | Hele nettverket: navn, headline, firma, dato           | Engager-klassifisering, mix-analyse    |
| `Comments.csv`     | Dine egne kommentarer (Date, URL, Message)             | Lagres for historikk, ikke aggregert¹  |
| `Reactions.csv`    | Dine egne reactions (Date, Type, Link)                 | Lagres for historikk, ikke aggregert¹  |

¹ LinkedIns eksport gir kun **dine egne** handlinger, ikke hvem som har engasjert seg med dine innlegg. For engasjement-per-person må du enten scrape eller bruke et verktøy som Shield Analytics. Phase 2 (planlagt) håndterer dette via manuell tagging eller Shield-import.

## Linking til Pipeline

Etter import kjøres `linkToPipeline()` automatisk. Den prøver å matche hver metric mot eksisterende Pipeline-poster via:

1. Tittel + body → fingerprint (lowercase, fjern URL/hashtags/spesialtegn, første 120 tegn)
2. Token-overlap-score mot post-content fingerprint
3. Match aksepteres ved score ≥ 0.4

Når en metric er linket, propagerer Pipeline-postens pilar over til charts/aggregering. Manuell re-link via "🔗 Link til Pipeline"-knappen.

## Engager-klassifisering

`classifier.js` har 4 regelblokker i prioritert rekkefølge (board → prospect → peer → recruit). Designvalg for Michels medtech-kontekst:

- **board** vinner over alt: "Chairman", "Investor", "Advisor", "Partner".
- **prospect** vinner over peer når firma matcher helse-vokabular: en Director ved et sykehus er primært en potensiell kunde, ikke en peer i industrien.
- **peer** matcher senior leadership-titler: Director/Head of/VP/CXO/Founder.
- **recruit** matcher IC-engineers og leads: Senior/Staff/Principal Engineer, Tech Lead, Engineering Manager.
- **firma-hint** slår inn som siste resort: Medtronic/Philips/GE → peer, sykehus → prospect.

Override per person via dropdown i tabellen. Override lagres permanent i `engagerTags`.

## UI-struktur

Analytics-tab → fire sub-tabs:

- **Oversikt** — top innlegg, trend, pilar-snitt. Metric-velger (engagements/impressions/likes/comments).
- **Engagers** — kategori-breakdown + filtrerbar connections-tabell med override-dropdown.
- **Mønstre** — heatmap ukedag × time basert på snitt-engasjement.
- **Importér** — dropzone, log, lagret-data-oversikt, slett-knapp.

## Test-coverage

`scripts/test-analytics.js` — 36 unit-tester som dekker:

- CSV: BOM, quoted fields, escaped quotes, header-detection
- Format-deteksjon: filnavn + kolonneheuristikk
- Dato-parsing: ISO, "YYYY-MM-DD HH:MM:SS UTC", MM/DD/YYYY
- Fingerprint: identisk = 1.0, delvis overlapp 0–1
- Klassifikator: alle 5 kategorier + override-prioritet + rekkefølge-regel
- Store: dedupe på URL og date+fingerprint, dedupe på navn, recordImport-cap

Kjør: `npm run test:analytics` eller `npm run test` (hele suiten, 32 ghostwriter + 36 analytics = 68 tester).

## Backup/restore

Analytics-data inkluderes nå i backup-flowen i `app.js`. Format v0.7-backup utvidet:

```json
{
  "version": "v0.7-backup",
  "exportedAt": "...",
  "contentBrain": { ...posts, meta... },
  "ghostwriter": { ...editLearning, ui, draft... },
  "analytics":   { ...postMetrics, connections, engagerTags, imports... }
}
```

Import detekterer felt automatisk og restorer all tre seksjoner. "Nullstill" tømmer også analytics.

## Hva som ikke er gjort enda (Phase 2 / 3)

- **Engagers per innlegg** — krever Shield Analytics-import eller manuell scraping. Vi har struktur for det, men ingen import-rute enda.
- **Network growth chart** — Connections.csv har "Connected On"; trivielt å plotte. Ikke implementert.
- **Ghostwriter-feedback** — feed topp-performers per pilar inn som few-shot. Krever Phase 4-arbeid i `ghostwriter/voice-profile.js`.
- **Best-time-anbefaling** — heatmap viser dataen; konkret anbefaling i Compose-UI mangler.

## Estimat etterevaluert

Phase 1 lå estimert på 15–22 timer totalt. Levert på ~1 sesjon takket være at Ghostwriter-mønsteret var modent å mirrore. Bundle gikk fra 218 KB → 288 KB.
