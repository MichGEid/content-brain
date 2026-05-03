# Neste sesjon — handover

Sist oppdatert 2026-05-01 (etter Phase 2-bygging).

## TL;DR

Alle planlagte fasene er nå bygget og pushet til GitHub. Ghostwriter
er ende-til-ende komplett med tre providers, chat-refinement,
data-tap-beskyttelse, auto-retry, og full Voice Profile-funksjonalitet.

- ✅ Phase 0 (StaticCrypt + Ollama) — live i prod
- ✅ Phase 1 (Ghostwriter MVP)
- ✅ Phase 1.5 (mic, ord-teller, auto-save, lås, Synk)
- ✅ Phase 2 (edit-feedback-loop, templates, article reaction)
- ✅ Phase 2.5 (keyboard shortcuts, dark mode, kopier-knapper, etc.)
- ✅ Phase 3 (tone slider per pilar med Michels akser)
- ✅ Phase 4 (conversational refinement med Spør/chat-modus)
- ✅ Gemini API som second provider (gratis tier, URL-context)
- ✅ Claude API som third provider (~$0.012/utkast)
- ✅ Auto-save samtaler som Pipeline-Draft (datatap-beskyttelse)
- ✅ Auto-retry på 429 rate limits
- ✅ beforeunload-advarsel som backstop

Bundle: 213+ KB. Tester: 12/12 passing.

Når vi snakkes igjen, åpne en ny chat i Content Brain-prosjektet og
skriv noe som *"Klar for neste økt — har lest NEXT_SESSION.md."* Da
vet jeg hvor vi er.

## Hvor vi er — i detalj

### ✅ Ferdig og lokalt verifisert

**Content Brain core (uendret fra før):**
- Capture, Pipeline, Kalender, Arkiv
- localStorage-basert
- Eksporter/Importer JSON

**StaticCrypt (Phase 0 — Del A):**
- Live på https://michgeid.github.io/content-brain/
- GitHub Action `deploy.yml` bundler + krypterer på push til main
- Passord i GitHub Secret `STATICRYPT_PASSWORD`
- Sanity-check fanger ukryptert deploy

**Ollama (Phase 0 — Del B):**
- `qwen2.5:7b` og `llama3.1:8b` lokalt
- `brew services start ollama` kjører som login-tjeneste
- Default modell: `qwen2.5:7b` (følger regler bedre på 7B)

**Ghostwriter (Phase 1):**
- 4 moduler: `ghostwriter/api.js`, `prompts.js`, `voice-profile.js`,
  `ghostwriter.js`
- Voice Profile editor: stilbeskrivelse, banliste, regler, eksempelvalg
- Compose: pilar, lengde, anker, refleksjon
- Generator med Ollama, regenerer-med-instruks, lagre til Pipeline
- "→ Ghostwriter"-knapp på Pipeline-kort
- Provider-abstraksjon (Claude/Gemini stubbet)

**Phase 1.5:**
- Landing-must-be-last regel (regel #8)
- Voice Profile Synk-knapp (merger nye defaults uten å miste valg)
- Live ord-teller i Output med farge-indikering
- Auto-save av Compose + Output (debounced 400ms) med synlig
  "● Auto-lagret HH:MM"-status
- 🔒 Lås-knapp i footer (tømmer StaticCrypt-sesjon + reload)
- 🎤 Mic-knapp ved Anker-feltet (browser SpeechRecognition, NO + EN)
- selectExamples respekterer manuelle valg opp til 5 (cap), auto-fyller
  bare hvis ingen valgt

### ✅ Bygget i Phase 2 (siden forrige handover)

- **Edit-feedback-loop fullt wired** — `recordEdit` kalles i `savePost`,
  Læring-seksjon i Voice Profile-drawer med banliste-forslag, length-
  kalibrering, "+ Banliste" / "Ignorer"-knapper, "Slett læringsdata".
- **Templates per pilar** — hver pilar har egen `template.structureGuidance`,
  `preferOpenings`, `avoidTransitions` i `PILLAR_INFO`. Brukes som myk
  guidance i system-prompten.
- **Article reaction mode** — modus-toggle i Compose-headeren (Standard /
  Article reaction). Egne felter: artikkel-URL, artikkel-tekst, din
  vinkel. `buildArticleReactionUserPrompt` med strenge anti-fabrikering-
  regler.
- **Edit-tracker forsterket** — `ignoredPhrases`-tracking, `getStats`,
  `alreadyBanned`-filter mot overlappende fraser.
- **Test-coverage** — `scripts/test-edit-tracker.js` (12 unit-tester),
  `scripts/test-prompts.js` utvidet med `--mode article-reaction`.
- **`npm run test`** — kjører alle tester på én kommando.

### ✅ Phase 4 + 3 + chat — siste runde (2026-05-02)

- **Conversational refinement** — Output erstattet med samtale-tråd.
  Hver turn er card. Forbedre-knapp ↻ åpner feedback-panel med tekst +
  mic + chips. Multi-turn API for Gemini + Ollama (Ollama byttet til
  /api/chat). Voice Profile som systemInstruction gjennom hele samtalen.
- **Spør/chat-modus** — tredje knapp `? Spør` ved siden av Forbedre.
  Modellen svarer på spørsmål uten å rewrite utkast. Q&A-turns har
  egen visuell stil (lilla aksent). Lagre-knappene refererer alltid
  siste utkast.
- **Tone slider per pilar (Phase 3)** — Michels valg implementert:
  - P1: strategic↔personal, default 30
  - P2: encouraging↔realistic, default 20
  - P3: detailed↔conceptual, default 20
  - P4: Norway-focused↔globally framed, default 70
  - Slider-verdi blir TONE-instruks i system-prompten. Persisteres per pilar.
- **Polish:** conversation length warning >8000 tokens, turn count i
  header, edit-tracking peker på `lastDraftTurn()` (ikke last model turn).
- **Test-harness:** `--tone <value>` eller `--tone default`.

### ✅ Phase 2.5 — polish (samme økt)

- **Keyboard shortcuts** — Cmd+Enter trigger Generer, Esc lukker
  Voice Profile-drawer.
- **Dark mode** — 🌙 / ☀-toggle i footer, følger system-preferanse,
  lagrer valg i localStorage.
- **Vis prompt — kopier-knapper** — system og user prompt har hver sin
  Kopier-knapp med ✓-feedback.
- **Loading-state** — pulserende elapsed-time-teller, Avbryt-knapp
  som faktisk avbryter via AbortController, ingen alert ved abort.
- **Søk i Arkiv** — tekst-input filtrerer på tittel/body/notater.
- **Smart Pipeline → Ghostwriter routing** — kort med URL i source
  åpnes automatisk i article-reaction-modus.
- **Cleanup** — slettet `scripts/test-fewshot.py` (engangs-test fra
  tidlig validering).

### 📝 Skrevet, ikke implementert

**`PHASE2.md`** — designdokument med tone slider-spec som venter.

### 🚫 Ikke pushet til GitHub

Alt fra Phase 1 og frem (ghostwriter/, scripts/test-prompts.js,
oppdateringer i index.html, app.js, style.css, build.js, package.json,
samt PHASE2.md, GHOSTWRITER.md, NEXT_SESSION.md) ligger ukommittert
lokalt. Pages serverer fortsatt v0.1.

## Hva DU bør gjøre før neste sesjon (alt valgfritt)

### 🟢 Lett — kan gjøres i 10 min

**Les `PHASE2.md` i ro.** Marker hva du vil prioritere først. Spesielt
seksjonen *"Beslutninger du må ta"* under hver feature — det er det
som blokkerer implementasjon.

**Beslutninger som venter:**

1. **Edit-feedback-loop:** Hvor mange ganger må en frase strykes før
   forslag dukker opp? (Mitt forslag: 3)
2. **Templates per pilar:** Skal de være "guidance" (myk) eller
   "rule" (hard)? (Mitt forslag: guidance)
3. **Tone slider:** Hvilke akser per pilar?
   - Pilar 1: strategisk ↔ personlig?
   - Pilar 2: oppmuntrende ↔ realistisk?
   - Pilar 3: detaljert ↔ konseptuelt?
   - Pilar 4: norsk-fokusert ↔ globalt?
4. **Article URL → reaksjon:** Manuell tekst-paste eller lokal proxy?
   (Mitt forslag: manuell paste — gratis-stack-konsistent)

Du trenger ikke svare på alt — markér det som er lett, og la resten
være åpent til vi snakkes.

### 🟡 Medium — kan gjøres i 30-60 min hvis du har lyst

**Test Ghostwriter på en ekte idé fra Pipeline.** Klikk "→ Ghostwriter"
på et eksisterende kort, juster ankret, generer, rediger, lagre som
Klar. Notér:
- Hvilke fraser strøk du? (kandidater til banliste)
- Hva la du til? (mønstre vi kan styrke)
- Føltes flyten naturlig, eller var det friksjon? Hvor?

Disse observasjonene er gull for Phase 2-prioritering.

### 🔴 Stor — kan vente

**Push til GitHub** så Pages får siste versjon (Capture/Pipeline/Kalender/
Arkiv-forbedringene; Ghostwriter blokkeres uansett av mixed-content
på Pages):

```bash
cd "/Users/nomei1/Documents/Claude/Projects/Content Brain"
git add -A
git commit -m "Phase 1 + 1.5: Ghostwriter MVP and polish"
git push origin main
```

Eller vent til vi snakkes — kan gjøres på 2 min sammen.

## Hva VI skal gjøre i neste sesjon

Foreslått rekkefølge:

### Sesjon 1: Test Phase 2 i praksis (60-90 min)

1. **Sync (5 min)** — kort review av hva som er nytt
2. **Test edit-feedback-loop (30 min)** — generer 3-5 utkast på ekte
   ideer, rediger dem hver gang, lagre til Pipeline. Gå tilbake til
   Voice Profile-drawer og sjekk hva Læring-seksjonen foreslår. Legg
   til de som treffer i banlisten.
3. **Test templates per pilar (15 min)** — generer én post i hver
   pilar med samme type anker. Se om strukturene treffer forskjellig.
4. **Test article reaction (15 min)** — finn en bransje-artikkel, lim
   inn, gi en vinkel, generer. Sjekk at modellen ikke fabrikerer
   sitater.
5. **Push til main (5 min)** — committe alt og se Pages oppdateres
   grønt.

### Sesjon 2: Tone slider (45 min)

Krever at du har bestemt akser per pilar:

- Pilar 1: strategisk ↔ personlig?
- Pilar 2: oppmuntrende ↔ realistisk?
- Pilar 3: detaljert ↔ konseptuelt?
- Pilar 4: norsk-fokusert ↔ globalt?

Implementasjon:

1. Slider-UI i Compose-panelet (per pilar)
2. Tone-instruks i prompt-bygger
3. Persistere slider-posisjon per pilar i UI-state

### Sesjon 3+: Iterasjon basert på edit-data

Etter en uke med faktisk bruk har edit-feedback-loop nok data til å
foreslå banliste-utvidelser. Vi gjennomgår dem sammen, lærer hva som
feiler oftest, og bygger Phase 3 basert på det.

## Aktive åpne spørsmål jeg ikke kjenner svar på

- Macen din: når flytter qwen2.5:14b inn? (Hvis 8B ikke leverer på
  enkelte poster, kan 14B være verdt å prøve. Du har 18GB RAM —
  trangt men funker.)
- LinkedIn API: noensinne aktuelt for direkte publisering? Det krever
  backend, ikke gratis-stack-kompatibelt. Hvis ja — Phase 3 eller 4.
- Stemmenotat-input: virker kvaliteten på norsk transkripsjon godt
  nok i daglig bruk? (Vi testet bare en gang.)

## Filer jeg refererer til

```
Content Brain/
├── index.html          (Ghostwriter-tab + script-tags inkl. edit-tracker)
├── app.js              (window.ContentBrain interface, lås, ghostwriter-init)
├── style.css           (alle Ghostwriter-styles inkl. Phase 2: mode-toggle, vp-learning)
├── seed.js             (data; setter window.SEED_POSTS)
├── package.json        (npm run test / dev / build / serve:dist)
├── ghostwriter/
│   ├── api.js                  (provider-abstraksjon)
│   ├── prompts.js              (buildSystemPrompt + buildArticleReactionUserPrompt + templates per pilar)
│   ├── voice-profile.js        (editor + Synk + Læring-seksjon)
│   ├── ghostwriter.js          (UI, generate-flow, mic, auto-save, ord-teller, mode-toggle)
│   └── edit-tracker.js         (Phase 2 — fullt wired, n-gram diff, getStats, ignorePhrase)
├── scripts/
│   ├── build.js                (bundle + StaticCrypt — bundler edit-tracker også)
│   ├── test-prompts.js         (test-harness — støtter --mode article-reaction)
│   ├── test-edit-tracker.js    (12 unit-tester for n-gram diff)
│   └── test-fewshot.py         (engangs-test fra tidlig validering — kan slettes)
├── .github/workflows/deploy.yml
├── STATICRYPT.md
├── GHOSTWRITER.md      (oppdatert med alle Phase 2-features)
├── PHASE2.md           (designdokument — kun tone slider gjenstår)
└── NEXT_SESSION.md     (denne fila)
```

## Memory som overlever til neste samtale

Tre filer lever i Cowork-memory:
- `project_ghostwriter_plan.md` — faseplan, hvor vi er
- `feedback_free_stack.md` — gratis-stack-prinsippet
- `reference_content_brain_repo.md` — repo-detaljer

Når du starter neste samtale dras disse automatisk inn — jeg vet hvem
du er, hva vi bygger, og hvor vi sluttet. Du trenger bare si "Klar for
neste økt" så går vi.

God pause, Michel.
