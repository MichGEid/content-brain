/* =====================================================================
   Ghostwriter — edit-tracker.js
   Phase 2 — IKKE WIRED TIL UI ENNÅ. Skjelett for review.

   Tracker forskjeller mellom genererte utkast og brukerens redigerte
   versjoner over tid. Aggregerer signaler:
     - Fraser som strykes gjentatte ganger → forslag til banliste
     - Setninger som legges til → forslag til Voice Profile-utvidelse
     - Lengde-deltaer → kalibrering av lengde-presets

   Lagrer alt lokalt (state.editLearning) — aldri sendt videre.

   STATUS: design + API-kontrakt klar. Implementasjon må gjøres når
   Phase 2 startes. Funksjonene under er stubs som returnerer riktig
   form, men logikk er minimal.
   ===================================================================== */

(() => {
  "use strict";

  const STORAGE_KEY = "ghostwriter.editLearning";

  // Antall forekomster før vi foreslår at en frase legges til banliste
  const PHRASE_THRESHOLD = 3;
  // Hvor stor del av teksten som må være endret for å kalles "edit"
  const EDIT_DELTA_THRESHOLD = 0.05; // 5%

  // ----------------------------- storage -----------------------------

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      edits: [],            // hver edit som ble registrert
      phraseFrequency: {},  // { "fast-paced": 4, "shared understanding": 2, ... }
      sentenceAdditions: {},// fraser/struktur Michel legger TIL
      lengthDeltas: [],     // [-12, -34, +5, ...] (ord lagt til/fjernet)
      ignoredPhrases: [],   // fraser brukeren har avvist som forslag
    };
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  // ----------------------------- diff -----------------------------

  /**
   * Enkel n-gram diff. Returnerer fraser (2-5 grams) som finnes i
   * `generated` men ikke i `edited`. Brukes for å fange ting brukeren
   * konsekvent stryker.
   */
  function findRemovedPhrases(generated, edited) {
    const gramSizes = [2, 3, 4, 5];
    const removed = new Set();

    const tokenize = s => s.toLowerCase()
      .replace(/[.,;:!?\-—()\[\]"']/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    const editedSet = new Set();
    const editedTokens = tokenize(edited);
    for (const n of gramSizes) {
      for (let i = 0; i <= editedTokens.length - n; i++) {
        editedSet.add(editedTokens.slice(i, i + n).join(" "));
      }
    }

    const genTokens = tokenize(generated);
    for (const n of gramSizes) {
      for (let i = 0; i <= genTokens.length - n; i++) {
        const gram = genTokens.slice(i, i + n).join(" ");
        if (!editedSet.has(gram)) removed.add(gram);
      }
    }

    // Bare beholde de meningsfulle (ikke vanlige stoppord-kombinasjoner)
    return Array.from(removed).filter(p => isInterestingPhrase(p));
  }

  function findAddedPhrases(generated, edited) {
    return findRemovedPhrases(edited, generated); // omvendt
  }

  /**
   * Filter til "interessante" fraser — de som er kandidater for banliste.
   * Strenge stoppord-kombinasjoner som "of the" filtreres bort.
   */
  function isInterestingPhrase(phrase) {
    const stopOnly = /^(the|a|an|and|or|but|of|to|in|on|at|for|with|is|was|are|were|i|you|he|she|it|we|they|that|this)(\s+(the|a|an|and|or|but|of|to|in|on|at|for|with|is|was|are|were|i|you|he|she|it|we|they|that|this))+$/i;
    if (stopOnly.test(phrase)) return false;
    if (phrase.length < 6) return false;
    if (phrase.split(" ").every(w => w.length <= 2)) return false;
    return true;
  }

  // ----------------------------- record an edit -----------------------------

  /**
   * Kalles når brukeren lagrer et utkast som er forskjellig fra det
   * modellen genererte. Oppdaterer aggregat-statistikk.
   */
  function recordEdit({ generated, edited, pillar, model, postId }) {
    if (!generated || !edited) return;
    if (!isSubstantialEdit(generated, edited)) return;

    const state = load();

    const removed = findRemovedPhrases(generated, edited);
    const added = findAddedPhrases(generated, edited);

    removed.forEach(p => {
      state.phraseFrequency[p] = (state.phraseFrequency[p] || 0) + 1;
    });

    added.forEach(p => {
      state.sentenceAdditions[p] = (state.sentenceAdditions[p] || 0) + 1;
    });

    const genWords = generated.trim().split(/\s+/).length;
    const editWords = edited.trim().split(/\s+/).length;
    state.lengthDeltas.push(editWords - genWords);

    state.edits.push({
      postId,
      pillar,
      model,
      timestamp: new Date().toISOString(),
      genWords,
      editWords,
      removedCount: removed.length,
      addedCount: added.length,
    });

    save(state);
  }

  function isSubstantialEdit(a, b) {
    if (!a || !b) return false;
    const len = Math.max(a.length, b.length);
    const distance = approximateDistance(a, b);
    return distance / len >= EDIT_DELTA_THRESHOLD;
  }

  /**
   * Approksimasjon av redigerings-avstand uten full Levenshtein.
   * Bra nok for "er dette en faktisk edit eller bare små justeringer?".
   */
  function approximateDistance(a, b) {
    const aw = new Set(a.toLowerCase().split(/\s+/));
    const bw = new Set(b.toLowerCase().split(/\s+/));
    const symmetricDiff = [...aw].filter(w => !bw.has(w)).length
                       + [...bw].filter(w => !aw.has(w)).length;
    return symmetricDiff;
  }

  // ----------------------------- suggestions -----------------------------

  /**
   * Returnerer fraser som er kandidater for banliste basert på antall
   * ganger de er blitt strøket fra genererte utkast.
   *
   * @param {Object} opts
   * @param {number} opts.minOccurrences - Minimum antall ganger fra forslag
   * @param {Array<string>} opts.alreadyBanned - Fraser allerede i Voice Profile-banlisten (skipper dem)
   */
  function getBanlistSuggestions({
    minOccurrences = PHRASE_THRESHOLD,
    alreadyBanned = [],
  } = {}) {
    const state = load();
    const ignoredSet = new Set(state.ignoredPhrases || []);
    const bannedSet = new Set(alreadyBanned.map(p => p.toLowerCase()));
    return Object.entries(state.phraseFrequency)
      .filter(([phrase, count]) => {
        if (count < minOccurrences) return false;
        if (ignoredSet.has(phrase)) return false;
        // Skip om frasen overlapper med eksisterende banliste
        const lower = phrase.toLowerCase();
        if (bannedSet.has(lower)) return false;
        for (const banned of bannedSet) {
          if (lower.includes(banned) || banned.includes(lower)) return false;
        }
        return true;
      })
      .sort((a, b) => b[1] - a[1])
      .map(([phrase, count]) => ({ phrase, count }));
  }

  /**
   * Marker en frase som "ikke foreslå igjen". Brukes når Michel klikker
   * Ignorer på et forslag.
   */
  function ignorePhrase(phrase) {
    const state = load();
    state.ignoredPhrases = state.ignoredPhrases || [];
    if (!state.ignoredPhrases.includes(phrase)) {
      state.ignoredPhrases.push(phrase);
      save(state);
    }
  }

  /**
   * Returner antall edits som er sporet totalt.
   */
  function getStats() {
    const state = load();
    return {
      totalEdits: state.edits.length,
      totalPhrasesTracked: Object.keys(state.phraseFrequency).length,
      totalAdditionsTracked: Object.keys(state.sentenceAdditions).length,
      totalIgnored: (state.ignoredPhrases || []).length,
      lastEditAt: state.edits.length ? state.edits[state.edits.length - 1].timestamp : null,
    };
  }

  /**
   * Hva legger Michel ofte til? Kan bli inspirasjon til Voice Profile-
   * beskrivelses-utvidelse eller new few-shot eksempel-utvalg.
   */
  function getAdditionPatterns({ minOccurrences = PHRASE_THRESHOLD } = {}) {
    const state = load();
    return Object.entries(state.sentenceAdditions)
      .filter(([_, count]) => count >= minOccurrences)
      .sort((a, b) => b[1] - a[1])
      .map(([phrase, count]) => ({ phrase, count }));
  }

  /**
   * Gjennomsnittlig lengde-delta. Hvis -30% → vurder å justere
   * num_predict eller default-lengde nedover.
   */
  function getLengthCalibration() {
    const state = load();
    if (!state.lengthDeltas.length) return null;
    const avg = state.lengthDeltas.reduce((a, b) => a + b, 0) / state.lengthDeltas.length;
    return {
      avgDelta: Math.round(avg),
      sampleSize: state.lengthDeltas.length,
      recommendation: avg < -20
        ? "Du kutter konsekvent — vurder kortere default."
        : avg > 20
        ? "Du legger til mye — vurder lengre default."
        : "Default-lengde matcher dine edits.",
    };
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function exportLearning() {
    return load();
  }

  // ----------------------------- export -----------------------------

  window.Ghostwriter = window.Ghostwriter || {};
  window.Ghostwriter.editTracker = {
    recordEdit,
    getBanlistSuggestions,
    getAdditionPatterns,
    getLengthCalibration,
    getStats,
    ignorePhrase,
    exportLearning,
    reset,
    // Lavere-nivå (for testing)
    findRemovedPhrases,
    findAddedPhrases,
    isSubstantialEdit,
  };
})();
