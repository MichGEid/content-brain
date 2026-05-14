# Neste sesjon — handover

Sist oppdatert 2026-05-14 (etter Analytics-modul Phase 1 + Ghostwriter-integrasjon).

## TL;DR

Analytics-modulen er bygget, testet og integrert med Ghostwriter. Loopen mellom innholdsproduksjon og målbar effekt er nå lukket. **Ikke pushet til GitHub ennå** — Pages serverer fortsatt forrige versjon.

- ✅ Phase 1 (CSV-import + 4 chart-typer + engager-klassifisering)
- ✅ Demo-data-loader (16 posts × 30 connections, ingen LinkedIn-eksport nødvendig for å teste)
- ✅ Network growth-chart på Engagers-tab
- ✅ Top-performer badges i Ghostwriter Voice Profile per pilar
- ✅ Smart pilar-hint i Ghostwriter Compose (siste 8 ukers performance vs snitt)
- ✅ 43 unit-tester (32 ghostwriter + 11 analytics + 5 demo + 2 perf) — alle grønne

Bundle: 312 KB (var 218 KB før Analytics).

## 🌅 Morgen-agenda — anbefalt rekkefølge

### 1. Test demo-flyten (10 min, ingen LinkedIn-eksport nødvendig)

1. Åpne Content Brain lokalt: `npm run dev` → http://localhost:8081
2. Klikk **📊 Analytics**-tab → Importér → **🧪 Last inn demo-data**
3. Bekreft at du ser:
   - **Oversikt**: top-10 innlegg som bar, trend-linje, pilar-snitt
   - **Engagers**: 4 kategori-kort (peer/recruit/board/prospect + andre), network growth-chart, connections-tabell med override-dropdown
   - **Mønstre**: heatmap ukedag × time (16 punkter er litt sparse, men du ser ideen)
4. Klikk **🔗 Link til Pipeline** i Oversikt-toolbaren — denne kjører fingerprint-match mot Pipeline-postene dine (få treff, demo-content matcher ikke dine)

### 2. Test Ghostwriter-integrasjonen (5 min)

1. Gå til **Ghostwriter**-tab
2. I Compose: bytt pilar mellom 1/2/3/4 — du skal se ulike analytics-hint:
   - **📈 truffet 20%+ over snitt** (grønn) — bra rotasjons-timing
   - **📉 ligget 15%+ under snitt** (oransje) — vurder ny vinkling
   - **📊 nøytral** — vis bare snitt
3. Åpne **Voice Profile**-drawer → scroll til "Eksempler per pilar"
4. Bekreft at hver pilar viser "📊 4 innlegg har Analytics-data" og at toppen-3 har **#1/#2/#3-badge** ved siden av tittelen
5. Bekreft at top-performers sorteres øverst i hver pilar-liste

### 3. Når du er klar med ekte data (kan ta tid)

1. LinkedIn → Settings & Privacy → Data privacy → **Get a copy of your data**
2. Velg **den øverste radioknappen**: "Download larger data archive, including connections, verifications, contacts, account history…"
   - ⚠️ IKKE "Want something in particular" — den ruten gir bare Articles/Invitations/Profile/Recommendations/Registration, ingen av filene vi trenger
3. Klikk **Request archive** (LinkedIn ber deg sannsynligvis bekrefte passord)
4. Vent på e-post (10 min – 24 t, ofte raskere). Nedlastings-lenken gjelder ~72 t, så ikke vent for lenge
5. Last ned ZIP, hent ut .csv-filene
6. Slett demo-data først hvis du har det inne: Analytics → Importér → **Slett all analytics-data**
7. Analytics-tab → Importér → drag/drop `Shares.csv`, `Comments.csv`, `Connections.csv` (de andre CSV-filene fra arkivet kan ignoreres)
8. Klikk **🔗 Link til Pipeline** så ekte innlegg får pilar-tagging

### 4. Push til GitHub

Når du er fornøyd lokalt:

```bash
cd ~/Documents/Claude/Projects/Content\ Brain
git add .
git status                                       # sjekk hva som er nytt
git commit -m "Analytics module: CSV import, 4 charts, Ghostwriter feedback loop"
git push origin main
```

Pages-deploy tar ~1 min via GitHub Actions. StaticCrypt-passordet ditt er sikret som secret allerede.

## Hva som er endret siden Phase 7

**Nye filer:**
- `analytics/csv-parser.js` (304 linjer) — RFC 4180 CSV + LinkedIn-format-deteksjon
- `analytics/analytics-store.js` (218 linjer) — localStorage + dedupe + Pipeline-link
- `analytics/classifier.js` (130 linjer) — peer/recruit/board/prospect/other-heuristikk
- `analytics/dashboard.js` (~480 linjer) — 5 vanilla SVG-charts (bar/line/pilar/heatmap/growth)
- `analytics/demo-data.js` (~180 linjer) — 16 realistiske posts + 30 connections
- `analytics/analytics.js` (~470 linjer) — tab-orchestrator + top-performers-API
- `scripts/test-analytics.js` (~400 linjer, 19 tester) — full coverage
- `ANALYTICS.md` — arkitektur, datakilder, neste-fase-roadmap

**Endrede filer:**
- `index.html` — ny "📊 Analytics"-tab, 6 nye script-tags
- `app.js` — Analytics.init() i activateTab, backup/restore + reset inkluderer analytics
- `scripts/build.js` — ANALYTICS_MODULES-array (6 moduler bundles)
- `package.json` — test-script kjører test-analytics.js, test:analytics-target
- `style.css` — +~260 linjer for analytics (charts, tabeller, hints, badges)
- `ghostwriter/voice-profile.js` — viser top-performer-badges fra Analytics
- `ghostwriter/ghostwriter.js` — renderAnalyticsHint() over Anker-input i Compose
- `STATUS.md` — Phase 8 lagt til

## Hva vi har lært (verdt å huske)

- **Vanilla SVG-charts holder bundle ren.** Vurderte Chart.js fra CDN først, men det ville brutt build.js' "ingen eksterne .js"-sanity-check. SVG-charts er ~480 linjer totalt, og full kontroll over stilen er en bonus.
- **Sykehus-Director → prospect (ikke peer).** Klassifikator-rekkefølge er bevisst: en Director ved et sykehus er primært en kunde i medtech-konteksten din. Override-mekanismen lar deg flippe enkelttilfeller via tabellen.
- **Fingerprint-match på 0.4 token-overlap.** Lavt nok terskel til at LinkedIn-post-format (med URL-er, hashtags, emojis) treffer Pipeline-titler/bodies. Falsk-positiv-risiko håndteres via "🔗 Link til Pipeline"-rerun-knapp.
- **LinkedIn-eksport gir KUN dine egne handlinger ut.** Reactions.csv = dine likes, Comments.csv = dine kommentarer. For engagers PER innlegg (hvem har likt/kommentert dine poster) trenger man Shield Analytics ($10/mnd) eller scraping. Vi støtter ikke det enda — Phase 2.

## Hva som gjenstår (Phase 2+)

- **Engagers per innlegg** — krever Shield Analytics-import eller scraping. Vi har struktur klar.
- **Bulk-import gamle LinkedIn-poster** til Pipeline med pilar-tagging — gjør analytics linking enklere.
- **Best-time-anbefaling** — heatmap viser dataen; konkret "post tirsdag 09:00"-anbefaling i Compose mangler.
- **Standalone HTML-rapport-eksport** — for styre-prat eller egen refleksjon.
- **Phase 3 i original Ghostwriter-plan:** backend for scheduled publishing.

## Sanity-tester du bør kjøre

```bash
cd ~/Documents/Claude/Projects/Content\ Brain
npm run test                     # 43 unit-tester, skal alle passere
node scripts/build.js --bundle-only   # skal produsere dist/index.html ~312 KB
```

Hvis testene feiler, sjekk at `analytics/`-mappen finnes og at modulene er der.

## Når vi snakkes igjen

Åpne ny chat i Content Brain-prosjektet og skriv noe som *"Klar for neste økt — Analytics er testet."* Da vet jeg hvor vi er, og kan foreslå neste skritt (Shield-integrasjon, bulk-import, eller noe annet du har lyst på).
