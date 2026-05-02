# Phase 2 — designdokument

Phase 1 (MVP) er live: Voice Profile, Compose, Generate, Edit, Save til
Pipeline. Det fungerer. Dette dokumentet er grunnlaget for det som kommer
neste — fire features rangert etter forventet leverage.

Les dette, marker hva du vil prioritere, og notér beslutninger som må
tas. Implementasjon skjer i en senere økt.

## Rangering

| Prioritet | Feature                            | Innsats | Leverage |
|-----------|------------------------------------|---------|----------|
| 1         | Edit-feedback-loop                 | Medium  | Høy      |
| 2         | Templates per pilar                | Lav     | Medium   |
| 3         | Tone slider per pilar              | Lav     | Medium   |
| 4         | Article URL → reaksjons-utkast     | Høy     | Medium   |

Anbefaling: ta dem i denne rekkefølgen. Edit-feedback-loop er det som
gjør Voice Profile selvjusterende over tid — det er kjernen i hvorfor
Ghostwriter skal bli skarpere jo mer du bruker den.

---

## 1. Edit-feedback-loop

### Hva den gjør

Hver gang du genererer et utkast og deretter redigerer det før du lagrer,
sammenligner Ghostwriter den genererte versjonen med din endelige
versjon. Det gir tre signaler over tid:

1. **Hvilke fraser strøk du gjentatte ganger?** → forslag til nye
   bannlistede fraser.
2. **Hvilke setninger la du til?** → forslag til nye Voice Profile-
   beskrivelser eller eksempler.
3. **Hva ble kortet ned?** → kalibrering av lengde-presets.

Ikke automatisk endring — alle forslag må du godkjenne før de havner i
Voice Profile. Du eier stemmen.

### Mekanisme

```
┌── Generert ──┐    ┌── Edit ──┐    ┌── Diff ──┐    ┌── Forslag ──┐
│ "in fast-    │ →  │ "spaces   │ →  │ −"in fast│ →  │ Banlist:     │
│  paced       │    │  where    │    │  -paced  │    │ "fast-paced" │
│  environ-    │    │  trust    │    │  environ-│    │              │
│  ments..."   │    │  matters" │    │  ments"  │    │              │
└──────────────┘    └───────────┘    └──────────┘    └──────────────┘
```

Hver lagret post bærer med seg sin "edit history": den genererte
versjonen + brukerens versjon. Det lagres på posten i `state.posts[].editHistory`.

```js
// state.posts[N]
{
  id: "p_xyz",
  status: "ready",
  body: "Final edited text...",            // brukerens versjon
  editHistory: {
    generated: "Original generated text...", // før edit
    timestamp: "2026-05-01T12:34:56Z",
    model: "qwen2.5:7b",
    promptHash: "abc123",                   // for å gruppere
  },
  ...
}
```

### Diff-strategi

Tre-nivå diff:

1. **Phrase-level** — finn 2-5-grams som finnes i generated men ikke i
   final. Tell forekomster på tvers av alle posts. Hvis en frase
   strykes ≥3 ganger over ulike posts → foreslå banliste.
2. **Sentence-level** — finn setninger som er fjernet helt og
   setninger som er nye. Brukes til å se mønstre (alltid samme type
   åpning som blir strøket?).
3. **Length delta** — gjennomsnittlig endring i ord-antall. Hvis du
   konsekvent kutter 30% → tilpass num_predict eller foreslå "Kort"
   som default.

### UI

Egen "Læring"-tab i Ghostwriter, eller drawer i Voice Profile:

- Liste over forslag med kontekst:
  *"Frasen 'fast-paced' ble strøket i 4 av siste 6 posts. Legg i banliste? [Ja] [Ignorer]"*
- Bulk-aksjoner: godta alle forslag fra siste uke
- Reset (slett alt læringsdata)

### Beslutninger du må ta

- **Auto-suggest threshold:** Hvor mange forekomster før vi foreslår
  banliste? Default-forslag: 3.
- **Learning data privacy:** lagres kun i din localStorage (ja, default).
  Aldri sendt til Ollama eller noe annet sted.
- **Edit-detection sensitivity:** Hvor stor må endringen være før den
  teller som "edit"? Forslag: minst 5% av tegn forskjellig.

### Risiko

- **Overfitting til ett innlegg:** Én post med atypisk redigering
  påvirker forslag uforholdsmessig. Mitigering: krev N≥3 før forslag.
- **Edit ≠ avvisning:** Du kan endre fordi ankret var litt annerledes,
  ikke fordi modellen gjorde feil. Mitigering: vis kontekst når forslag
  presenteres så du kan vurdere.

---

## 2. Templates per pilar

### Hva den gjør

I dag har alle pilarer samme system-prompt-struktur — bare tone-
beskrivelsen varierer. Templates per pilar gir hver pilar sin egen
struktur:

- **Pilar 1 (Connective leadership):** anker → analyse av spennings-
  punkt → landing som peker bak observasjonen.
- **Pilar 2 (Familie & hockey):** scene → barnets handling/uttalelse
  → leksjon som vokser ut av scenen, aldri imposed.
- **Pilar 3 (Bygger & lærer):** problem → forsøk → hva brøt → læring,
  med spesifikke verktøy/valg.
- **Pilar 4 (Krysspollinering):** observasjon i bransje A → analog i
  bransje B → spenningspunkt eller mulighet.

### Mekanisme

I `prompts.js`, utvid `PILLAR_INFO`:

```js
const PILLAR_INFO = {
  1: {
    label: "Connective leadership",
    tone: "thoughtful, strategic, observational...",
    template: {
      structureGuidance: "ANCHOR → ANALYSIS OF TENSION → LANDING THAT POINTS BEHIND THE OBSERVATION",
      avoidTransitions: ["In conclusion", "To wrap up"],
      preferOpenings: ["[Observation]", "[Two short sentences setting up tension]"],
    },
  },
  2: {
    label: "Familie & hockey",
    tone: "warm, personal, present-tense...",
    template: {
      structureGuidance: "SCENE → CHILD'S ACTION OR QUOTE → LESSON THAT EMERGES, NEVER IMPOSED",
      avoidTransitions: ["The lesson here is"],
      preferOpenings: ["[Direct quote from the scene]", "[Time/place anchor]"],
    },
  },
  ...
};
```

System-prompt builder bruker `template.structureGuidance` etter den
generelle VOICE-blokken.

### Beslutninger du må ta

- **Strenghet:** Skal templates være "guidance" (myk anbefaling) eller
  "rule" (hard restriksjon)? Default-forslag: guidance.
- **Override per generation:** Skal du kunne velge "ignorer template
  for denne ene gangen"? Default: nei i Phase 2, kanskje i Phase 3.

### Risiko

- **Over-konstrengning:** Hvis template er for spesifikk, blir alle
  Pilar 1-poster like. Du mister naturlig variasjon.
  Mitigering: hold templates på struktur-nivå, ikke setning-nivå.

---

## 3. Tone slider per pilar

### Hva den gjør

En slider i Compose-panelet (per pilar) som biaserer modellen mellom
to ytterpunkter. For Pilar 1 kunne det være "strategisk ↔ personlig":
- Strategisk-side: høyere abstraksjon, mønstre, dynamikk
- Personlig-side: konkret scene, "jeg lærte", første person

### Mekanisme

Slider gir en verdi 0-100. Ved generering:

```js
const tone = ui.toneSlider; // 0-100
const toneInstruction = pillar === 1
  ? `On the spectrum from strategic (0) to personal (100), this draft should sit at ${tone}. ${tone < 33 ? "Lean abstract: focus on patterns and dynamics." : tone > 66 ? "Lean personal: ground in 'I' and concrete moments." : "Balance both."}`
  : ...;
```

Tone-instruksjonen plugges inn i system prompt.

### Beslutninger du må ta

✅ **Beslutninger tatt 2026-05-01:**

| Pilar | Akse | Michels default | Verdi (0-100) |
|---|---|---|---|
| 1 — Connective leadership | strategisk ↔ personlig | strategisk med litt personlig piff | ~30 |
| 2 — Familie & hockey | oppmuntrende ↔ realistisk | oppmuntrende, varm, inspirerende | ~20 |
| 3 — Bygger & lærer | detaljert ↔ konseptuelt | detaljert | ~20 |
| 4 — Krysspollinering | norsk-fokusert ↔ globalt | globalt med litt ekstra fokus på Norge | ~70 |

(Verdiene 0-100 er min tolkning av "litt personlig piff", "litt ekstra
fokus" — vi kan finjustere etter første generering.)

**Annet:**

- **Default-posisjon:** Verdiene over (per pilar), ikke midten 50.
- **Persist per pilar:** Ja, slider-posisjon lagres separat for hver pilar.
- **Slider-synlighet:** Skjul bak "Avansert"-toggle? Forslag: nei, vis
  alltid — det er liten kognitiv belastning når default er fornuftig.

### Risiko

- **Slider-paralyse:** Du bruker tid på å tweake i stedet for å skrive.
  Mitigering: skjul slider bak "Avansert"-toggle.

---

## 4. Article URL → reaksjons-utkast

### Hva den gjør

Lim inn en artikkel-URL (f.eks. en bransje-nyhet). Modellen leser
artikkelen og genererer et reaksjons-utkast i din stemme, koblet til en
av pilarene dine.

### Mekanisme — to steg

**Steg 1: Hent artikkel-tekst.**

CORS-utfordring: nettleseren kan ikke fritt hente HTML fra hvilken som
helst URL. Tre veier:

a. **Manuell paste:** Brukeren limer inn artikkel-teksten selv. Trygt,
   ingen CORS-problemer, men mer friksjon.
b. **Lokal proxy:** Et lite Node-script som fetcher URL-en og returnerer
   tekst. Krever at proxy-en kjører lokalt.
c. **Browser-extension** eller bookmarklet som puller siden. Mer
   ambisiøst.

Anbefaling for Phase 2: a (manuell paste). Det matcher gratis-stack-
prinsippet og er pålitelig.

**Steg 2: Generer reaksjon.**

Ny "Article reaction"-modus i Compose-panelet:

```
┌─ Article reaction ──────────────────┐
│ [URL felt — for referanse]          │
│ [Limt artikkel-tekst — textarea]    │
│ [Pilar-velger]                      │
│ [Din vinkel — kort tekst:           │
│  "Hva fanget deg? Hva er din take?"]│
│ [Generer reaksjon]                  │
└─────────────────────────────────────┘
```

System-prompt-extension:

```
You are responding to an article in Michel's voice. Use the article as
context but do not summarize it. The post should:
- Reference the article in 1-2 sentences (what it says or argues)
- Pivot to Michel's perspective
- Land on his observation, not a generic takeaway
- Cite specific names/orgs only if they appear in the article — otherwise
  speak about the pattern.
```

### Beslutninger du må ta

- **Lengde for reaksjons-utkast:** Annen default enn vanlig post?
  Reaksjoner er ofte litt kortere (100-180 ord).
- **Article-tekst persistens:** Lagres artikkel-teksten i state, eller
  bare brukt for én generering? Forslag: lagres med posten som "source"-
  felt så du har den hvis du vil regenerere senere.
- **Format:** Er det egen tab, eller modus-toggle i Compose? Forslag:
  modus-toggle.

### Risiko

- **Artikkel-misrepresentasjon:** Modellen kan feilrepresentere hva
  artikkelen faktisk sier. Mitigering: streng regel "do not summarize",
  fokus skal være din vinkel, ikke artikkelens innhold.
- **Quote-hallusinasjon:** Modellen lager et oppdiktet sitat fra
  artikkelen. Mitigering: regel "do not put words in the article author's
  mouth — paraphrase only what is in the pasted text".

---

## Tverrgående refleksjoner

### Når Phase 2 utvider, hva vil bli vanskeligere?

- **Voice Profile blir komplekst.** Vi legger til templates, slider-
  defaults, edit-history, nye banlist-forslag. UI må holdes ryddig —
  kanskje fanestruktur INNE i Voice Profile-drawer-en.
- **Tester blir viktigere.** Med flere logikk-stier i prompt-bygger må
  vi ha en test-harness som verifiserer at endringer ikke bryter ting.
  Phase 1.5 inkluderte `scripts/test-prompts.js` for dette formålet.
- **Provider-abstraksjonen står på prøve.** Hvis vi en dag bytter til
  Claude API, skal alle Phase 2-features fungere uendret. API-en er
  designet for det, men templates-instruksjoner kan måtte tilpasses
  per provider.

### Når slutter "MVP" og begynner "for real"?

Forslag: når du har skrevet 3-5 LinkedIn-poster med Ghostwriter og
publisert dem, er MVP-fasen over. Da har vi nok data fra
edit-feedback-loop til å gjøre Voice Profile autotune. Det er
kvalitetstesten.

### Hva trenger Phase 3?

Stille seg på egne ben — flere providers, flere språk (fransk, arabisk
hvis aktuelt), eventuelt scheduled publishing via LinkedIn API (krever
backend, ikke gratis).

Men: ikke planlegg Phase 3 før Phase 2 er prøvd ut. Beslutninger
endres når du faktisk bruker verktøyet.
