# Changelog

## v0.10 (2026-05-21) — Analytics auto-sync fra Pipeline

Du slipper å laste ned LinkedIn-CSV for hvert eneste innlegg. Når en
Pipeline-post er Publisert med dato og LinkedIn-URL, dukker den nå opp
i Analytics → Mangler metrikker uten manuelt arbeid.

### Sync-funksjonen

- `syncPublishedPostsToMetrics(state, getCb, parser)` i analytics-store.js
  — idempotent. Match-prioritet: URL → date+fingerprint
- Eksisterende rader oppdateres ikke; bare `linkedPostId` (og URL ved
  fingerprint-match) backfilles. CSV-import er fortsatt sannhetskilden
  for ekte tall
- Returnerer `{ added, skipped }` for testbarhet

### Tre integrasjonspunkter

- **Init-hook:** `Analytics.init()` kjører sync hver gang fanen åpnes
- **Live-hook:** `app.js` `upsertPost` kaller
  `window.Analytics?.syncFromPipeline?.()` når post er published med
  URL + dato. Soft-koblet, lazy state-load — virker selv om fanen aldri
  har vært åpnet i sesjonen
- **Re-render** av Analytics-skallet hvis fanen er aktiv akkurat da

### Pipeline-badge

- Sync-genererte rader får `source: "pipeline"` (CSV-rader får aldri
  feltet påtvunget, så provenance er entydig)
- Liten 📌 Pipeline-pille rendres i `metrics-row-links`, tooltip
  "Lagt til automatisk fra Pipeline — fyll inn metrikker manuelt"

### Tester

- 10 nye unit-tester (60 i analytics, 92 totalt). Dekker tom state,
  ny post, hopping over non-published/manglende felt, URL-match,
  date+fingerprint-match, idempotency, defensive guards, source-merking

Bundle: 375 KB (var 369 KB i v0.9.1).

## v0.9.1 (2026-05-18) — Edit-modal sortIndex-fiks

Liten patch på Phase 9: når en post endrer status via dropdown i edit-
modalen, re-tildeles `sortIndex` så den havner på toppen av ny lane.

Matcher intuisjonen fra drag-and-drop og nye captures (alt som nettopp
ble flyttet hit = øverst). `oldStatus` fanges før dropdown-verdien
overskriver `p.status`, og oppdateringen skjer bare på eksisterende
posts — nye posts håndteres allerede av `upsertPost` sin defaulting.

## v0.9 (2026-05-18) — Pipeline reorder

Manuell sortering av kort i Pipeline-lanene. Tidligere var rekkefølgen
bare `capturedAt` desc — nå kan du dra kortene dit du vil, og rekkefølgen
overlever reload.

### Drag-and-drop

- HTML5 native (ingen ekstern lib) — bare Pipeline-kort er draggable
- Drop-indikator viser om kortet legges over eller under målet
- Slipp i tom plass nederst i en lane → kortet legges sist
- Kryss av lane (idé ↔ draft ↔ klar) flytter `post.status` automatisk
- Etter drop renummeres mål-lanen deterministisk (0, 1, 2, …)

### ↑/↓-knapper

- Hover/focus-synlige knapper i kort-header
- Touch-vennlig fallback for når drag-and-drop ikke er praktisk
- Bytter `sortIndex` med nabokortet i samme lane

### Datamodell

- Nytt felt: `post.sortIndex` (ascending), tie-break på `capturedAt` desc
- Automatisk migrasjon (`ensureSortIndex`) ved første load — eksisterende
  rekkefølge bevares
- Nye posts (Capture, Ghostwriter `addPost`, import) får automatisk
  `sortIndex` som plasserer dem på toppen av sin lane

### Filer endret

- `app.js`: +~200 linjer (migrasjon, drag-handlere, moveCardInLane,
  oppdatert renderCard/bindCardClicks)
- `style.css`: +~30 linjer (.card-draggable, .dragging, .drop-before/after,
  .card-reorder, .card-arrow)

Bundle: 369 KB (var 312 KB i v0.8).

## v0.7.10 (2026-05-04) — gemini-2.5-flash som default

Mindre justering: bytte default Gemini-modell fra `gemini-2.0-flash`
til `gemini-2.5-flash`. 2.5 er nyere generasjon med bedre kvalitet for
samme hastighet. Free tier-grenser er litt strammere (10 RPM vs 15)
men auto-retry-håndteringen gjør det praktisk talt umerkelig.

Endring i to steder:
- `ghostwriter/api.js`: PROVIDERS.gemini.defaultModel
- `ghostwriter/ghostwriter.js`: smart-default for nye Pages-brukere

Brukere som allerede har lagret en preferanse (`ghostwriter.ui` i
localStorage) beholder sitt valg. Default treffer kun førstegangsbrukere.

## v0.7.9 (2026-05-04 morgen) — Bug-fixes etter Pages-testing

Tre konkrete problemer Michel rapporterte fra å bruke Pages i Chrome incognito.

### Importer-funksjonen støtter nytt backup-format

**Bug:** Backup-filer fra v0.7.6+ har struktur `{ contentBrain: {...},
ghostwriter: {...} }`, men importer-funksjonen sjekket etter `posts`-
array direkte (gammelt eksport-format). Resultat: "Mangler posts[]"-
feilmelding på alle backup-filer.

**Fix:** Importer detekterer begge formater nå:
- v0.7-backup: extracter `contentBrain` som hovedstate, restorer
  `ghostwriter`-keys (samtaler, edit-statistikk, UI-state) til
  localStorage
- Legacy export: bruker som før direkte
- Tydelig melding om hva som ble importert (antall posts + ghostwriter-
  keys)

### Smart default provider på HTTPS

**Bug:** Provider defaulter til Ollama, men Ollama er blokkert på HTTPS
(mixed-content). Førstegangsbrukere på Pages ser umiddelbart "blokkert
(HTTPS)"-status og må manuelt bytte til Gemini.

**Fix:** `defaultProviderForOrigin()` sjekker location.protocol og
hostname. Hvis HTTPS og ikke localhost: default til Gemini med
`gemini-2.0-flash`. Localhost beholder Ollama som default.

### Incognito-deteksjon + advarsel

**Bug:** Bruker var i Chrome incognito uten å skjønne at all localStorage
slettes når alle private faner lukkes. Trodde data ble borte uten grunn.

**Fix:** På sideåpning sjekker vi `navigator.storage.estimate().quota`.
Incognito har typisk < 200 MB, vanlig browser flere GB. Hvis quota er
under terskel: vis indigo-banner med tydelig melding:

> 🕶️ Privat fane detektert. Data slettes når du lukker alle private
> faner. Bruk vanlig fane for persistent lagring, eller ta backup ofte.

Banner kan dismissas ("Forstått") for sesjonen.

### Filer endret

```
M  app.js                      (import-multiformat, incognito-deteksjon, banner)
M  index.html                  (.incognito-banner div)
M  style.css                   (.incognito-banner stil — indigo)
M  ghostwriter/ghostwriter.js  (defaultProviderForOrigin)
M  CHANGELOG.md                (denne)
```

## v0.7.8 (2026-05-03 sen kveld) — Sikkerhet på Nullstill + auto-backup-prompt

To små men viktige beskyttelser etter Michels innspill.

### Phrase-typing på "Nullstill"

Tidligere: én OK-klikk slettet alt. Lett å treffe ved feil.

Nå: prompt() krever at du skriver **NULLSTILL** (store bokstaver) eksakt
for å bekrefte. Alt annet avbryter med tydelig melding.

Standardisert UX-mønster (samme som GitHub bruker for "Delete repo"):
nok friksjon til å unngå accidentelt klikk, ikke nok til å være
plagsom hvis du faktisk vil resette.

### Auto-prompt for backup

Banner vises øverst på siden hvis:
- Siste backup > 7 dager siden, ELLER
- Backup aldri tatt

Banner har:
- **📦 Ta backup nå**-knapp (trigger eksisterende backup-flyt)
- **Senere**-knapp (gjemmer banner til neste sesjon)

Banneret vises kun én gang per sesjon — klikker du Senere, kommer det
ikke tilbake før neste fane-åpning. Hvis det fortsatt er > 7 dager
siden siste backup neste gang, dukker det opp igjen.

Browser-policy-rationale: vi kan ikke gjøre auto-download i bakgrunnen
pålitelig. Banner-prompt er det neste beste — krever ett klikk, men
gir deg en pålitelig påminnelse uten å være avhengig av browseren-
gester-policies.

### Filer endret

```
M  app.js          (NULLSTILL-prompt, performBackup-refactor, banner-logikk)
M  index.html      (.backup-banner div øverst på siden)
M  style.css       (.backup-banner stil — amber)
M  CHANGELOG.md    (denne)
```

## v0.7.7 (2026-05-03 sen kveld) — UX + 503-håndtering

To små fix-er etter Michels rapportering fra Pages-testing:

### "Generer utkast" konsistent

Knappen sa "Generer reaksjon" i article-reaction-modus og "Generer utkast"
i standard-modus. Nå alltid "Generer utkast" — handlingen er den samme,
modus-toggle øverst gir kontekst. UX-konsistens.

### Auto-retry på 503 (Gemini "high demand")

Tidligere bare 429. Michel hit en 503 (Gemini overload), og auto-retry
trigget ikke fordi den koden bare så på 429.

Nå:
- 429 + retryDelay → vent og retry
- **503 (med eller uten retryDelay)** → vent 5 sek default og retry
- Begge respekterer abort-signal og retry kun én gang

### Filer endret

```
M  ghostwriter/api.js          (503-håndtering, default 5s backoff)
M  ghostwriter/ghostwriter.js  ("Generer utkast" alltid)
M  CHANGELOG.md                (denne)
```

## v0.7.6 (2026-05-03 kveld) — Tester, backup-knapp, polish

Fokusert sesjon på robusthet og forsikring etter at Michel oppdaget
Safari ITP wiper localStorage på Pages.

### Test-coverage utvidet (12 → 32 tester)

`scripts/test-conversation.js` — 20 nye unit-tester:

- **buildConversationMessages** (7 tester): type-markører ([REVISE THE
  DRAFT] for iterate, [QUESTION] for ask), role-mapping (model→assistant),
  rekkefølge-bevaring, blanding av modi
- **buildToneInstruction** (6 tester): lean low/high/balanced, format,
  value-clamping (0-100)
- **selectExamples** (7 tester): manual override, MANUAL_CAP=5,
  fallback til andre pilarer, post-shape (ikke eksponere internal IDer)

`buildConversationMessages` refaktorert til å ta conversation som
parameter (default `ui.conversation`) — eksponert i `window.Ghostwriter`
for testbarhet uten å bryte normal bruk.

`npm run test` kjører nå alle tre testfiler.

### 📦 Backup-knapp i footer

Eksplisitt forsvar mot Safari ITP / browser-wipes / privat-mode-tap.

- **Manuell trigger** — klikk når som helst for å laste ned full snapshot
- **JSON-fil** med timestamp i filnavn: `content-brain-backup-2026-05-03-19-42.json`
- **Inkluderer:** posts, voiceProfile, meta, edit-learning, ghostwriter-UI,
  pågående samtale (hvis aktiv)
- **Eksluderer bevisst:** API-nøkler (sikkerhet — du må sette dem på
  nytt etter en restore)
- **Smart indikator:** knappen blir orange hvis siste backup > 7 dager
- **Tooltip** viser når siste backup ble tatt

### Mic på Capture-tab

Konsistens — du kan nå dikte ideer rett i Capture, samme som anker og
feedback. Både norsk og engelsk.

### Pilar-fargemerke i samtale-headeren

Subtilt fargemerke (●) i samtale-tråden som matcher pilarens farge.
Tydelig visuelt anker for hvilken pilar samtalen er for.

### Utvidet feilsøkings-dokumentasjon

GHOSTWRITER.md har nå:
- Egen seksjon for **Safari ITP-problemet** med fire mitigerings-veier
- **Datatap-feilsøkings-tabell**
- **DevTools console-snippets** for å diagnostisere localStorage-state
- Provider-spesifikke feilsøkings-tabeller

### STATUS.md konsolidert

Komplett systemoversikt: alle providers, modi, lagring-keys,
test-coverage, kjente begrensninger, fil-oversikt.

### Bug-jakt utført

Gjennomgikk alle code paths i auto-save / savePost / clearConversation-
interaksjonen. Fant ingen race conditions. Edge cases (slettet auto-
draft, provider-bytting midt-samtale, multiple tabs) håndteres
gracefully.

### Filer endret

```
M  app.js                       (backup-knapp + getLastBackupAt + refreshBackupButton)
M  index.html                   (📦 Backup-knapp + capture-mic-host)
M  style.css                    (.linkbtn.warn + .capture-body-wrap)
M  ghostwriter/ghostwriter.js   (eksponerer buildConversationMessages,
                                 capture-mic via setupMic, pilar-color i header)
M  GHOSTWRITER.md               (Safari ITP-seksjon, dataflyt-feilsøking)
M  STATUS.md                    (full system-konsolidering)
M  CHANGELOG.md                 (denne)
M  package.json                 (npm run test:conversation)
A  scripts/test-conversation.js (20 nye unit-tester)
```

### Test-sjekkliste

- [ ] `npm run test` viser 32 passerte tester
- [ ] 📦 Backup-knapp laster ned JSON med riktig innhold
- [ ] Etter import av en backup, alt er tilbake (unntatt API-nøkler
      som må settes på nytt)
- [ ] Mic-knapp på Capture-tab fungerer på norsk og engelsk
- [ ] Samtale-header viser ●-prikken med riktig pilar-farge

## v0.7.5 (2026-05-03 morgen) — Claude API som tredje provider

Backup-provider når Gemini er overlastet, eller når kvaliteten må være
absolutt topp. Ikke gratis-tier (krever Anthropic-konto med kreditt),
men kostnadene er svært lave for personlig bruk.

### Funksjonalitet

- **Provider-velger** har nå tre valg: Ollama, Gemini, **Claude API**
- **Modeller:** claude-sonnet-4-6 (default, anbefalt), claude-opus-4-6
  (høyest kvalitet), claude-haiku-4-5 (raskest, billigst)
- **API-nøkkel** lagres lokalt i samme localStorage som Gemini-nøkkel
- **Multi-turn**: full chat-refinement-støtte (samme pattern som Gemini)
- **Auto-retry på 429**: leser `Retry-After`-header, venter automatisk
- **Stream-deteksjon**: trunkering rapporteres via console.warn

### Kostnadsoversikt (per ~200-ord-utkast)

- claude-haiku-4-5: ~$0.003
- claude-sonnet-4-6: ~$0.012
- claude-opus-4-6: ~$0.06

100 Sonnet-utkast = ~$1.20. Praktisk talt gratis for personlig bruk.
Ingen daglige kvoter — så lenge konto har kreditt, kan du iterere
fritt.

### Anvendelsesvalg

- **Ollama**: gratis, lokalt, privat, men 8B-modell
- **Gemini gratis**: frontier-klasse, men daglige kvoter (særlig på pro)
- **Claude**: frontier-klasse, ingen kvoter, mikrokost

### Bruker `anthropic-dangerous-direct-browser-access`

Anthropic markerer direkte browser-bruk som "dangerous" fordi API-
nøkkelen eksponeres til client-side JS. For Michel sin use case
(StaticCrypt-passord-beskyttet Pages, eller lokal kjøring), er
risikoen akseptabel.

### Filer endret

```
M  ghostwriter/api.js     (generateClaude, pingClaude, listClaudeModels,
                           CLAUDE_BASE, oppdatert PROVIDERS-dispatch)
M  GHOSTWRITER.md         (Claude-oppsett-seksjon med kostnadsoversikt)
M  CHANGELOG.md           (denne)
```

## v0.7.4 (2026-05-03 morgen) — Datatap-beskyttelse + rate-limit auto-retry

To større forbedringer som adresserer reelle bugs Michel rapporterte
under første ekte testing:

### Auto-save samtaler som Pipeline-Draft

**Root cause-fiks for "jeg mistet utkastet"-problemet.**

Tidligere flyt: brukeren genererte og itererte, og hvis hen ikke
eksplisitt klikket "Lagre til Pipeline (Klar)", forsvant alt arbeid
ved tab-bytte / browser-lukk.

Ny flyt:
- **Etter første model-turn**: Pipeline-post opprettes automatisk som
  Draft. ID lagres i `ui.autoDraftPostId`.
- **Hver iterasjon**: samme post oppdateres (ingen duplikater).
- **Inline-edit av draft**: post oppdateres debounced (1.5s).
- **Lagre-klikk**: posten promoteres til ønsket status (Klar/Draft).
- **"Ny samtale"-klikk**: auto-Draft beholdes i Pipeline; samtale-state
  nullstilles. Dialog gir tydelig melding.
- **Tab-lukk / reload**: `beforeunload`-advarsel som siste backstop.

Resultat: **det skal ikke være mulig å miste arbeid uten en eksplisitt
destruktiv handling.**

### Auto-retry på Gemini 429 rate limits

Tidligere: 429 viste feilmelding ("Foreslått ventetid: 31s") og lot
brukeren manuelt vente.

Ny flyt:
- 429 fanges, `retryDelay` parses fra Google-responsen
- Hvis ventetid ≤ 90s: auto-retry én gang
- UI viser nedteller: *"⏳ rate-limited, prøver igjen om 28s"* i stedet
  for elapsed-timer
- Avbryt-knappen funker fortsatt under venting (honorer abort-signal)
- Hvis auto-retry også feiler: vanlig feilmelding

### Visuell auto-save-indikator

I samtale-headeren: *"💾 Auto-lagret som Draft i Pipeline 14:32"* viser
at arbeidet er trygt.

### Tekniske endringer

- `ContentBrain.updatePost(id, partial)` — ny API-metode for delvis
  oppdatering av post
- `ContentBrain.hasPost(id)` — sjekk om post fortsatt finnes (forhindrer
  stale ID hvis brukeren har slettet posten manuelt)
- `ui.autoDraftPostId` + `ui.autoDraftSavedAt` persisteres i
  `ghostwriter.draft` localStorage, så reload bevarer kobling
- Custom events `ghostwriter:rate-limited`, `ghostwriter:rate-limit-tick`,
  `ghostwriter:rate-limit-resolved` for løs kobling mellom api.js og UI
- `waitWithAbort(ms, signal, onTick)` helper for asynkron venting som
  honorer AbortController

### Test-sjekkliste

- [ ] Generer et utkast → sjekk Pipeline → Draft skal være der
      automatisk med riktig title/body
- [ ] Iterer flere ganger → samme Draft skal oppdateres (ikke duplikater)
- [ ] Klikk "Ny samtale" → bekreft → Draft beholdes i Pipeline
- [ ] Klikk "Lagre til Pipeline (Klar)" → samme post oppgraderes til Klar,
      ingen ny duplikat opprettes
- [ ] Editer siste utkast inline → vent 1.5s → Pipeline oppdateres
- [ ] Hvis Gemini 429: skal nå auto-retry, ikke gi feilmelding (med
      mindre ventetid > 90s)

### Filer endret

```
M  app.js                       (updatePost + hasPost API)
M  ghostwriter/api.js           (auto-retry, waitWithAbort, custom events)
M  ghostwriter/ghostwriter.js   (auto-Pipeline-save, beforeunload, rate-limit feedback)
M  style.css                    (gw-autodraft-status)
M  CHANGELOG.md                 (denne)
```

## v0.7.3 (2026-05-02 sen kveld) — Gemini thinking-mode fix

### Den virkelige bug-en bak trunkert output

v0.7.2 fikset chatty meta-text-bug-en, men avslørte at output også
ble TRUNKERT (kuttet mid-sentence). Eksempel: *"intended as"* og
*"a passing"* — slutter midt i en setning.

**Root cause:** Gemini 2.5+ har "thinking mode" der modellen
reasonerer internt før synlig output. Disse thinking-tokens
**teller mot maxOutputTokens**. Vår grense på 700 tokens (for standard-
lengde) ble brukt opp av thinking, så bare ~100-200 tokens var igjen
til synlig output.

Hvorfor første generering fungerte men ikke iterations:
- Første gen: lite kontekst, lite thinking nødvendig, mer plass til output
- Iterate: hele samtalen sendes inn → mye mer thinking → output trunkeres

### Fix

`generateGemini` nå:
- **Disabler thinking helt** for 2.5+ modeller (`thinkingConfig.thinkingBudget = 0`)
- **Dobbler maxOutputTokens** med minimum 4000 (uansett hvor lite
  brukeren ber om) for å garantere full plass for synlig output
- **Logger finishReason** og advarer om MAX_TOKENS / RECITATION /
  uventede stopp-årsaker via console.warn (sjekk DevTools hvis output
  fortsatt er rart)

### Hvorfor disabling thinking er trygt for vår bruk

Voice Profile + system prompt + few-shot eksempler gir modellen all
instruksjon den trenger. Chain-of-thought er ikke nødvendig for å
skrive en LinkedIn-post i en gitt stemme. Thinking er mest nyttig
for matematikk, koding, multistep reasoning — ikke kreativt skriving
med klare føringer.

### Test-sjekkliste

- [ ] Reload Ghostwriter
- [ ] Generer artikkel-reaksjon med samme URL og vinkel
- [ ] Forventet: full lengde-tilpasset utkast (ikke trunkert)
- [ ] Forbedre med samme lange chatty feedback
- [ ] Forventet: full revidert utkast (150-250 ord, ikke 22)
- [ ] Hvis fortsatt rart: åpne DevTools Console — Gemini-warnings
      logges der

### Filer endret

```
M  ghostwriter/api.js          (thinkingConfig, safeMaxTokens, finishReason-warning)
M  CHANGELOG.md                (denne)
```

## v0.7.2 (2026-05-02 kveld) — Bug-fixes etter første ekte test

Tre konkrete bugs Michel rapporterte etter å ha kjørt ende-til-ende-flyt:

### KRITISK FIX: Iterate-modus produserte meta-tekst i stedet for utkast

Modellen tolket chatty forbedrings-feedback som dialogue, ikke som
"regenerer posten". Resultat: 14-21 ord meta-svar som *"Jeg forstår.
La oss justere tonen…"* i stedet for et komplett revidert utkast.

**Fix:** `buildConversationMessages` markerer nå hver påfølgende
user-melding eksplisitt:

- iterate → `[REVISE THE DRAFT — produce a FULL revised version of the
  LinkedIn post incorporating the feedback below. Output the complete
  post itself, not commentary, not a discussion, not meta-text.]`
- ask → `[QUESTION — please answer my question concisely. Do NOT
  produce a new draft of the post. Just answer.]`

UI viser fortsatt brukerens originale tekst — markøren legges kun til
i API-payloaden.

System-prompt-CHAT-MODE-addendum fjernet (redundant nå, og kunne
motsi user-marker hvis modusene blandes).

### Mic på "Din vinkel"-feltet

Mic-knapp manglet på artikkel-vinkel-feltet i article-reaction-modus.
Lagt til med samme generic setupMicGeneric-pattern som anker.

### Auto-resize av samtale-tekstbokser

Tekstbokser i samtale-tråden auto-tilpasser høyde til innholdet
(min 4 rader, max 50). Lange utkast vises uten scroll inni boksen —
brukeren kan se hele teksten på én gang for skjermbilder eller
gjennomlesning.

### Test-sjekkliste

- [ ] Generer utkast i article-reaction-modus
- [ ] Klikk Forbedre → skriv en lang chatty feedback (som forrige
      gang: "Jeg liker hvordan du tenker, men…")
- [ ] Forventet: modellen skal nå produsere et FULLT revidert utkast
      i stedet for meta-tekst
- [ ] Sjekk i article-reaction-modus: 🎤 dukker opp ved siden av
      "Din vinkel"-feltet
- [ ] Lange utkast skal nå vises uten scroll inni tekstboksen

### Filer endret

```
M  ghostwriter/ghostwriter.js  (iterate-marker, setupAngleMic, autoSizeTextarea)
M  CHANGELOG.md                (denne)
```

## v0.7.1 (2026-05-02 ettermiddag) — Polish patches

Små UX-fikser før første ekte testing-økt:

- **↺ Ny samtale-knapp** i samtale-headeren — forkaster nåværende
  samtale uten å lagre. Spør om bekreftelse.
- **Mode-toggle med advarsel** — bytte mellom Standard og Article
  reaction midt i en aktiv samtale spør om bekreftelse og resetter
  samtalen (ikke lenger forvirring om hvilken prompt-bygger som er
  aktiv).
- **"Hva nå?"-tekst er nå kontekstavhengig:**
  - Etter et utkast: "Liker du den?"
  - Etter et svar (Spør-modus): "Spør videre, forbedre utkastet, eller
    lagre siste utkast."
  - Ingen utkast: "Ingen utkast å lagre ennå."
- **Lagre-knappenes title-attributter** sier eksplisitt at det er siste
  utkast som lagres (ikke svaret eller forrige iterasjon).
- **Edge case-fikser:**
  - feedbackInProgress nullstilles på reload hvis samtalen er tom
  - feedbackInProgress nullstilles hvis ingen draft finnes (ren Q&A
    uten utkast)

### Filer endret

```
M  ghostwriter/ghostwriter.js  (Ny samtale-knapp, mode-toggle confirm,
                                kontekstuell hjelpetekst, restore-sanity)
M  style.css                   (gw-conv-head-actions)
M  CHANGELOG.md                (denne)
```

## v0.7 (2026-05-02 dag) — Spør/chat + Tone slider + polish

To nye ting basert på din feedback:

### Spør/chat etter hver turn

Tredje knapp ved siden av Forbedre: **? Spør**.

- Brukes når du vil forstå noe modellen skrev — *uten* å produsere nytt utkast
- Eksempler: "hva betyr X?", "kan du forklare den siste setningen?",
  "hvorfor valgte du å åpne med Y?"
- Modellen svarer kort uten å rewrite posten
- Spørsmål-kort (lilla aksent) skiller seg visuelt fra forbedrings-kort
- Lagre-knappene refererer fortsatt siste *utkast* — Q&A-turns påvirker ikke det
- Egen quick chips for spør-modus: forklar enklere · hvorfor denne formuleringen · hva betyr… · andre formuleringer

### Tone slider per pilar (Phase 3)

Slider i Compose-seksjonen (per pilar), basert på dine valg:

| Pilar | Akse | Default |
|---|---|---|
| 1 — Connective leadership | strategic ↔ personal | 30 (lean strategic) |
| 2 — Familie & hockey | encouraging ↔ realistic | 20 (lean encouraging) |
| 3 — Bygger & lærer | detailed ↔ conceptual | 20 (lean detailed) |
| 4 — Krysspollinering | Norway-focused ↔ globally framed | 70 (lean global) |

Slider-verdi blir til en TONE-instruks i system-prompten — modellen
justerer tonen for hver generering. Verdien lagres per pilar i
localStorage.

### Polish

- **Conversation length warning** — over ~8000 tokens vises advarsel
  ⚠ "Stor samtale. Vurder å lagre eller starte ny."
- **Turn count** vises i samtale-headeren ("3 turns")
- **Bug fix:** edit-tracking refererte feil model-turn når Q&A var i
  miksen — nå bruker `lastDraftTurn()` konsistent
- **Test-harness** kan nå teste tone-instruks med `--tone <value>` eller
  `--tone default` (bruker pilar-default)

### Test-sjekkliste

- [ ] Generer et utkast
- [ ] Klikk **? Spør** → feedback-panel åpner med lilla aksent
- [ ] Spør "kan du forklare den første setningen?"
- [ ] Forventet: model-svar dukker opp under, men siste utkast forblir
      uendret (Lagre-knappene peker fortsatt på det)
- [ ] Klikk **↻ Forbedre** → kortere
- [ ] Forventet: nytt utkast genereres som siste turn
- [ ] **Tone slider:** flytt slider, generer på nytt, sammenlign
- [ ] **Bytt pilar:** slider skal vise ny akse + ny default
- [ ] **Reload:** slider-posisjoner skal være lagret per pilar

### Filer endret

```
M  ghostwriter/prompts.js      (TONE_AXES, buildToneInstruction, toneValue-param)
M  ghostwriter/ghostwriter.js  (Spør-knapp, ask-modus, lastDraftTurn,
                                getCurrentToneValue, slider-UI)
M  scripts/test-prompts.js     (--tone flag)
M  style.css                   (gw-tone-* + gw-conv-card-ask/-answer + warn)
M  CHANGELOG.md                (denne)
```

## v0.6 (2026-05-02 morgen) — Conversational refinement (Phase 4)

Stort sprang i UX. Output-seksjonen er nå en chat-tråd. Etter første
generering kan du iterere fritt — modellen husker hele samtalen.

Inspirert av at Copilot-flyten Michel testet (med 4 iterasjoner) ga
markert bedre resultat enn et single-shot fra noen modell. Det er ikke
modellen som er smartere — det er at iterasjonen lar brukeren guide
modellen mot sin smak.

### Hva er nytt

- **Output erstattet med Samtale-tråd** — hver turn er et eget kort
  (👤 Du / 🤖 Ghostwriter)
- **Forbedre-knapp** etter hver model-turn — åpner et tilbakemeldings-
  panel med tekst-input + mic + quick chips
- **Quick chips:** kortere · mer personlig · annen avslutning · skarpere
  åpning · gi 3 alternativer for avslutningen
- **Mic for tilbakemelding** — samme browser SpeechRecognition som anker,
  norsk + engelsk, dikter inn forbedring
- **Multi-turn API:** Gemini bruker `contents`-array, Ollama byttet fra
  `/api/generate` til `/api/chat` for native multi-turn-støtte
- **Voice Profile + banlist + templates ligger som systemInstruction**
  gjennom hele samtalen — gjelder i hver turn
- **Edit-feedback-loop** lærer fra siste model-turn vs lagret versjon
  (ikke fra mellomturns)
- **Auto-save** persisterer hele samtalen i localStorage; reload
  gjenoppta der du var

### Test-sjekkliste

- [ ] Generer første utkast med URL (i article-reaction-modus) eller
      anker (i standard-modus)
- [ ] Forventet: første turn dukker opp som "👤 Du (start)" + "🤖 Ghostwriter"
- [ ] Klikk **↻ Forbedre** — feedback-panel åpner
- [ ] Skriv eller dikter inn forbedring (f.eks. "kortere, mer personlig")
- [ ] Klikk en chip — den legges til i tekstfeltet
- [ ] Klikk **Send forbedring** (eller Cmd+Enter)
- [ ] Forventet: ny turn dukker opp under, modellen har sett hele
      samtalen
- [ ] Gjenta — iterer 3-4 ganger
- [ ] Klikk **Lagre til Pipeline (Klar)** på siste model-turn
- [ ] Forventet: posten er lagret, samtale tømmes for ny start
- [ ] **Mic-test:** klikk 🎤 i feedback-feltet, dikter inn på norsk,
      stopp — teksten skal stå i feltet
- [ ] **Reload-test:** midt i en samtale, reload siden — samtalen skal
      gjenoppstå
- [ ] **Edit-tracking:** rediger siste model-turn inline før Lagre —
      Læring-seksjonen i Voice Profile skal registrere endringene

### Filer endret

```
M  ghostwriter/api.js          (multi-turn for Gemini + Ollama via /api/chat)
M  ghostwriter/ghostwriter.js  (conversation state, renderConversation,
                                onIterate, setupFeedbackMic, generic mic)
M  style.css                   (gw-conv-* + gw-feedback-* + gw-chip)
M  CHANGELOG.md                (denne)
```

### Teknisk

- `ui.conversation`: `[{id, role, text, timestamp, meta?}, ...]`
- `buildConversationMessages(initialPrompt)`: konverterer ui.conversation
  til API-messages-format. Første user-turn erstattes med faktisk
  initial prompt (full Compose-data). Påfølgende user-turns er feedback.
- `clearConversation()`: nullstiller etter Lagre eller Avbryt-uten-data
- Generic `setupMicGeneric({btnSelector, statusSelector, langSelector,
  targetSelector, onText, tooltipIdle})` — gjenbruk over alle mic-points

## v0.5 (2026-05-01 natt) — URL-fetching i article-reaction

Article-reaction-modus støtter nå **URL-only** input når Gemini er
provider. Lim inn URL → modellen henter artikkelen selv via Gemini sin
`url_context`-tool. Samme UX som Copilot.

### Test-sjekkliste

- [ ] Velg Gemini-provider, ha API-nøkkel satt
- [ ] Bytt til **Article reaction**-modus
- [ ] Lim inn en artikkel-URL i URL-feltet
- [ ] **La artikkel-tekst stå tom**
- [ ] Skriv din vinkel
- [ ] Klikk "Generer reaksjon"
- [ ] Forventet: Gemini henter artikkelen og skriver utkast i din stemme
- [ ] Output-meta skal vise tokens-bruk fra artikkel-fetch

### Backwards-kompatibilitet

- [ ] Med Ollama: tom tekst + URL skal gi feilmelding "URL-fetching
      krever Gemini-provider"
- [ ] Med Ollama: paste-tekst-flyten fungerer uendret
- [ ] Med Gemini + paste-tekst: fungerer som før (ingen url_context
      legges til)

### UI-feedback

- [ ] Når Gemini er valgt, viser article-reaction-feltene hint:
      "Med Gemini kan du la artikkel-tekst stå tom"
- [ ] Når Ollama er valgt: "Ollama kan ikke hente URLs — du må lime
      inn tekst nedenfor"

### Filer endret

```
M  ghostwriter/api.js          (useUrlContext-flagg, tools-array i Gemini-request)
M  ghostwriter/prompts.js      (buildArticleReactionUserPrompt: URL-only branch)
M  ghostwriter/ghostwriter.js  (validering + provider-aware UI hints)
M  CHANGELOG.md                (denne)
```

## v0.4 (2026-05-01 sen kveld) — Gemini-provider

Lagt til Gemini API som opt-in provider. Frontier-klasse modell på
gratis tier (15 req/min for flash). Anbefales for kvalitetssensitive
poster når Ollama-output ikke treffer.

### Test-sjekkliste

- [ ] Hent gratis API-nøkkel: https://aistudio.google.com/app/apikey
- [ ] I Ghostwriter, bytt provider-velger til **Gemini API**
- [ ] Forventet: rød "🔑 Sett nøkkel"-knapp og status "● mangler nøkkel"
- [ ] Klikk "🔑 Sett nøkkel", lim inn nøkkelen
- [ ] Forventet: knappen blir grønn "🔑 Endre nøkkel", status blir "● tilkoblet"
- [ ] Modell-velgeren skal fylles med din faktiske liste fra Google
      (gemini-2.0-flash, gemini-2.0-pro, etc.)
- [ ] Generer samme anker du testet med Copilot
- [ ] Sammenlign kvalitet — forventet: betydelig nærmere ditt språk på
      første forsøk
- [ ] Bytt tilbake til Ollama → API-nøkkel-knapp skal forsvinne
- [ ] Ollama-flyten skal fungere uendret (regresjonstest)

### Tekniske detaljer

- API-nøkkel lagres i `localStorage["ghostwriter.apiKeys"]`
- Sendes kun direkte til Google API-endpoint
- `setApiKey(provider, "")` fjerner nøkkelen
- Mixed-content-sjekken gjelder kun Ollama (Gemini er HTTPS, fungerer
  også på Pages-deploy)
- Voice Profile, banlist, regler, templates, edit-feedback-loop —
  alt fungerer uendret med Gemini

### Filer endret

```
M  ghostwriter/api.js          (generateGemini implementert, key-storage)
M  ghostwriter/ghostwriter.js  (API-nøkkel-knapp i topbar, smart pingProvider)
M  style.css                   (.gw-apikey-btn i grønn/rød)
M  GHOSTWRITER.md              (Gemini-oppsett-seksjon)
M  CHANGELOG.md                (denne)
```

## v0.3 (2026-05-01) — Phase 2 + 2.5

Bygget i én sammenhengende økt. Ikke pushet til GitHub ennå. Test-
sjekkliste for når du kommer tilbake.

### Phase 2 — nye features

#### Edit-feedback-loop

- [ ] Generer et utkast i Ghostwriter
- [ ] Rediger output-tekstområdet merkbart (strøk en frase, omformuler)
- [ ] Klikk "Lagre som Draft"
- [ ] Forventet: alert sier "(din edit lagret for læring)"
- [ ] Gjenta 3 ganger med forskjellige ankere men gjenbruk noen klisjeer
      i de genererte versjonene som du strøk hver gang
- [ ] Åpne Voice Profile-drawer
- [ ] Forventet: "📊 Læring fra dine edits"-seksjon øverst med:
  - [ ] N edits sporet
  - [ ] Banlist-forslag for fraser strøket ≥3 ganger
  - [ ] "+ Banliste"-knapp legger frasen i banlisten din
  - [ ] "Ignorer"-knapp fjerner den fra forslag
  - [ ] Length-kalibrering hvis du konsekvent kutter

#### Templates per pilar

- [ ] Generer en post i hver pilar (1–4) med samme type anker
- [ ] Klikk "Vis prompt"-knappen
- [ ] Verifiser at system-prompten har:
  - [ ] "STRUCTURE FOR THIS PILLAR: …" som varierer per pilar
  - [ ] "PREFERRED OPENINGS for this pillar: …"
  - [ ] "TRANSITIONS TO AVOID for this pillar: …"
- [ ] Sjekk at output har distinkt struktur per pilar (Pilar 2 mer scenisk
      enn Pilar 1, Pilar 3 mer teknisk, Pilar 4 mer cross-domain)

#### Article reaction mode

- [ ] I Ghostwriter, klikk "Article reaction"-toggle øverst i Compose
- [ ] Lim inn artikkel-tekst (minst 100 tegn)
- [ ] Skriv en URL i URL-feltet (valgfritt)
- [ ] Skriv din vinkel
- [ ] Klikk "Generer reaksjon"
- [ ] Verifiser at output:
  - [ ] Refererer artikkelen i 1-2 setninger, ikke summerer
  - [ ] Lander på din vinkel
  - [ ] Ikke har oppdiktede sitater fra forfatteren
  - [ ] Ikke nevner navn/orgs som ikke står i den limte teksten
- [ ] Lagre som Draft → sjekk Pipeline-kortet:
  - [ ] `source` er URL-en
  - [ ] `notes` har "Article reaction. Angle: ..." og artikkel-utdrag

#### Smart Pipeline → Ghostwriter routing

- [ ] Lag et nytt Pipeline-kort med en URL i source-feltet (via Capture
      eller direkte via Edit-modal)
- [ ] Klikk "→ Ghostwriter"-knappen på kortet
- [ ] Forventet: Ghostwriter åpner i article-reaction-modus med URL og
      din vinkel forhåndsutfylt

### Phase 2.5 — polish

#### Keyboard shortcuts

- [ ] I Ghostwriter, skriv et anker
- [ ] Trykk **Cmd+Enter** (ikke klikk Generer-knappen)
- [ ] Forventet: genereringen starter
- [ ] Åpne Voice Profile-drawer, trykk **Esc**
- [ ] Forventet: drawer lukker

#### Dark mode

- [ ] Klikk **🌙 Mørkt** i footer
- [ ] Forventet: hele appen blir mørk, knapp endrer til "☀ Lyst"
- [ ] Reload siden
- [ ] Forventet: dark mode er fortsatt aktiv (lagret i localStorage)
- [ ] Klikk **☀ Lyst** for å gå tilbake

#### Vis prompt — kopier-knapper

- [ ] Etter en generering, klikk "Vis prompt" i Output
- [ ] Forventet: to seksjoner med hver sin Kopier-knapp
- [ ] Klikk Kopier ved "System prompt"
- [ ] Forventet: "✓ Kopiert" vises i 1.5 sek
- [ ] Lim inn et tekstredigerings-program → verifiser at hele system-
      prompten er der

#### Loading-state med Avbryt

- [ ] Start en generering
- [ ] Forventet: Generer-knappen erstattes med "Avbryt"-knapp +
      pulserende elapsed-time-teller (f.eks. "3.2s")
- [ ] Klikk Avbryt
- [ ] Forventet: genereringen stopper umiddelbart, ingen alert,
      knapp tilbake til Generer

#### Søk i Arkiv

- [ ] Gå til Arkiv-tab
- [ ] Skriv noe i Søk-feltet (matcher tittel, body eller notater)
- [ ] Forventet: liste filtreres live
- [ ] Kombiner med pilar-chip → begge filtre virker samtidig

### Tester

```bash
npm run test                # 12 unit-tester for edit-tracker n-gram diff
npm run test:prompts        # vis system+user prompt
npm run test:prompts -- --mode article-reaction --pillar 4
```

Forventet: alle passerer.

### Bundle

```bash
npm run build               # bundle + krypter (krever STATICRYPT_PASSWORD)
npm run bundle              # bare bundle, ingen kryptering
```

Forventet bundle: ~156 KB, alle Phase 2/2.5-features synlig.

### Push til GitHub

Når du er fornøyd og vil deploye:

```bash
cd "/Users/nomei1/Documents/Claude/Projects/Content Brain"
git add -A
git commit -m "Phase 2 + 2.5: edit-loop, templates, article reaction, polish"
git push origin main
```

Workflow `deploy.yml` kjører automatisk: bundling + StaticCrypt + deploy
til Pages. Pages oppdaterer Capture/Pipeline/Kalender/Arkiv. Ghostwriter
forblir blokkert på Pages (mixed-content) — bevisst arkitektur.

### Kjent ikke-fikset

- **Tone slider per pilar** — venter på dine beslutninger om akser
  (PHASE2.md seksjon 3)
- Hvis du tester på `npm run serve:dist` (port 8080) etter å ha brukt
  `npm run dev` (port 8081), localStorage er separat per origin og du
  må enten holde deg til én port eller bruke Eksporter/Importer JSON

### Filer endret/lagt til siden v0.2

```
A  ghostwriter/edit-tracker.js      (skjelett, så fullt wired)
A  scripts/test-edit-tracker.js     (12 unit-tester)
A  PHASE2.md                        (designdokument)
A  STATUS.md                        (leveranse-oversikt)
A  CHANGELOG.md                     (denne)

M  index.html                       (theme-toggle, lock, edit-tracker script-tag)
M  app.js                           (theme-handler, smart routing, archive-search)
M  style.css                        (dark mode, vp-learning, gw-elapsed, gw-mode-toggle)
M  ghostwriter/ghostwriter.js       (article mode, shortcuts, abort, lastGenerated, copy-buttons)
M  ghostwriter/prompts.js           (templates per pilar, buildArticleReactionUserPrompt, ny landing-regel)
M  ghostwriter/voice-profile.js     (Læring-seksjon, mergeDefaults, ignorePhrase)
M  scripts/build.js                 (inkluder edit-tracker i bundle)
M  scripts/test-prompts.js          (--mode article-reaction)
M  package.json                     (npm run test, test:prompts, test:edit-tracker)
M  GHOSTWRITER.md                   (Phase 2 + 2.5 dokumentasjon)
M  NEXT_SESSION.md                  (oppdatert handover)

D  scripts/test-fewshot.py          (engangs-test, slettet)
```
