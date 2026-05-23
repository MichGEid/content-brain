# Status — Content Brain + Ghostwriter + Analytics

Sist oppdatert 2026-05-22. Versjon: v0.12 med Inspirasjon manuell modus (bruk Claude Pro istedenfor API).

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
│  Phase 9.1  Edit-modal sortIndex-fiks    ✅ Live (2026-05-18)│
│             status-endring via dropdown re-tildeler          │
│             sortIndex (matcher drag-and-drop-flyten)         │
│  Phase 10   Analytics auto-sync fra      ✅ Live (2026-05-21)│
│             Pipeline + 📌-badge + live hook                  │
│  Phase 11   Inspirasjon: LLM scorer       ✅ Live (2026-05-22)│
│             nyhetsbrev mot 4-pilar +                         │
│             modell-dropdown + MICHEL_CONTEXT                 │
│             + MOMENT ARCHETYPES + anti-                      │
│             regurgitation + recent-anchors                   │
│  Phase 12   Inspirasjon manuell modus    ✅ Live (2026-05-22)│
│             Auto/Manuell-toggle + bygg-                      │
│             prompt-lokalt + paste-JSON-                      │
│             tilbake (bruker Pro, ikke API)                   │
│  Tests      136 unit-tester (32 GW +     ✅ Alle passerer   │
│             60 Analytics + 44 Inspirer)                      │
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
npm run test                # alle 136 tester
npm run test:edit-tracker   # 12 tester for n-gram diff + suggestions
npm run test:conversation   # 20 tester for prompt-bygging og selectExamples
npm run test:analytics      # 60 tester for parser, classifier, store, demo,
                            # top-perf, syncPublishedPostsToMetrics
npm run test:inspirer       # 44 tester for prompt-bygger og JSON-parser
                            # + buildCombinedPrompt for manuell modus
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

Bundle: ~424 KB (kryptert via StaticCrypt før deploy).

## Inspirasjon manuell modus (Phase 12 — 2026-05-22)

Lar Michel kjøre sortering gjennom Claude Pro-abonnementet sitt istedenfor
API. Sidesteg av rate limits og API-kostnad. Etter A/B-testing 2026-05-22
ble det bekreftet at **både auto-modus (Gemini Flash) og manuell modus
(Claude Sonnet via claude.ai) gir publiserbare ankere** etter Phase 11-
prompten ble strammet. Manuell brukes som backup eller for high-stakes
poster; auto for daglig screening.

**UI-flyt i manuell modus:**
1. Bytt til ✋ Manuell via mode-toggle (lagres i `newsletterInspirer.ui.mode`)
2. Lim inn URL (eller paste-tekst)
3. Klikk **📋 Bygg prompt** — prompt genereres lokalt via
   `buildCombinedPrompt` (samme builder som auto-modus, bare flettet
   system+user)
4. Klikk **📋 Kopier prompt** — clipboard fylles via `navigator.clipboard.writeText`
5. Åpne claude.ai (Pro) → ny chat → Cmd+V → Enter
6. Claude svarer JSON-array
7. Kopier hele JSON-svaret tilbake
8. Paste i "Lim inn JSON-svar"-textarea
9. Klikk **Tolk svar → suggestion-cards** — `parseResponse` kjører,
   suggestion-cards rendrer identisk som auto-modus

**Hvorfor det fungerer:**
- `parseResponse`-en er provider-agnostisk og håndterer raw JSON, JSON i
  markdown-fence, og JSON med prose før/etter — dvs hva alle chat-UI-er
  typisk gir
- `buildCombinedPrompt` fletter system+user med en `---` USER INPUT-
  delimiter slik at chat-UI som ikke har separat system-input får hele
  konteksten i én melding
- Recent-anchors-eksklusjon, MICHEL_CONTEXT og MOMENT ARCHETYPES brukes
  uendret — bare leveringsmekanismen er annerledes

**Kost-profil:**
- Auto-modus: Gemini Flash gratis-tier (10 RPM, 250/dag) eller Claude
  haiku ~5 øre/kall (paid API)
- Manuell modus: Null. Bruker Claude Pro $20/mnd-abonnement direkte.

**Tester:** 4 nye tester for `buildCombinedPrompt` (44 i inspirer-modul,
136 totalt).

## Inspirasjon-modulen (Phase 11 — 2026-05-22)

Automatiser nyhetsbrev → Pipeline-flyten. Brukeren limer inn en URL i
"📥 Inspirasjon"-tabben, en LLM (default Gemini 2.5-flash) scorer
artiklene mot Michels 4-pilar-rotasjon, og foreslår 2-3 anker-tekster
i hans stemme. Ett klikk legger dem til Pipeline som idé. Skal redusere
ukentlige nyhetsbrev-gjennomganger fra 15-20 min Cowork-chat til ~90 sek.

**Filer:**
- `newsletters/inspirer-prompts.js` (~280 linjer) — buildSystemPrompt,
  buildUserPrompt, parseResponse, MICHEL_CONTEXT, MOMENT ARCHETYPES
- `newsletters/inspirer.js` (~430 linjer) — UI-modul: URL/text-input,
  modell-dropdown, suggestion-cards, addPost-integrasjon, persistens
- `scripts/test-inspirer.js` (~360 linjer, 38 tester)

**Arkitektur:**
- Reuser `Ghostwriter.api.generate` for provider-dispatch (Gemini/Claude/Ollama)
- Reuser `voiceProfile.getProfile()` for stilbilde
- Reuser `Analytics.hasData()`/`getPillarPerformance()` indirekte via
  `ContentBrain.getState().posts`-pekere
- Bruker `Ghostwriter.prompts.PILLAR_INFO` for pilar-definisjoner
- Egen `newsletterInspirer.ui`-key i localStorage: URL, paste-tekst,
  vis-textarea-flagg, suggestion-cache, sist-fetched-timestamp,
  provider-override, model-override

**Provider-flyt:**
- Gemini har `url_context` → kan hente URL-en selv. Default-modus.
- Claude og Ollama trenger paste-tekst. UI viser fallback når provider
  bytter til en av disse.

**MICHEL_CONTEXT-blokken:**
Konstant i `inspirer-prompts.js`. Gir LLM konkret livsbilde å trekke
ankere fra istedenfor å paraphrase artikkelen — Laerdal-rollen,
konkurrenter (ZOLL/Stryker/Philips/Medtronic), J2020 hockey ved
Sørmarka, Content Brain-bygging, MDR/FDA-virkelighet, styreverv.

**MOMENT ARCHETYPES-menyen:**
5-7 moment-typer per pilar. Gir LLM variasjon å velge fra istedenfor
å gravitere mot samme 3 templates hver gang. Eksempler: Pilar 1
"a 1:1 where a team member surfaced a tension", Pilar 4 "an MDR or
FDA clause that surprised him".

**Anti-regurgitation (plan A, 2026-05-22):**
Etter at Gemini 2.5-flash gjenta de samme tre ankerne ordrett, fjernet
vi alle positive GOOD ANCHOR-eksempler fra prompten. Erstattet med:
(a) eksplisitt "NO positive anchor template is provided" deklarasjon,
(b) blokkliste over overbrukte ankere (AED demo, J2020 Gallup, Content
Brain 22:00) med per-pilar fresh-up-alternativer, (c) forbud mot tail-
setninger som tilbake-henviser til artikkelen.

**Recent-anchors exclusion:**
Når en Inspirasjon-suggestion legges til Pipeline, kan dens anker-tekst
inkluderes i fremtidige prompt som "RECENTLY USED — do not reproduce
these scenes". Gjør at samme angle ikke kommer opp uke etter uke selv
om samme moment-archetype velges av LLM-en.

**Modell-dropdown:**
8 preset provider+model-kombinasjoner (Gemini 2.0/2.5 flash/pro,
Claude sonnet/haiku/opus 4-6, Ollama qwen/llama). Default-valget
"Bruk Ghostwriter-default" respekterer det som er valgt i Ghostwriter-
fanen. Override lagres som `providerOverride` + `modelOverride` i
`newsletterInspirer.ui`. URL-input disables når non-Gemini er valgt
(siden bare Gemini har `url_context`).

**Kjente begrensninger etter Phase 11:**
- 2.5-flash er tilbøyelig til å regurgitere positive eksempler fra
  prompten. Plan A (fjerning av positive eksempler) avhenger av at
  Gemini respekterer eksplisitte forbud. Hvis ikke, må vi bytte til
  2.5-pro (25/dag-limit) eller Claude haiku (~0.005 USD/kall).
- Recent-anchors-mekanismen krever at brukeren bruker "+ Legg til
  Pipeline" på det som passer — hvis han bare hopper over uten å
  legge til, samles ikke noen exclusion-historikk.

## Analytics auto-sync fra Pipeline (Phase 10 — 2026-05-21)

Lar Michel slippe LinkedIn-CSV-eksport for sitt ukentlige innlegg. Når en
Pipeline-post markeres Publisert med dato + LinkedIn-URL, dukker den
automatisk opp i Analytics → Mangler metrikker-tabellen, klar for manuell
inntasting av visn/likes/komm/shares.

**Datamodell:**
- Nytt felt: `postMetric.source = "pipeline"` på sync-genererte rader.
  CSV-importerte rader får aldri dette feltet påtvunget, så provenance
  forblir entydig selv etter senere CSV-import.

**`syncPublishedPostsToMetrics(state, getCb, parser)`** i analytics-store.js:
- Idempotent. Match-prioritet: URL → date+fingerprint.
- Eksisterende rader røres ikke — bare backfiller `linkedPostId` (og URL
  hvis match via fingerprint og URL mangler).
- Returnerer `{ added, skipped }` for testbarhet.

**Init-hook:** `Analytics.init()` kjører sync hver gang fanen åpnes.

**Live-hook:** `app.js` `upsertPost` kaller `window.Analytics?.syncFromPipeline?.()`
når post er published med URL + dato. Soft-koblet via optional chaining.
Lazy state-load i Analytics-modulen så hooken virker første gang fanen
aldri har vært åpnet i sesjonen. Re-renderer skallet hvis fanen er aktiv.

**UI:**
- Liten 📌-pille i `metrics-row-links` ved siden av "Vis detaljer" på
  Pipeline-sourced rader (hover-tooltip: "Lagt til automatisk fra Pipeline").
- Resten av tabell-flyten er uendret (input-felter med autosave på blur).

**Konsekvens for CSV-import:** Fortsetter å virke. Dedupe på URL betyr at
en senere CSV-eksport vil oppdatere Pipeline-sourced rader med ekte tall
istedenfor å lage duplikater.

## Pipeline edit-modal sortIndex-fiks (Phase 9.1 — 2026-05-18)

Når en post endrer status via dropdown i edit-modal, re-tildeles `sortIndex`
slik at den havner på toppen av ny lane. Matcher intuisjonen fra drag-and-
drop og nye captures. `oldStatus` fanges før dropdown-verdien overskriver
`p.status`, og oppdatering skjer bare på eksisterende posts (nye posts
håndteres allerede av `upsertPost` sin defaulting).

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
