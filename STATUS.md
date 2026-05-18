# Status — Content Brain + Ghostwriter + Analytics

Sist oppdatert 2026-05-18. Versjon: v0.9 med Pipeline reorder (drag-and-drop + ↑/↓).

## Helhetlig status

```
┌────────────────────────────────────────────────────────────┐
│  Phase 0    StaticCrypt + Ollama         ✅ Live i prod     │
│  Phase 1    Ghostwriter MVP              ✅ Live            │
│  Phase 1.5  Mic, ord-teller, auto-save   ✅ Live            │
│  Phase 2    Edit-loop + templates +      ✅ Live            │
│             article reaction                                 │
│  Phase 2.5  Polish (shortcuts, dark      ✅ Live            │
│             mode, prompt copy, etc.)                         │
│  Phase 3    Tone slider med Michels      ✅ Live            │
│             akser (P1=30, P2=20,                             │
│             P3=20, P4=70)                                    │
│  Phase 4    Conversational refinement    ✅ Live            │
│             med Spør/chat                                    │
│  Phase 5    Gemini provider + URL-       ✅ Live            │
│             context fetching                                 │
│  Phase 6    Claude provider              ✅ Live            │
│  Phase 7    Datatap-beskyttelse          ✅ Live            │
│             (auto-Draft til Pipeline,                        │
│             beforeunload, backup)                            │
│  Phase 8    Analytics-modul (CSV-spor)   ✅ Live (2026-05-13)│
│             CSV import + 4 chart-typer +                     │
│             engager-klassifisering                           │
│  Phase 9    Pipeline reorder             ✅ Live (2026-05-18)│
│             sortIndex + HTML5 drag-and-drop +                │
│             ↑/↓-knapper, cross-lane status-shift             │
│  Tests      82 unit-tester (32 GW +      ✅ Alle passerer    │
│             50 Analytics)                                    │
└────────────────────────────────────────────────────────────┘
```

## Hele system-arkitekturen

### Lagring

```
localStorage (per origin):
├── contentBrain.v1          → posts, meta, voiceProfile (kjernedata)
├── contentBrain.theme       → "light" | "dark"
├── contentBrain.lastBackup  → ISO timestamp av siste manuelle backup
├── contentBrain.analytics   → postMetrics, connections, engagerTags, imports
├── ghostwriter.ui           → provider, model, pillar, lengthKey, composeMode, toneByPillar
├── ghostwriter.draft        → pågående samtale (anchor, conversation, autoDraftPostId, etc.)
├── ghostwriter.apiKeys      → Gemini + Claude API-nøkler
└── ghostwriter.editLearning → edit-tracker n-gram statistikk
```

**Backup-strategi:**
- **Innenfor sesjon:** auto-save av samtaler som Pipeline-Draft
- **Mellom sesjoner:** manuell 📦 Backup-knapp i footer (laster ned JSON)
- **Hvis Safari ITP wiper data:** importer siste backup-fil

### Providere

| Provider | Default-modell | Kjøremodus | Kostnad | Kvote |
|---|---|---|---|---|
| Ollama | llama3.1:8b | Lokal HTTP, krever brew services | $0 | Ingen |
| Gemini | gemini-2.0-flash | Gratis tier API | $0 | 15 RPM, 1500/dag (flash) |
| Claude | claude-sonnet-4-6 | Kreditt-basert API | ~$0.012/utkast | Kun saldo |

### Modi

```
Compose-modus:
├── Standard          → anchor + idea → kort/standard/lang utkast
└── Article reaction  → URL/tekst + vinkel → reaksjons-utkast

I Article reaction + Gemini:
└── URL-only (Gemini henter selv via url_context)

Conversation-flyt:
├── Generer           → første draft-turn
├── Forbedre (↻)      → revisjon med [REVISE THE DRAFT]-markør
└── Spør (?)          → svar uten å rewrite, [QUESTION]-markør
```

### Voice Profile

- **Stilbeskrivelse** (kort tekst)
- **Banlist** (~27 fraser default + dine egne)
- **Regler** (8 default + dine egne)
- **Eksempler per pilar** (1-5 manuelle, eller auto fra samme pilar)
- **Tone slider per pilar** (lagres separat per pilar)
- **Synk-knapp** (merger nye defaults uten å miste customizations)

### Læring fra dine edits

Når du redigerer et generert utkast og lagrer til Pipeline, sammenligner
edit-tracker den genererte vs din endelige versjon:

- Strøk fraser → kandidater til banliste (≥3 forekomster = forslag)
- Tilføyde fraser → kandidater for Voice Profile-utvidelse
- Lengde-delta → kalibrering av default-lengde

### Sikkerhet

- **StaticCrypt** krypterer hele bundle på Pages → krever passord
- **API-nøkler** lagres lokalt, sendes kun direkte til provider
- **Anthropic browser-kall** bruker `dangerous-direct-browser-access`-flag
  (akseptabelt for personlig bruk på StaticCrypt-beskyttet origin)
- **Ingen telemetri** — alt foregår på din maskin eller direkte med
  provider

## Test-coverage

```bash
npm run test                # alle 82 tester
npm run test:edit-tracker   # 12 tester for n-gram diff + suggestions
npm run test:conversation   # 20 tester for prompt-bygging og selectExamples
npm run test:analytics      # 50 tester for parser, classifier, store, demo, top-perf
npm run test:prompts        # CLI for å se generert system+user prompt
```

Test-områder:
- ✓ Edit-tracker: findRemovedPhrases, isSubstantialEdit, recordEdit,
  getBanlistSuggestions, ignorePhrase, getStats, getLengthCalibration, reset
- ✓ Conversation: type-markører (iterate vs ask), role-mapping,
  rekkefølge, blanding av modi
- ✓ Tone instruction: lean low/high/balanced, format, value-clamping
- ✓ selectExamples: manual override, cap, fallback til andre pilarer
- ✓ Analytics: CSV-parser, classifier, store/dedupe, demo-data, top-performers

Ikke dekket av automatiske tester (krever browser/DOM):
- autoSaveDraftToPipeline (men dekket av code-review)
- Mic-funksjonalitet (krever mikrofon)
- Auto-retry på 429 (krever live API-feil)
- UI-interaksjoner (manuell test)

## Kjente begrensninger

1. **Safari ITP wiper localStorage på `michgeid.github.io`** etter ~7
   dager. Mitigering: bruk Chrome, eller slå av cross-site tracking,
   eller ta jevnlige backups.

2. **Multiple Ghostwriter-faner** kan opprette duplikate auto-Drafts
   hvis du genererer i begge samtidig. Sjelden problem.

3. **Manuell redigering av Pipeline-post via Edit-modal mens samme
   post er aktiv autoDraft** kan overskrives ved neste iterasjon.
   Lav sannsynlighet.

4. **Gemini 2.5-pro free tier er stram** (5 RPM, 25/dag). For testing-
   tunge økter, bruk gemini-2.5-flash (10 RPM, 250/dag).

5. **`anthropic-dangerous-direct-browser-access`** eksponerer Claude
   API-nøkkel til client-side JS. Akseptabel risiko for personlig
   bruk på StaticCrypt-beskyttet origin.

## Filer i prosjektet

```
content-brain/
├── index.html                  (alle tabs, Ghostwriter-panel, footer)
├── app.js                      (Content Brain-core, ContentBrain-API,
│                                tema, backup, lås)
├── style.css                   (alt design, tema-variabler)
├── seed.js                     (default posts og data)
├── package.json                (npm scripts: dev, build, test*)
├── ghostwriter/
│   ├── api.js                  (3 providers, retry, url_context,
│   │                            thinking-mode-fix)
│   ├── prompts.js              (system/user-prompt, templates per pilar,
│   │                            tone, selectExamples, banlist)
│   ├── voice-profile.js        (editor, Synk-knapp, Læring-seksjon,
│   │                            ignored phrases)
│   ├── edit-tracker.js         (n-gram diff, banlist-forslag,
│   │                            length-kalibrering)
│   └── ghostwriter.js          (UI, samtale, auto-save, mic,
│                                shortcuts, beforeunload)
├── scripts/
│   ├── build.js                (bundling + StaticCrypt)
│   ├── test-edit-tracker.js    (12 tester)
│   ├── test-conversation.js    (20 tester)
│   └── test-prompts.js         (CLI for prompt-inspeksjon)
├── .github/workflows/deploy.yml (auto-deploy til Pages)
├── STATICRYPT.md               (kryptering-oppsett)
├── GHOSTWRITER.md              (full bruker-guide)
├── PHASE2.md                   (designdokument)
├── CHANGELOG.md                (alle versjoner)
├── NEXT_SESSION.md             (handover-notat)
└── STATUS.md                   (denne)
```

Bundle: ~369 KB (kryptert via StaticCrypt før deploy).

## Pipeline reorder (Phase 9 — 2026-05-18)

Manuell sortering av kort i Pipeline-lanene.

**Datamodell:**
- `post.sortIndex` (ascending) styrer rekkefølge per lane. Sort ascending,
  med `capturedAt` desc som tie-break.
- `ensureSortIndex()` migrerer eldre state ved første load: posts uten
  `sortIndex` får én tildelt per lane, basert på `capturedAt` desc → eksisterende
  rekkefølge bevares.
- Nye posts (capture, Ghostwriter `addPost`, import) får automatisk
  `sortIndex = minSortIndexInLane(status) - 1` → havner alltid på toppen.

**Drag-and-drop:**
- HTML5 native (ingen ekstern lib). Bare Pipeline-kort er draggable;
  capture-recent og archive bruker samme `renderCard` men uten `showReorder`-flag.
- Mens kortet dras: kilden fades (`.dragging`, 45% opacity), målkortet får
  blå innskygge (`.drop-before` / `.drop-after`) som indikerer slipp-posisjon.
- Slipp på tom plass nederst i lanen → kortet legges sist.
- Krys-lane (idea ↔ draft ↔ ready) flytter `post.status` automatisk.
- Etter drop renummeres hele mål-lanen 0,1,2,… deterministisk.

**↑/↓-knapper:**
- Hover/focus-synlige i kort-header (touch-vennlig fallback).
- Bytter `sortIndex` med nabokortet i samme lane.
- Stopper propagation slik at klikk ikke åpner edit-modalen.
