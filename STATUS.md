# Status — Content Brain + Ghostwriter

Sist oppdatert 2026-05-01 (kveld).

## Helhetlig status

```
┌─────────────────────────────────────────────────────────┐
│  PHASE 0    StaticCrypt + Ollama        ✅ Live i prod  │
│  PHASE 1    Ghostwriter MVP             ✅ Live lokalt   │
│  PHASE 1.5  Mic, ord-teller, auto-save   ✅ Live lokalt  │
│  PHASE 2    Edit-loop + templates +     ✅ Bygget,      │
│             article reaction              må testes      │
│  PHASE 2.5  Polish (shortcuts, dark      ✅ Bygget       │
│             mode, prompt copy, etc.)                     │
│  PHASE 3    Tone slider                  ⏸️  Venter       │
│             Flere providers                              │
└─────────────────────────────────────────────────────────┘
```

## Hva er nytt siden forrige status

### Phase 2 (3 av 4 features bygget)

**Edit-feedback-loop fullt wired:**
- `recordEdit` kalles automatisk i `savePost` når output ≠ generated
- `editHistory` lagres på Pipeline-posten (generated, timestamp, model)
- Ny **"📊 Læring fra dine edits"**-seksjon øverst i Voice Profile-drawer:
  - Banlist-forslag etter 3+ forekomster av samme strøkne frase
  - Length-kalibrering (hvis du konsekvent kutter — anbefaler kortere)
  - **"+ Banliste"** og **"Ignorer"**-knapper per forslag
  - Ignored phrases dukker aldri opp igjen
  - "Slett læringsdata"-knapp i bunn

**Templates per pilar:**
- `PILLAR_INFO` utvidet med `template.structureGuidance`, `preferOpenings`, `avoidTransitions`
- Pilar 1: anker → analyse → quiet landing
- Pilar 2: scene → barnets handling → leksjon som vokser ut
- Pilar 3: problem → forsøk → hva brøt → konkret leksjon
- Pilar 4: domene A → domene B → spenningspunkt
- Myk guidance, ikke harde regler

**Article reaction mode:**
- Modus-toggle i Compose-headeren: **Standard** / **Article reaction**
- Egne felter: artikkel-URL, artikkel-tekst, din vinkel
- `buildArticleReactionUserPrompt` med strenge regler mot:
  - Sammendrag av artikkelen (kun 1-2 setninger referanse)
  - Oppdiktede sitater eller fakta
  - Navn/orgs som ikke står i den limte teksten
- Smart routing: Pipeline-kort med URL i source åpnes automatisk i denne modusen

### Phase 2.5 — polish

**Keyboard shortcuts:**
- **Cmd+Enter** (eller Ctrl+Enter) i Ghostwriter → trigger Generer
- **Esc** lukker Voice Profile-drawer

**Dark mode:**
- 🌙 **Mørkt** / ☀ **Lyst**-toggle i footer
- Default følger system-preferanse (`prefers-color-scheme`)
- Lagrer valg i localStorage
- Alle UI-komponenter inkludert pillar-dots tilpasset begge tema

**Vis prompt — kopier-knapper:**
- "Vis prompt"-knapp viser nå "Kopier"-knapper for både system og user prompt
- Klikk → kopiert til utklippstavle, "✓ Kopiert"-feedback i 1.5s

**Loading-state forbedring:**
- Pulserende elapsed-time-teller mens modellen genererer
- **Avbryt**-knapp som faktisk avbryter via AbortController
- Avbrutt generering gir ingen feilmelding (ingen alert)

**Søk i Arkiv:**
- Tekst-input i Arkiv-tab (samme stil som Pipeline-søk)
- Filtrerer på tittel + body + notater

### Test-infrastruktur

- `scripts/test-edit-tracker.js` — 12 unit-tester for n-gram diff, alle passerer
- `scripts/test-prompts.js` utvidet med `--mode article-reaction`
- `npm run test` kjører alle tester
- `npm run test:prompts` / `npm run test:edit-tracker` for individuell kjøring

### Cleanup

- `scripts/test-fewshot.py` slettet (engangs-test fra tidlig validering)
- `seed.js` har `window.SEED_POSTS = SEED_POSTS;` på siste linje (forrige bug-fiks bevart)

## Hva venter på dine beslutninger

### Tone slider per pilar

Krever at du bestemmer aksene per pilar før implementasjon:

- **Pilar 1:** strategisk ↔ personlig?
- **Pilar 2:** oppmuntrende ↔ realistisk?
- **Pilar 3:** detaljert ↔ konseptuelt?
- **Pilar 4:** norsk-fokusert ↔ globalt?

Min default-forslag i parentes. Du kan også foreslå helt andre akser.

## Bundle-status

- 155 KB ukryptert bundle
- 12/12 unit-tester passer
- All JS parser
- Ingenting pushet til GitHub fra Phase 1+

## Filer du bør se på

| Fil | Hva |
|---|---|
| `STATUS.md` (denne) | Sammendrag av hva som er bygget |
| `NEXT_SESSION.md` | Hva vi skal gjøre i neste sesjon |
| `PHASE2.md` | Designdokument med tone slider-spec |
| `GHOSTWRITER.md` | Bruker-guide oppdatert med alle features |
| `STATICRYPT.md` | Hvordan StaticCrypt-deploy fungerer |

## Kjøremoduser

```bash
# Lokal utvikling, ukryptert (anbefalt for skriveøkter med Ghostwriter)
npm run dev               # http://localhost:8081

# Lokal kryptert (test før push)
npm run build && npm run serve:dist   # http://localhost:8080

# Tester
npm run test
npm run test:prompts -- --mode article-reaction --pillar 4

# Push til prod (deployer Capture/Pipeline/Kalender/Arkiv til Pages,
# Ghostwriter blokkeres pga HTTPS→HTTP — bevisst arkitektur)
git add -A && git commit -m "Phase 2 + polish" && git push origin main
```
