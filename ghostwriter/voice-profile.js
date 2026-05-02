/* =====================================================================
   Ghostwriter — voice-profile.js
   Voice Profile editor: stilbeskrivelse, banliste, regler, eksempelvalg.

   Lagrer til ContentBrain.state.voiceProfile via det eksponerte interface-et.
   ===================================================================== */

(() => {
  "use strict";

  const { DEFAULT_VOICE, PILLAR_INFO } = window.Ghostwriter.prompts;

  // ----------------------------- helpers -----------------------------

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getProfile() {
    const cb = window.ContentBrain;
    const stored = cb?.getState()?.voiceProfile;
    return {
      description: stored?.description || DEFAULT_VOICE.description,
      bannedPhrases: stored?.bannedPhrases ? [...stored.bannedPhrases] : [...DEFAULT_VOICE.bannedPhrases],
      rules: stored?.rules ? [...stored.rules] : [...DEFAULT_VOICE.rules],
      pillars: stored?.pillars || { 1: { examples: [] }, 2: { examples: [] }, 3: { examples: [] }, 4: { examples: [] } },
    };
  }

  /**
   * Sammenlign brukers profil med DEFAULT_VOICE i kode.
   * Returnerer hvilke entries som finnes i defaults men ikke i profilen.
   * Brukes til "Synk nye standarder"-knappen.
   */
  function getStaleDefaults() {
    const profile = getProfile();
    const newBanned = DEFAULT_VOICE.bannedPhrases.filter(p => !profile.bannedPhrases.includes(p));
    const newRules = DEFAULT_VOICE.rules.filter(r => !profile.rules.includes(r));
    return { newBanned, newRules };
  }

  /**
   * Slå sammen nye defaults inn i brukers profil.
   * Legger kun til; sletter aldri brukers tilpasninger.
   */
  function mergeDefaults() {
    const profile = getProfile();
    const { newBanned, newRules } = getStaleDefaults();
    if (newBanned.length === 0 && newRules.length === 0) return false;
    saveProfile({
      ...profile,
      bannedPhrases: [...profile.bannedPhrases, ...newBanned],
      rules: [...profile.rules, ...newRules],
    });
    return true;
  }

  function saveProfile(profile) {
    const cb = window.ContentBrain;
    cb?.saveVoiceProfile(profile);
  }

  function publishedPosts() {
    const cb = window.ContentBrain;
    return (cb?.getState()?.posts || []).filter(p => p.status === "published" && p.body);
  }

  // ----------------------------- learning section -----------------------------

  /**
   * Læring-seksjon: viser banlist-forslag basert på faktiske edits,
   * length-kalibrering, og statistikk. Knytter Phase 2 edit-feedback-loop
   * til UI-en.
   */
  function renderLearningSection(profile) {
    const tracker = window.Ghostwriter?.editTracker;
    if (!tracker) return ""; // edit-tracker ikke lastet — skjul seksjonen

    const stats = tracker.getStats();
    const suggestions = tracker.getBanlistSuggestions({
      alreadyBanned: profile.bannedPhrases,
    });
    const lengthCal = tracker.getLengthCalibration();

    if (stats.totalEdits === 0) {
      return `
        <div class="vp-section vp-learning vp-learning-empty">
          <h4 class="vp-learning-head">📊 Læring fra dine edits</h4>
          <p class="muted small">
            Når du redigerer et generert utkast og lagrer til Pipeline, samler Ghostwriter
            data om hva du strøk og hva du la til. Etter 3+ edits dukker forslag opp her.
          </p>
        </div>
      `;
    }

    const suggestionsHtml = suggestions.length
      ? suggestions.slice(0, 8).map(s => `
          <div class="vp-suggestion" data-phrase="${escapeHtml(s.phrase)}">
            <div class="vp-suggestion-text">
              <span class="vp-suggestion-phrase">"${escapeHtml(s.phrase)}"</span>
              <span class="muted small">strøket ${s.count} ganger</span>
            </div>
            <div class="vp-suggestion-actions">
              <button type="button" class="linkbtn vp-add-banlist" data-phrase="${escapeHtml(s.phrase)}">+ Banliste</button>
              <button type="button" class="linkbtn vp-ignore" data-phrase="${escapeHtml(s.phrase)}">Ignorer</button>
            </div>
          </div>
        `).join("")
      : `<p class="muted small">Ingen forslag enda — du har redigert ${stats.totalEdits} ganger, men ingen frase er strøket nok ganger til å bli kandidat (terskel: 3).</p>`;

    const calibrationHtml = lengthCal
      ? `<p class="muted small vp-calibration">${escapeHtml(lengthCal.recommendation)} (snitt-delta: ${lengthCal.avgDelta} ord over ${lengthCal.sampleSize} edits)</p>`
      : "";

    return `
      <div class="vp-section vp-learning">
        <div class="vp-learning-head-row">
          <h4 class="vp-learning-head">📊 Læring fra dine edits</h4>
          <span class="muted small">${stats.totalEdits} edit${stats.totalEdits === 1 ? "" : "s"} sporet · ${stats.totalIgnored} ignorert</span>
        </div>
        <div class="vp-suggestions">
          ${suggestionsHtml}
        </div>
        ${calibrationHtml}
        <div class="vp-learning-foot">
          <button type="button" id="vp-learning-reset" class="linkbtn">Slett læringsdata</button>
        </div>
      </div>
    `;
  }

  function bindLearningEvents(container) {
    const tracker = window.Ghostwriter?.editTracker;
    if (!tracker) return;

    container.querySelectorAll(".vp-add-banlist").forEach(btn => {
      btn.addEventListener("click", () => {
        const phrase = btn.dataset.phrase;
        const profile = getProfile();
        if (!profile.bannedPhrases.includes(phrase)) {
          saveProfile({
            ...profile,
            bannedPhrases: [...profile.bannedPhrases, phrase],
          });
        }
        // Marker som "håndtert" så den ikke dukker opp igjen
        tracker.ignorePhrase(phrase);
        render(container);
      });
    });

    container.querySelectorAll(".vp-ignore").forEach(btn => {
      btn.addEventListener("click", () => {
        tracker.ignorePhrase(btn.dataset.phrase);
        render(container);
      });
    });

    const resetBtn = container.querySelector("#vp-learning-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (!confirm("Slette all læringsdata? Edit-historikken nullstilles. Banlistede fraser du allerede har lagt til beholdes.")) return;
        tracker.reset();
        render(container);
      });
    }
  }

  // ----------------------------- render -----------------------------

  function render(container) {
    const profile = getProfile();
    const posts = publishedPosts();

    container.innerHTML = `
      ${renderLearningSection(profile)}

      <div class="vp-section">
        <label class="vp-label">
          <span>Stilbeskrivelse</span>
          <span class="muted small">Kort beskrivelse av stemmen din. Brukes i hver generering.</span>
        </label>
        <textarea id="vp-description" rows="4">${escapeHtml(profile.description)}</textarea>
      </div>

      <div class="vp-section">
        <label class="vp-label">
          <span>Banliste — fraser modellen ikke skal bruke</span>
          <span class="muted small">Én frase per linje. Klisjeer modellen lett faller tilbake på.</span>
        </label>
        <textarea id="vp-banned" rows="8">${escapeHtml(profile.bannedPhrases.join("\n"))}</textarea>
      </div>

      <div class="vp-section">
        <label class="vp-label">
          <span>Regler</span>
          <span class="muted small">Strenge instruksjoner mot hallusinasjoner. Én regel per linje.</span>
        </label>
        <textarea id="vp-rules" rows="6">${escapeHtml(profile.rules.join("\n"))}</textarea>
      </div>

      <div class="vp-section">
        <label class="vp-label">
          <span>Eksempler per pilar</span>
          <span class="muted small">Velg 1-3 publiserte innlegg per pilar som few-shot eksempler. Hvis tom: auto-velg samme pilar.</span>
        </label>
        <div class="vp-pillars" id="vp-pillars"></div>
      </div>

      <div class="vp-actions">
        <button type="button" id="vp-reset" class="linkbtn">Tilbakestill til standard</button>
        <button type="button" id="vp-merge" class="linkbtn" hidden>Synk nye standarder</button>
        <div class="spacer"></div>
        <span class="muted small" id="vp-status"></span>
        <button type="button" id="vp-save" class="primary">Lagre Voice Profile</button>
      </div>
    `;

    // Vis "synk"-knapp hvis kode-defaults har nye entries som ikke er i profilen
    const stale = getStaleDefaults();
    const totalStale = stale.newBanned.length + stale.newRules.length;
    if (totalStale > 0) {
      const mergeBtn = container.querySelector("#vp-merge");
      mergeBtn.hidden = false;
      mergeBtn.textContent = `Synk ${totalStale} ny${totalStale === 1 ? "" : "e"} standard${totalStale === 1 ? "" : "er"} fra kode`;
      mergeBtn.title = `${stale.newBanned.length} bannlistede fraser, ${stale.newRules.length} regler`;
    }

    renderPillars(container.querySelector("#vp-pillars"), profile, posts);
    bindEvents(container, profile);
    bindLearningEvents(container);
  }

  function renderPillars(container, profile, posts) {
    container.innerHTML = "";

    [1, 2, 3, 4].forEach(pillar => {
      const pillarPosts = posts.filter(p => p.pillar === pillar);
      const selected = new Set(profile.pillars?.[pillar]?.examples || []);

      const card = document.createElement("div");
      card.className = "vp-pillar-card";
      card.innerHTML = `
        <h4>
          <span class="dot p${pillar}"></span>
          Pilar ${pillar} — ${PILLAR_INFO[pillar].label}
        </h4>
        <p class="muted small">${escapeHtml(PILLAR_INFO[pillar].tone)}</p>
        ${pillarPosts.length === 0
          ? `<p class="muted small">Ingen publiserte innlegg i denne pilaren ennå.</p>`
          : pillarPosts.map(p => `
              <label class="vp-example">
                <input type="checkbox" data-pillar="${pillar}" data-id="${escapeHtml(p.id)}" ${selected.has(p.id) ? "checked" : ""}/>
                <span class="vp-example-text">
                  <span class="vp-example-title">${escapeHtml(p.title || "(untitled)")}</span>
                  <span class="vp-example-body muted small">${escapeHtml((p.body || "").slice(0, 80))}…</span>
                </span>
              </label>
            `).join("")
        }
      `;
      container.appendChild(card);
    });
  }

  function bindEvents(container, _initialProfile) {
    const $ = sel => container.querySelector(sel);
    const $$ = sel => Array.from(container.querySelectorAll(sel));

    $("#vp-save").addEventListener("click", () => {
      const description = $("#vp-description").value.trim();
      const bannedPhrases = $("#vp-banned").value.split("\n").map(s => s.trim()).filter(Boolean);
      const rules = $("#vp-rules").value.split("\n").map(s => s.trim()).filter(Boolean);

      const pillars = { 1: { examples: [] }, 2: { examples: [] }, 3: { examples: [] }, 4: { examples: [] } };
      $$("#vp-pillars input[type='checkbox']").forEach(cb => {
        if (cb.checked) {
          const p = +cb.dataset.pillar;
          pillars[p].examples.push(cb.dataset.id);
        }
      });

      saveProfile({ description, bannedPhrases, rules, pillars });

      const status = $("#vp-status");
      status.textContent = "✓ Lagret";
      status.style.color = "var(--success)";
      setTimeout(() => { status.textContent = ""; }, 2500);
    });

    $("#vp-reset").addEventListener("click", () => {
      if (!confirm("Tilbakestille Voice Profile til standardverdier? Eksempelvalg blir også nullstilt.")) return;
      saveProfile({
        description: DEFAULT_VOICE.description,
        bannedPhrases: [...DEFAULT_VOICE.bannedPhrases],
        rules: [...DEFAULT_VOICE.rules],
        pillars: { 1: { examples: [] }, 2: { examples: [] }, 3: { examples: [] }, 4: { examples: [] } },
      });
      render(container);
    });

    const mergeBtn = $("#vp-merge");
    if (mergeBtn) {
      mergeBtn.addEventListener("click", () => {
        const merged = mergeDefaults();
        if (merged) {
          render(container);
          const status = $("#vp-status");
          status.textContent = "✓ Nye standarder lagt til";
          status.style.color = "var(--success)";
          setTimeout(() => { status.textContent = ""; }, 3000);
        }
      });
    }
  }

  // ----------------------------- export -----------------------------

  window.Ghostwriter = window.Ghostwriter || {};
  window.Ghostwriter.voiceProfile = {
    render,
    getProfile,
    saveProfile,
    getStaleDefaults,
    mergeDefaults,
  };
})();
