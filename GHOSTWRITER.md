# Ghostwriter — guide

Ghostwriter er en modul i Content Brain som genererer LinkedIn-utkast i din
stemme via en lokal LLM. Default modell: `qwen2.5:7b` (foretrukket for
instruction-following) eller `llama3.1:8b` (litt mer kreativ tone).

## Innhold

- [Arbeidsflyt](#arbeidsflyt)
- [Kjøremoduser](#kjøremoduser)
- [Voice Profile](#voice-profile)
- [Compose](#compose)
- [Output](#output)
- [Pipeline → Ghostwriter](#pipeline--ghostwriter)
- [Stemmenotat-input (Phase 1.5)](#stemmenotat-input)
- [Ord-teller (Phase 1.5)](#ord-teller)
- [Auto-save (Phase 1.5)](#auto-save)
- [Lås-knapp (Phase 1.5)](#lås-knapp)
- [Synk-knapp (Phase 1.5)](#synk-knapp)
- [Provider-bytting](#provider-bytting)
- [Phase 2 / 3 (kommer)](#phase-2--3-kommer)

## Arbeidsflyt

```
┌── Idé eller anker ──┐    ┌── Voice Profile ──┐    ┌── Ollama ──┐
│ - skriv i Compose,  │ →  │ stilbeskrivelse   │ →  │ lokalt på  │ → Utkast
│ - dikter via mic,   │    │ + 2-5 eksempler   │    │ din maskin │
│ - eller trykk       │    │ + banliste        │    │            │
│   "→ Ghostwriter"   │    │ + regler          │    └────────────┘
│   på et Pipeline-   │    └───────────────────┘
│   kort              │
└─────────────────────┘
```

## Kjøremoduser

Ghostwriter krever at nettleseren får snakke med `http://localhost:11434`.
Browseren blokkerer slike kall fra HTTPS-sider med få unntak. Derfor
finnes det to praktiske moduser:

### Mode A — Lokal utvikling (anbefalt for skriveøkter)

Rask iterasjon, ingen kryptering, åpner direkte mot kildekoden.

```bash
cd "/Users/nomei1/Documents/Claude/Projects/Content Brain"
npm run dev
# Åpne http://localhost:8081
```

I denne modusen:
- Ingen passord
- Endringer i `.js` / `.css` / `.html` reflekteres ved reload
- Ollama-kall fungerer (alt på samme localhost)

**Merk:** localStorage er bundet til origin (port). Hvis du ofte bytter
mellom 8080 og 8081 mister du data. Hold deg til én port, eller bruk
Eksporter/Importer JSON for å overføre.

### Mode B — Lokal kryptert (test før push)

Samme som Pages-versjonen, men servert lokalt.

```bash
npm run build              # bundle + kryptere
npm run serve:dist         # serve på http://localhost:8080
```

I denne modusen:
- Krever passord (samme som GitHub Secret)
- Lik production
- Ollama-kall fungerer

### Mode C — Pages (https://michgeid.github.io/content-brain/)

Capture / Pipeline / Kalender / Arkiv fungerer som vanlig.

**Ghostwriter blokkeres i denne modusen** fordi browseren ikke vil
sende HTTP-kall fra en HTTPS-side. Tab-en viser en advarsel.

Dette er bevisst — Ghostwriter brukes når du faktisk skriver, og det er
alltid på din Mac. Pages-versjonen er for å sjekke pipeline fra telefonen
eller annet sted.

## Voice Profile

Klikk **"Voice Profile"** øverst til høyre i Ghostwriter-tab-en for å
åpne drawer-en.

Felter:

- **Stilbeskrivelse** — kort tekst som beskriver stemmen din
- **Banliste** — fraser modellen ikke skal bruke (én per linje)
- **Regler** — strenge instruksjoner mot hallusinasjoner
- **Eksempler per pilar** — velg 1-5 publiserte innlegg per pilar som
  few-shot. Hvis du ikke velger noen, auto-velges innlegg fra samme
  pilar (cap 3 i auto-modus).

Lagres i localStorage. Eksporteres med `Eksporter JSON` i footer-en
(samme som resten av Content Brain-data).

## Compose

- **Pilar** — hvilken pilar utkastet hører hjemme i
- **Lengde** — kort (80-120) / standard (150-250) / lang (300-400) ord
- **Anker** — det konkrete øyeblikket eller spenningspunktet (det
  viktigste feltet — modellen bygger hele utkastet rundt dette)
  - Mic-knapp: dikter på norsk eller engelsk
- **Refleksjon** — valgfritt; hvor du vil lande

Klikk **Generer utkast** → modellen kalles → utkast vises i Output.

## Output

- Rediger inline i textareaet
- **Regenerer** — gi en kort instruks ("kortere", "mer personlig",
  "fjern siste avsnitt") og kjør på nytt
- **Vis prompt** — se nøyaktig hva som ble sendt til modellen (debug)
- **Kopier** — til utklippstavle
- **Lagre som Draft** — havner i Pipeline med status "Draft"
- **Lagre til Pipeline (Klar)** — havner i Pipeline med status "Klar"

Etter lagring tømmes Compose + Output automatisk så form-en er klar
for neste idé.

## Pipeline → Ghostwriter

Hvert ikke-publiserte Pipeline-kort har en **"→ Ghostwriter"**-knapp.
Klikk den → hopper til Ghostwriter-tab → ankret er forhåndsutfylt med
kortets body. Du kan justere før Generer.

## Stemmenotat-input

Mic-knapp 🎤 ved siden av Anker-feltet. Bruker browser
SpeechRecognition (gratis, lokal, ingen API).

- Velg språk i dropdown: 🇳🇴 Norsk eller 🇬🇧 English
- Klikk 🎤 → snakker → klikk ⏹ for å stoppe
- Transkribert tekst legges til i ankret
- Pulserende rød ramme indikerer at den lytter
- Krever Chrome eller Safari (ikke støttet i Firefox uten extension)
- Krever mikrofon-tilgang (browseren spør første gang)

## Ord-teller

Live ord-teller under Output-tekstområdet:

- *"152 ord (mål: 150-250) · i mål"* — grønn = i mål
- *"40 for kort"* — oransje = under mål
- *"15 for langt"* — oransje (mild) eller rød (stor overskridelse)
- Oppdateres mens du redigerer

## Auto-save

Compose (anker, idé) og Output lagres automatisk til localStorage hvert
400 ms etter siste tastetrykk.

- Indikator i Compose-rad-en: *"lagrer…"* (mens du skriver) →
  *"● Auto-lagret 09:42"* (når lagret)
- Hvis du reloader siden eller åpner ny tab — alt er der
- Etter "Lagre som Draft/Klar" til Pipeline tømmes drafts automatisk

## Lås-knapp

🔒 **Lås**-knapp i footer (ved siden av Eksporter/Importer/Nullstill).

- Klikk → tømmer StaticCrypt-sesjon og laster siden på nytt
- På Pages / kryptert versjon: krever passord på nytt
- På `npm run dev` (ukryptert): bare en reload

Bruk når du forlater Mac-en.

## Synk-knapp

I bunn av Voice Profile-drawer-en. Vises kun når kode-defaults har
bannlistede fraser eller regler som ikke er i din lagrede profil.

- *"Synk N nye standarder fra kode"* — telleren viser hvor mange
- Klikk → de nye entries merges inn i din profil
- **Dine eksempelvalg og customizations beholdes** — knappen legger
  bare til, sletter aldri
- Hvis knappen ikke vises, betyr det at profilen din allerede har alt

## Provider-bytting

Tre providers eksisterer i koden:

| Provider | Status | Kvalitet | Kostnad |
|---|---|---|---|
| Ollama (lokalt) | ✅ Live | OK med mye edit | $0 |
| Gemini API | ✅ Live | Frontier-klasse | $0 (gratis tier) |
| Claude API | Stub | Frontier-klasse | ~$0.01-0.05/utkast |

### Bytte til Gemini

Gemini har gratis tier på 15 req/min for flash-modeller — mer enn nok
for personlig bruk. Ingen kredittkort nødvendig.

**Førstegangsoppsett:**

1. Gå til https://aistudio.google.com/app/apikey
2. Logg inn med Google-konto
3. Klikk **Create API Key** → kopier nøkkelen
4. I Ghostwriter: bytt provider-velger til **Gemini API**
5. Klikk **🔑 Sett nøkkel** ved siden av modell-velgeren
6. Lim inn nøkkelen → OK
7. Provider-status skal nå vise **● tilkoblet** i grønt

**Daglig bruk:**

Bare velg Gemini i provider-dropdown og generer som vanlig. Voice
Profile, banlist, regler, templates og edit-feedback-loop fungerer
uendret — det er bare modellen som byttes ut bak kulissene.

**Modeller:**

- `gemini-2.0-flash` — rask, 15 req/min gratis (anbefalt for vanlig bruk)
- `gemini-2.0-pro` — bedre kvalitet, 2 req/min gratis
- `gemini-1.5-pro` / `gemini-1.5-flash` — eldre stabile

Modell-velgeren henter automatisk din nåværende liste fra Google når
nøkkel er satt.

**Sikkerhet:**

API-nøkkelen lagres i din `localStorage` under `ghostwriter.apiKeys`.
Den sendes kun direkte til Google API-endpointet, aldri til andre
tjenester. Du kan fjerne den når som helst ved å klikke "🔑 Endre
nøkkel" og lime inn en tom streng.

### Bytte tilbake til Ollama

Bare velg "Ollama (lokalt)" i provider-dropdown. Ingen oppsett krevet —
fungerer så lenge Ollama kjører.

### Bytte til Claude

Claude API er ikke gratis, men kostnadene er svært lave for personlig
bruk. Anbefales som backup når Gemini er overlastet, eller for poster
der du vil ha den absolutt beste kvaliteten.

**Førstegangsoppsett:**

1. Gå til https://console.anthropic.com/settings/keys
2. Logg inn (krever konto med kreditt — kan starte med $5 i free credit)
3. Klikk **Create Key** → kopier nøkkelen
4. I Ghostwriter: bytt provider-velger til **Claude API**
5. Klikk **🔑 Sett nøkkel** → lim inn nøkkelen → OK
6. Provider-status skal nå vise **● tilkoblet** i grønt

**Kostnadsoversikt (per utkast på 200 ord):**

- `claude-haiku-4-5` — ~$0.003 (rask, lett, god til iterasjoner)
- `claude-sonnet-4-6` — ~$0.012 (anbefalt, beste balanse)
- `claude-opus-4-6` — ~$0.06 (best kvalitet, dyrere)

100 utkast med Sonnet = ~$1.20. 100 med Opus = ~$6. Ingen daglige
kvoter — så lenge du har kreditt, kan du iterere fritt.

**Auto-retry:**

Claude har samme auto-retry-logikk som Gemini ved 429 rate limits —
appen leser `Retry-After`-headeren og venter automatisk.

## Phase 2 (live, må testes)

Tre Phase 2-features er bygget og wired inn. Tone slider venter på
dine beslutninger om akser per pilar — se PHASE2.md.

### Edit-feedback-loop

Modellen lærer av redigeringene dine.

- Når du genererer et utkast og deretter redigerer det FØR du lagrer,
  spores diff-en automatisk
- I Voice Profile-drawer dukker det opp en **"📊 Læring fra dine edits"**-
  seksjon øverst
- Etter 3+ forekomster av samme strøkne frase: forslag til banliste-
  utvidelse med **"+ Banliste"** og **"Ignorer"**-knapper
- Length-kalibrering: hvis du konsekvent kutter mer enn 20 ord per
  edit, får du anbefaling om kortere default-lengde
- Ignorerte forslag dukker ikke opp igjen
- "Slett læringsdata"-knapp i bunn av seksjonen (banlistede fraser du
  allerede har lagt til beholdes)

### Templates per pilar

Hver pilar har nå sin egen struktur-guidance i system-prompten:

- **Pilar 1:** anker → analyse av spenningspunkt → quiet landing
- **Pilar 2:** scene → barnets handling → leksjon som vokser ut av scenen
- **Pilar 3:** problem → forsøk → hva brøt → konkret leksjon
- **Pilar 4:** observasjon i domene A → analog i B → spenningspunkt

Hver pilar har også preferred openings og transitions å unngå. Dette
er myk guidance, ikke harde regler.

### Article reaction mode

Modus-toggle øverst i Compose-panelet: **Standard** / **Article reaction**.

I article-reaction-modus:
- Lim inn artikkel-tekst (modellen forholder seg KUN til denne)
- Valgfri URL for referanse (linkes ikke i posten)
- Din vinkel: hva fanget deg, hva er din take?
- Modellen genererer en kort reaksjon (default 80-120 ord) der
  artikkelen refereres i 1-2 setninger og posten er din observasjon
- Strenge regler mot artikkel-misrepresentasjon og oppdiktede sitater

Når du lagrer, blir artikkel-URL lagt til i `source`-feltet på Pipeline-
posten og en utdrag av artikkel-teksten i `notes`.

## Phase 2.5 (live, polish)

### Keyboard shortcuts

- **Cmd+Enter** (eller Ctrl+Enter) i Ghostwriter-tab → trigger Generer
  utkast / Generer reaksjon
- **Esc** lukker Voice Profile-drawer hvis åpen

### Dark mode

🌙 / ☀-toggle i footer (ved siden av Eksporter/Importer/Lås).

- Default følger systemets `prefers-color-scheme`-preferanse
- Manuelt valg lagres i localStorage og overstyrer systemet
- Alle UI-elementer (inkludert pillar-dots) har separate farger for
  hvert tema

### Vis prompt — kopier-knapper

Når du klikker "Vis prompt" i Output:

- "System prompt" har en **Kopier**-knapp
- "User prompt" har en **Kopier**-knapp
- Klikk → kopiert til utklippstavle, ✓ Kopiert-feedback i 1.5 sek
- Bra for å debugge prompt-engineering eller dele eksempler

### Loading-state med Avbryt

Når modellen genererer:

- Generer-knappen byttes ut med pulserende elapsed-time-teller
  (f.eks. "12.4s")
- **Avbryt**-knapp ved siden av — klikk for å stoppe genereringen
  midt i (via AbortController)
- Avbrutt generering gir ingen alert, bare ren retur til Compose

### Søk i Arkiv

Tekst-input i Arkiv-tab (samme stil som Pipeline-søk).

- Filtrerer på tittel + body + notater
- Kombineres med pilar-chips (begge filtre virker samtidig)

### Smart Pipeline → Ghostwriter routing

Når du klikker "→ Ghostwriter" på et Pipeline-kort:

- **Hvis source-feltet inneholder en URL** → åpner i article-reaction-
  modus med URL og din vinkel forhåndsutfylt (du må selv lime inn
  artikkel-tekst)
- **Ellers** → åpner i standard-modus med body som anker (som før)

## Phase 4 — Conversational refinement

Etter første generering åpner Output-seksjonen en **samtale-tråd**:

- Hvert kort er en turn (👤 Du / 🤖 Ghostwriter)
- Tre knapper etter hver model-turn:
  - **? Spør** — chat med modellen om noe i forrige svar (forklaringer,
    alternativer, hva betyr X). Produserer ikke nytt utkast.
  - **↻ Forbedre** — generer nytt utkast basert på tilbakemelding
    (kortere, mer personlig, annen avslutning, etc.)
  - **Lagre som Draft / Klar** — siste utkast havner i Pipeline
- Modellen ser hele samtalen (multi-turn) — den husker hva som ble sagt
- Voice Profile, banlist, regler, templates ligger som systemInstruction
  i hver turn
- Auto-save av samtalen — overlever reload
- Edit-feedback-loop sammenligner første-utkast med lagret versjon
- Conversation-length warning når samtalen blir veldig stor

Quick chips for Forbedre: kortere, mer personlig, annen avslutning,
skarpere åpning, gi 3 alternativer for avslutningen.

Quick chips for Spør: forklar enklere, hvorfor denne formuleringen,
hva betyr…, andre formuleringer.

Mic-knapp finnes både på anker-feltet og i Forbedre/Spør-feltet —
norsk + engelsk.

## Phase 3 — Tone slider

Per pilar finnes en slider i Compose som biaserer modellen:

| Pilar | Akse | Default |
|---|---|---|
| 1 | strategic ↔ personal | 30 |
| 2 | encouraging ↔ realistic | 20 |
| 3 | detailed ↔ conceptual | 20 |
| 4 | Norway-focused ↔ globally framed | 70 |

Slider-posisjon lagres per pilar. Endring tar effekt ved neste Generer.
For å se hva modellen får sendt: klikk "Vis prompt" — det er en
"TONE FOR THIS DRAFT…"-linje i system-prompten.

## Phase 3 (gjenstår)

- Claude API (stub eksisterer)
- Eventuelt scheduled publishing (krever backend)

## Test og iterasjon

```bash
npm run test                # kjør alle tester
npm run test:prompts        # vis prompt-output for default scenario
npm run test:edit-tracker   # unit-tester for edit-tracker
```

For å iterere på prompts uten å måtte gjennom Ollama hver gang:

```bash
node scripts/test-prompts.js --pillar 1 --length standard
node scripts/test-prompts.js --pillar 2 --length short --json
node scripts/test-prompts.js --mode article-reaction --pillar 4 --length short
```

Viser hele system-prompten + user-prompten + valgte eksempler +
token-estimater. Kjør etter hver endring i `prompts.js` for å se hva
modellen faktisk får.

## Feilsøking

| Symptom | Sjekk |
|---|---|
| "● ikke tilgjengelig" på provider-status | Ollama kjører ikke. `brew services start ollama` |
| Mic-knapp disabled | Nettleseren støtter ikke SpeechRecognition (Firefox uten extension) |
| Mic gir "feil: not-allowed" | Mikrofon-tilgang nektet. Reset i Chrome Settings → Privacy → Site Settings |
| Ghostwriter-tab tom (kun panel-head) | JS-feil. Åpne DevTools → Console |
| Synk-knapp vises ikke | Profilen din matcher allerede defaults (riktig oppførsel) |
| Pillar 1 examples-tellere viser 0 etter Lagre | Du har sannsynligvis byttet origin (port). Sjekk `localStorage.getItem('contentBrain.v1')` |
| Output blir konsekvent for kort med qwen2.5:7b | Regenerer eller bruk lengre/mer detaljert anker |
| Output snakker for arbeidsgiver | Regel #3 bør stoppe det. Hvis ikke, sjekk at profilen din har 8 regler |
| Cmd+Enter funker ikke | Du må være på Ghostwriter-tab — shortcut er kun aktiv der |
| Læring-seksjon viser ingenting | Du må gjøre minst én edit-og-lagre etter en Generer for at data skal samles |
| Læring-forslag viser ikke en frase du strøk | Trenger 3+ forekomster av samme frase. Hvis det er over terskel, sjekk om frasen er i ignorert-listen |
| Dark mode hopper tilbake til lyst etter reload | Sjekk at localStorage ikke blir tømt (f.eks. via Lås-knappen — den tømmer staticrypt-keys, ikke contentBrain-keys, men sjekk om noe annet tømmer) |
