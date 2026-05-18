# Neste sesjon — handover

Sist oppdatert 2026-05-18 (etter Phase 9 — Pipeline reorder).

## TL;DR

Pipeline-kort kan nå reorderes manuelt med drag-and-drop og ↑/↓-knapper.
Endringen er pushet til `main` og lever på Pages. Bundle er ~369 KB.
82 unit-tester passerer.

- ✅ `sortIndex`-felt på posts med automatisk migrasjon
- ✅ HTML5 drag-and-drop (innen lane + krys-lane)
- ✅ Visuelle drop-indikatorer (linje over/under målkortet)
- ✅ Hover-synlige ↑/↓-knapper i kort-header
- ✅ Nye posts havner alltid på toppen av sin lane

## 🌅 Anbefalt rekkefølge neste økt

### 1. Røyk-test drag-and-drop i prod (3 min)

1. Åpne https://michgeid.github.io/content-brain/ (StaticCrypt-passord)
2. **Pipeline**-tab → bekreft at lanene rendres som før (sortering bør være
   identisk med før — migrasjon bevarer rekkefølgen)
3. Dra et kort innen samme lane → slipp et annet sted → bekreft at det blir
   stående der etter F5 (reload)
4. Dra et kort fra "Idé" → "Klar" → bekreft status endres og kortet ligger
   i target-lane
5. Hover over et kort → bekreft at ↑/↓-knappene dukker opp → klikk → bekreft
   ett-hakks flytting
6. Lukk og åpne fanen igjen → rekkefølgen skal være persistent

### 2. Kjent UX-hull (kandidat for kjapp fiks)

Når et kort endrer status via **dropdown i edit-modal** (ikke via drag),
bevarer det sin gamle `sortIndex`. Det betyr at det kan lande midt i den
nye lanen istedenfor på toppen (som ville matchet intuisjonen "nettopp
flyttet = øverst"). Drag-and-drop og ↑/↓ er upåvirket — bare edit-modal-
flowen.

**Fiks (5 min):** I `#edit-form` sin submit-handler i `app.js`, etter
`if (p.publishedAt ...)`/`if (p.scheduledFor ...)`-nudgene, sjekk om status
endret seg, og hvis ja: `p.sortIndex = minSortIndexInLane(p.status) - 1`.

### 3. Nyhetsbrev-saken som ligger på vent

Michel sendte Leadership in Tech #311 (14. mai 2026) — John Cutler-
artikkelen om "glue people" treffer Pilar 1 (Connective leadership) rett.
URL: `https://leadershipintech.com/newsletters/2277?sid=bdea9f87-f72c-4075-896f-499f5e0044ee`

Når han er klar: capture som idé med URL → "→ Ghostwriter" → article-reaction-
modus åpner automatisk (smart routing fra Phase 2.5).

### 4. Phase 10-kandidater (større skritt)

Når drag-and-drop er rotfast og nyhetsbrevet er kjørt:

- **Bulk-import gamle LinkedIn-poster** til Pipeline med pilar-tagging
  (gjør analytics-linking enklere — også Phase 2+ i Analytics-roadmap).
- **Calendar-tab integrasjon med Ghostwriter-poster** — "Plassér…"-knappen
  ruter direkte til Ghostwriter for ukens pilar hvis ingen draft eksisterer.
- **Backend for scheduled publishing** — første gang vi bryter gratis-stack-
  prinsippet, så krever bevisst avgjørelse.
- **Standalone HTML-rapport-eksport** fra Analytics — for styre-prat eller
  egen refleksjon.
- **Engagers per innlegg** (Shield Analytics-integrasjon) — vi har struktur,
  mangler datakilde.

## Sanity-tester du bør kjøre etter ny økt

```bash
cd ~/Documents/Claude/Projects/Content\ Brain
npm run test                          # 82 unit-tester
node scripts/build.js --bundle-only   # produserer dist/index.html ~369 KB
```

## Når vi snakkes igjen

Åpne ny chat i Content Brain-prosjektet og skriv noe som
*"Klar for neste økt — drag-and-drop fungerer."* Da plukker jeg opp her,
fra UX-hullet i edit-modalen eller fra nyhetsbrevet, alt etter hva du
er lysten på.
