# Neste sesjon — handover

Sist oppdatert 2026-05-22 (etter Phase 11 — Inspirasjon-modulen).

## TL;DR

📥 Inspirasjon-modulen er live på Pages. Lim inn en nyhetsbrev-URL,
LLM scorer artikler mot Michels 4-pilar-rotasjon, du klikker
"+ Legg til Pipeline" på de du vil bruke. Bundle 416 KB, 132 tester
grønne, deploy via SSH (PAT er pensjonert).

- ✅ Inspirasjon-tab med URL-input + paste-tekst fallback
- ✅ Modell-dropdown (8 preset provider+model-kombinasjoner)
- ✅ MICHEL_CONTEXT + MOMENT ARCHETYPES + anti-regurgitation
- ✅ Recent-anchors exclusion (anchors fra siste Pipeline-posts unngås)
- ✅ SSH-nøkkel for push (PAT utløper om en uke, ikke i bruk lenger)

## 🌅 Morgen-agenda — test plan A

### 1. Test prompt-iterasjonen (10 min)

Inspirasjon-modulen gikk gjennom flere iterasjoner i går kveld pga
regurgitation. Plan A — fjerning av positive eksempler — er live på
main. Test om det virker:

1. Åpne https://michgeid.github.io/content-brain/ (StaticCrypt-passord)
2. Inspirasjon-tab → behold default-modell (Gemini 2.5-flash)
3. Paste samme URL som i går: `https://leadershipintech.com/newsletters/2261?sid=bdea9f87-f72c-4075-896f-499f5e0044ee`
4. Klikk **Hent forslag**

**Forventet:**
- 3 forslag på tvers av Pilar 1, 3, 4 (diversitet)
- Ankerne skal være ANDRE moment enn AED-demo / J2020 Sørmarka / Content Brain 22:00 — som var de tre overbrukte sist
- Ingen tail-setninger som "This article shows…" eller "resonates with…"

**Hvis ankerne FORTSATT er de samme tre:**
- Plan A fungerte ikke — Gemini Flash er for bokstavelig
- Bytt til Gemini 2.5-pro i dropdown for én test (du har ~25 kall/dag igjen)
- Hvis 2.5-pro fortsatt regurgiterer, prøv Claude haiku-4-5 (~5 øre/kall)
- Si fra hva som skjedde

### 2. Hvis Plan A virker — test recent-anchors exclusion (5 min)

1. Klikk "+ Legg til Pipeline" på ett av forslagene (f.eks. Sinofsky/Pilar 4)
2. Refresh Inspirasjon-tabben
3. Paste samme URL igjen → klikk Hent forslag
4. **Forventet:** Pilar 4-anker skal nå være ANNERLEDES enn det første du la til.
   Recent-anchors-mekanismen passer på at samme angle ikke kommer to ganger.

### 3. Hvis alt fungerer — kjør ett ekte nyhetsbrev

Test med et faktisk Leadership in Tech-nyhetsbrev fra denne uka.
Goal: 90-sek-flyten fra URL til Pipeline-idé.

## Kjente kandidater å vurdere neste

- **↻ Annet anker-knapp** per suggestion-card — per-kort regenerate hvis
  ankeren ikke treffer, uten å re-fetche hele nyhetsbrevet. Sparer
  rate-limit-kall hos Gemini.
- **Bulk-import gamle LinkedIn-poster** (gjenstår fra Phase 8+)
- **Backend for scheduled publishing** (bryter gratis-stack)
- **Cutler-artikkelen** som ligger som idé i Pipeline siden tidligere
  i mai — verdt en runde i Ghostwriter article-reaction.

## SSH-migrasjon (siden i går)

- Den gamle PAT-en "content-brain push" utløper om noen dager (ca 28. mai)
- SSH-nøkkel er registrert på GitHub som "Mac — Content Brain"
- `origin` peker nå på `git@github.com:MichGEid/content-brain.git`
- Push fra terminal trenger ikke passord lenger
- Den gamle PAT-en kan slettes manuelt fra
  https://github.com/settings/tokens hvis du vil ha det ryddig

## Sanity-tester ved oppstart

```bash
cd ~/Documents/Claude/Projects/Content\ Brain
npm run test                          # 132 unit-tester
node scripts/build.js --bundle-only   # produserer dist/index.html ~416 KB
```

## Når vi snakkes igjen

Si noe sånt som *"Klar for neste økt — har testet Inspirasjon"*. Da
plukker jeg opp herfra og vet hva slags resultater du fikk på Plan A
og recent-anchors.
