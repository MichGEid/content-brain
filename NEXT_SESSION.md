# Neste sesjon — handover

Sist oppdatert 2026-05-22 (etter Phase 15 — ↻ Annet anker per kort).

## TL;DR

Inspirasjon-modulen er ferdig iterert og A/B-testet. **Begge modi gir
publiserbare ankere etter prompten ble strammet.** Velg basert på behov:

- **🤖 Auto (Gemini 2.5-flash)** — ~90 sek, gratis, daglig screening
- **✋ Manuell (Claude Sonnet via claude.ai)** — ~3-4 min, gratis (Pro),
  backup eller high-stakes

Bundle 447 KB. 161 tester grønne. Recent-anchors-eksklusjon + michelPosts holder
systemet selvkorrigerende uke-til-uke.

## Anbefalt flyt for ukentlige nyhetsbrev

1. Lim inn URL i Inspirasjon-tabben
2. Klikk Hent forslag (Auto/Flash) → få 2-3 forslag på ~10 sek
3. Hvis du synes alle treffer godt → klikk + Legg til Pipeline på de
   du vil bruke (anchor-teksten lagres som idé + automatisk eksklusjon
   neste uke)
4. Hvis noen er svake → bytt til Manuell, bygg prompt, kjør i claude.ai
   for sterkere kvalitet på de som teller mest

## Hvis Auto begynner å regurgitere igjen

Det vi har observert: prompt-iterasjonen virker, men recent-anchors-
listen kapper på 8 nyeste Pipeline-posts med URL-kilde. Etter du har
brukt systemet en stund:
- Hvis du sletter mange poster fra Pipeline, slipper du eksklusjons-
  beskyttelsen og Gemini kan regenerere gamle scener
- Hvis du publiserer mange poster med samme angle, kan recent-anchors
  faktisk bli for restriktiv

I begge tilfeller: bytt til Manuell modus med Sonnet 4.6 eller Opus 4.6
for én runde, så kommer kvaliteten tilbake.

## Phase 13-kandidater (åpne)

- **↻ Annet anker-knapp** per suggestion-card — per-kort regenerate med
  "give me a different angle" hvis du ikke vil reload hele nyhetsbrevet
- **Bulk-import gamle LinkedIn-poster** til Pipeline med pilar-tagging
  (gjenstår fra Phase 8+ Analytics-roadmap)
- **Calendar-tab integrasjon med Ghostwriter-poster** — "Plassér…"-knapp
  ruter direkte til Ghostwriter for ukens pilar
- **Backend for scheduled publishing** (bryter gratis-stack)
- **Standalone HTML-rapport-eksport** fra Analytics

## Sanity-tester ved oppstart

```bash
cd ~/Documents/Claude/Projects/Content\ Brain
npm run test                          # 161 unit-tester
node scripts/build.js --bundle-only   # dist/index.html ~447 KB
```

## SSH-status

Aktiv fra 2026-05-22. PAT "content-brain push" utløper ca 28. mai
2026 — slett den manuelt fra https://github.com/settings/tokens hvis
du vil rydde.

## Når vi snakkes igjen

Si noe sånt som *"Klar for neste økt — Inspirasjon kjører i prod"*.
Da plukker jeg opp herfra og vi tar en Phase 13-kandidat hvis du vil,
eller går videre med faktisk innholdsproduksjon (Cutler-artikkelen
ligger fortsatt som idé i Pipeline siden tidligere i mai).
