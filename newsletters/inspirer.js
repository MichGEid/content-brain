/* =====================================================================
   Content Brain — newsletters/inspirer.js
   "📥 Inspirasjon"-modul: paste newsletter-URL → LLM scorer artikler mot
   4-pilar-rotasjonen → review forslag → ett klikk for å legge dem til
   Pipeline som idé. Reuser ghostwriter/api.js for provider-dispatch og
   voice-profile.js for stilbilde.
   ===================================================================== */

(function () {
  "use strict";

  // ----------------------------- state -----------------------------

  const STORAGE_KEY = "newsletterInspirer.ui";
  let initialized = false;

  const ui = {
    url: "",
    text: "",
    showTextarea: false,
    suggestions: [],
    lastFetched: null,    // ISO timestamp
    lastSourceUrl: "",
    isLoading: false,
    abortController: null,
    elapsedTimer: null,
    elapsedSec: 0,
    // Override av provider/model for Inspirasjon. Hvis null → bruk Ghostwriter UI.
    providerOverride: null,
    modelOverride: null,
    // Manuell modus: bygger prompt lokalt, brukeren paster i claude.ai/ChatGPT,
    // kopierer JSON-svaret tilbake. Sidesteg av API-kostnad og rate limits.
    mode: "auto",         // "auto" | "manual"
    manualResponse: "",   // Pastet LLM-svar i manuell modus
  };

  /**
   * Hardkodet liste over kjente provider+model-kombinasjoner som er
   * gode for sortering/scoring (raske, billige, gode på følge-instruksjon).
   * Vises i dropdown-en på Inspirasjon-tabben. Brukeren kan fortsatt
   * bytte til en hvilken som helst annen modell via Ghostwriter UI.
   */
  const MODEL_PRESETS = [
    { provider: "gemini", model: "gemini-2.5-flash", label: "Gemini · 2.5-flash", note: "anbefalt for URL-fetch" },
    { provider: "gemini", model: "gemini-2.5-pro",   label: "Gemini · 2.5-pro",   note: "smartere, stram free tier" },
    { provider: "gemini", model: "gemini-2.0-flash", label: "Gemini · 2.0-flash", note: "raskere, eldre" },
    { provider: "claude", model: "claude-sonnet-4-6", label: "Claude · sonnet-4-6", note: "~$0.02/nyhetsbrev, paste-tekst" },
    { provider: "claude", model: "claude-haiku-4-5",  label: "Claude · haiku-4-5",  note: "billigere, raskere" },
    { provider: "claude", model: "claude-opus-4-6",   label: "Claude · opus-4-6",   note: "dyrest, for vanskelige caser" },
    { provider: "ollama", model: "qwen2.5:7b",        label: "Ollama · qwen2.5:7b", note: "lokalt, krever paste-tekst" },
    { provider: "ollama", model: "llama3.1:8b",       label: "Ollama · llama3.1:8b", note: "lokalt, krever paste-tekst" },
  ];

  function loadUi() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        ui.url = data.url || "";
        ui.text = data.text || "";
        ui.showTextarea = !!data.showTextarea;
        ui.suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        ui.lastFetched = data.lastFetched || null;
        ui.lastSourceUrl = data.lastSourceUrl || "";
        ui.providerOverride = data.providerOverride || null;
        ui.modelOverride = data.modelOverride || null;
        ui.mode = data.mode === "manual" ? "manual" : "auto";
        ui.manualResponse = data.manualResponse || "";
      }
    } catch (e) {}
  }

  function saveUi() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        url: ui.url,
        text: ui.text,
        showTextarea: ui.showTextarea,
        suggestions: ui.suggestions,
        lastFetched: ui.lastFetched,
        lastSourceUrl: ui.lastSourceUrl,
        providerOverride: ui.providerOverride,
        modelOverride: ui.modelOverride,
        mode: ui.mode,
        manualResponse: ui.manualResponse,
      }));
    } catch (e) {}
  }

  // ----------------------------- helpers -----------------------------

  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getGhostwriterUi() {
    try {
      const raw = localStorage.getItem("ghostwriter.ui");
      if (raw) return JSON.parse(raw) || {};
    } catch (e) {}
    return {};
  }

  function getCurrentProvider() {
    if (ui.providerOverride) return ui.providerOverride;
    const gw = getGhostwriterUi();
    return gw.provider || "gemini";
  }

  function getCurrentModel() {
    if (ui.modelOverride) return ui.modelOverride;
    const gw = getGhostwriterUi();
    return gw.model || null;
  }

  /**
   * Hvilken preset matcher nåværende provider+model? Brukes for å sette
   * default-valgt option i dropdown-en. Hvis ingen preset matcher (f.eks.
   * brukeren har en custom model satt i Ghostwriter), returnerer null
   * og dropdown viser "Bruk Ghostwriter-default"-valget.
   */
  function findCurrentPreset() {
    const p = getCurrentProvider();
    const m = getCurrentModel();
    return MODEL_PRESETS.find(x => x.provider === p && x.model === m) || null;
  }

  function getVoiceProfile() {
    if (window.Ghostwriter?.voiceProfile?.getProfile) {
      try { return window.Ghostwriter.voiceProfile.getProfile(); }
      catch (e) {}
    }
    // Fallback
    if (window.Ghostwriter?.prompts?.DEFAULT_VOICE) {
      return window.Ghostwriter.prompts.DEFAULT_VOICE;
    }
    return { description: [], banlist: [], rules: [], examplesByPillar: {} };
  }

  function getPillarInfo() {
    return window.Ghostwriter?.prompts?.PILLAR_INFO || {};
  }

  function getRecentPublished(n) {
    try {
      const cb = window.ContentBrain?.getState?.();
      if (!cb?.posts) return [];
      return cb.posts
        .filter(p => p.status === "published" && p.publishedAt)
        .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))
        .slice(0, n || 8)
        .map(p => ({ pillar: p.pillar, publishedAt: p.publishedAt }));
    } catch (e) { return []; }
  }

  /**
   * Anker-tekster fra siste Pipeline-poster med URL-kilde (typisk
   * Inspirasjon-tilføyelser). Brukes som eksklusjons-liste i prompten
   * så samme scene ikke kommer to ganger på rad.
   */
  function getRecentAnchors(n) {
    try {
      const cb = window.ContentBrain?.getState?.();
      if (!cb?.posts) return [];
      return cb.posts
        .filter(p => p.body && p.source && /^https?:\/\//.test(p.source))
        .sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || ""))
        .slice(0, n || 8)
        .map(p => p.body);
    } catch (e) { return []; }
  }

  // ----------------------------- render -----------------------------

  function init() {
    const panel = document.getElementById("inspirasjon");
    if (!panel) return;
    if (!initialized) {
      loadUi();
      initialized = true;
    }
    renderShell();
    bindEvents();
  }

  function renderShell() {
    const panel = document.getElementById("inspirasjon");
    if (!panel) return;

    const provider = getCurrentProvider();
    const providerLabel = ({
      ollama: "Ollama (lokalt)",
      gemini: "Gemini",
      claude: "Claude",
    })[provider] || provider;
    const providerSupportsUrl = provider === "gemini";

    const hasSuggestions = ui.suggestions.length > 0;
    const fetchedHint = ui.lastFetched
      ? `Sist hentet ${formatRelTime(ui.lastFetched)}${ui.lastSourceUrl ? ` fra ${shortUrl(ui.lastSourceUrl)}` : ""}`
      : "";

    const currentPreset = findCurrentPreset();
    const currentKey = currentPreset ? `${currentPreset.provider}::${currentPreset.model}` : "__ghostwriter__";
    const dropdownOptions = `
      <option value="__ghostwriter__" ${currentKey === "__ghostwriter__" ? "selected" : ""}>
        Bruk Ghostwriter-default (${escapeHtml(providerLabel)}${getCurrentModel() ? ` · ${escapeHtml(getCurrentModel())}` : ""})
      </option>
      ${MODEL_PRESETS.map(p => {
        const k = `${p.provider}::${p.model}`;
        const sel = k === currentKey ? "selected" : "";
        return `<option value="${escapeHtml(k)}" ${sel}>${escapeHtml(p.label)}${p.note ? ` — ${escapeHtml(p.note)}` : ""}</option>`;
      }).join("")}
    `;

    const isManual = ui.mode === "manual";

    panel.innerHTML = `
      <div class="panel-head">
        <h2>📥 Inspirasjon</h2>
        <p class="muted">${isManual
          ? "Manuell modus — bygg prompt lokalt, kjør i claude.ai eller annet chat-UI, paste JSON-svaret tilbake."
          : `Lim inn en nyhetsbrev-URL → ${providerLabel} foreslår 2-3 artikler som passer din 4-pilar-rotasjon.`}</p>
      </div>

      <div class="inspirer-mode-toggle">
        <button class="${ui.mode === "auto" ? "primary" : "linkbtn"}" data-mode="auto">🤖 Auto</button>
        <button class="${ui.mode === "manual" ? "primary" : "linkbtn"}" data-mode="manual">✋ Manuell</button>
        <span class="muted small">${isManual
          ? "Bruker Pro-abonnementet ditt (ingen API-kostnad)"
          : "Bruker valgt provider (API-kall)"}</span>
      </div>

      <div class="inspirer-input-row">
        <input type="url" id="inspirer-url" placeholder="${isManual ? 'https://leadershipintech.com/newsletters/… (brukes til å bygge prompten)' : (providerSupportsUrl ? 'https://leadershipintech.com/newsletters/…' : 'URL — krever Gemini for auto-fetch')}"
               value="${escapeHtml(ui.url)}"
               ${(!isManual && !providerSupportsUrl) ? 'disabled title="Bytt til en Gemini-modell for URL-fetch, eller paste tekst nedenfor"' : ""} />
        ${isManual
          ? `<button class="primary" id="inspirer-build-prompt">📋 Bygg prompt</button>`
          : `<button class="primary" id="inspirer-fetch" ${ui.isLoading ? "disabled" : ""}>
              ${ui.isLoading ? `Henter… ${ui.elapsedSec}s` : "Hent forslag"}
            </button>
            ${ui.isLoading ? `<button class="linkbtn" id="inspirer-abort">Avbryt</button>` : ""}`}
      </div>

      <div class="inspirer-meta-row">
        ${isManual
          ? `<span class="muted small">Modellvalg gjelder bare i Auto-modus.</span>`
          : `<label class="inspirer-model-picker">
              <span class="muted small">Modell:</span>
              <select id="inspirer-model" ${ui.isLoading ? "disabled" : ""}>
                ${dropdownOptions}
              </select>
            </label>`}
        <button class="linkbtn" id="inspirer-toggle-textarea">${ui.showTextarea ? "− Skjul" : "+ Paste tekst istedenfor URL"}</button>
        ${fetchedHint ? `<span class="muted small">${escapeHtml(fetchedHint)}</span>` : ""}
      </div>

      ${ui.showTextarea ? `
        <textarea id="inspirer-text" rows="8" placeholder="Lim inn hele nyhetsbrev-teksten her…">${escapeHtml(ui.text)}</textarea>
      ` : ""}

      ${isManual ? renderManualSection() : ""}

      <div id="inspirer-results" class="inspirer-results">
        ${hasSuggestions ? renderSuggestions() : (ui.isLoading ? renderLoadingState() : (isManual ? "" : renderEmptyState()))}
      </div>
    `;
  }

  function renderManualSection() {
    // Beregner om vi kan vise prompten (krever url eller text)
    const canBuild = !!(ui.url || ui.text);
    return `
      <div class="inspirer-manual">
        <details ${ui.url || ui.text ? "open" : ""}>
          <summary>📋 Generert prompt (klikk Kopier, lim inn i claude.ai eller annet chat-UI)</summary>
          ${canBuild
            ? `<div class="inspirer-manual-prompt-wrap">
                <textarea id="inspirer-manual-prompt" rows="10" readonly>${escapeHtml(buildPromptForManualMode())}</textarea>
                <button class="linkbtn" id="inspirer-copy-prompt">📋 Kopier prompt</button>
              </div>`
            : `<p class="muted small">Lim inn URL eller paste tekst over først, så genererer vi prompten.</p>`}
        </details>

        <details ${ui.manualResponse ? "open" : ""}>
          <summary>📥 Lim inn JSON-svar fra LLM-en</summary>
          <textarea id="inspirer-manual-response" rows="8" placeholder='Lim inn JSON-arrayet du fikk tilbake (typisk noe sånt som [{"pillar":1, "title":"…", "anchor":"…", …}])'>${escapeHtml(ui.manualResponse)}</textarea>
          <div class="inspirer-manual-actions">
            <button class="primary" id="inspirer-parse-manual">Tolk svar → suggestion-cards</button>
            <button class="linkbtn" id="inspirer-clear-manual">Tøm felt</button>
          </div>
        </details>
      </div>
    `;
  }

  function buildPromptForManualMode() {
    if (!window.NewsletterInspirer?.prompts?.buildCombinedPrompt) return "";
    const voiceProfile = getVoiceProfile();
    const pillarInfo = getPillarInfo();
    const recentPublished = getRecentPublished(8);
    const recentAnchors = getRecentAnchors(8);
    return window.NewsletterInspirer.prompts.buildCombinedPrompt({
      voiceProfile,
      pillarInfo,
      recentPublished,
      recentAnchors,
      url: ui.url || "",
      text: ui.text || "",
    });
  }

  function renderLoadingState() {
    return `
      <div class="inspirer-loading">
        <div class="inspirer-loading-spinner"></div>
        <span>Leser nyhetsbrev og scorer artikler mot pillars… (${ui.elapsedSec}s)</span>
      </div>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="inspirer-empty">
        <p class="muted">Ingen forslag ennå. Lim inn en URL eller tekst over og klikk <em>Hent forslag</em>.</p>
        <p class="muted small">Tips: Gemini henter URL-en selv via url_context. For Claude/Ollama trenger du å paste teksten inn.</p>
      </div>
    `;
  }

  function renderSuggestions() {
    const pillarColors = {
      1: "p1", 2: "p2", 3: "p3", 4: "p4",
    };
    return `
      <div class="inspirer-suggestions">
        ${ui.suggestions.map((s, idx) => {
          const cls = pillarColors[s.pillar] || "";
          const pillarInfo = getPillarInfo()[s.pillar];
          const pillarLabel = pillarInfo ? pillarInfo.label : `Pillar ${s.pillar}`;
          return `
            <article class="inspirer-card" data-idx="${idx}">
              <header class="inspirer-card-head">
                <span class="dot ${cls}" title="Pillar ${s.pillar}"></span>
                <span class="inspirer-card-pillar">${escapeHtml(pillarLabel)}</span>
                <span class="inspirer-card-score" title="Fit-score (1-10)">★ ${s.fitScore}/10</span>
              </header>
              <h3 class="inspirer-card-title">${escapeHtml(s.title)}</h3>
              <p class="inspirer-card-anchor">${escapeHtml(s.anchor)}</p>
              ${s.reasoning ? `<p class="inspirer-card-reason muted small">→ ${escapeHtml(s.reasoning)}</p>` : ""}
              <div class="inspirer-card-meta">
                ${s.sourceUrl ? `<a href="${escapeHtml(s.sourceUrl)}" target="_blank" rel="noopener" class="muted small">↗ ${escapeHtml(s.sourceTitle || "Kilde")}</a>` : ""}
              </div>
              <div class="inspirer-card-actions">
                <button class="primary inspirer-add-btn" data-idx="${idx}">+ Legg til Pipeline</button>
                <button class="linkbtn inspirer-skip-btn" data-idx="${idx}">Hopp over</button>
              </div>
            </article>
          `;
        }).join("")}
        ${ui.suggestions.length > 0 ? `
          <div class="inspirer-bulk-actions">
            <button class="linkbtn" id="inspirer-add-all">+ Legg til alle (${ui.suggestions.length})</button>
            <button class="linkbtn" id="inspirer-clear">Tøm liste</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  // ----------------------------- events -----------------------------

  function bindEvents() {
    const urlInput = $("#inspirer-url");
    if (urlInput) {
      urlInput.addEventListener("input", e => { ui.url = e.target.value; saveUi(); });
    }
    const textInput = $("#inspirer-text");
    if (textInput) {
      textInput.addEventListener("input", e => { ui.text = e.target.value; saveUi(); });
    }
    const toggleBtn = $("#inspirer-toggle-textarea");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        ui.showTextarea = !ui.showTextarea;
        saveUi();
        renderShell();
        bindEvents();
      });
    }
    const modelSel = $("#inspirer-model");
    if (modelSel) {
      modelSel.addEventListener("change", e => {
        const v = e.target.value;
        if (v === "__ghostwriter__") {
          ui.providerOverride = null;
          ui.modelOverride = null;
        } else {
          const [prov, model] = v.split("::");
          ui.providerOverride = prov;
          ui.modelOverride = model;
        }
        saveUi();
        // Re-render fordi URL-feltet er disabled på ikke-Gemini-providere
        renderShell();
        bindEvents();
      });
    }
    const fetchBtn = $("#inspirer-fetch");
    if (fetchBtn) {
      fetchBtn.addEventListener("click", onFetch);
    }
    const abortBtn = $("#inspirer-abort");
    if (abortBtn) {
      abortBtn.addEventListener("click", () => {
        if (ui.abortController) ui.abortController.abort();
      });
    }

    // Mode-toggle
    $$("[data-mode]").forEach(btn => {
      btn.addEventListener("click", () => {
        ui.mode = btn.dataset.mode === "manual" ? "manual" : "auto";
        saveUi();
        renderShell();
        bindEvents();
      });
    });

    // Manuell modus: bygg prompt
    const buildPromptBtn = $("#inspirer-build-prompt");
    if (buildPromptBtn) {
      buildPromptBtn.addEventListener("click", () => {
        // Trigger re-render så prompt-textarea oppdaterer seg
        renderShell();
        bindEvents();
        // Scroll prompten i view
        const promptEl = $("#inspirer-manual-prompt");
        if (promptEl) {
          promptEl.scrollIntoView({ behavior: "smooth", block: "center" });
          promptEl.select();
        }
      });
    }

    // Manuell modus: kopier prompt
    const copyPromptBtn = $("#inspirer-copy-prompt");
    if (copyPromptBtn) {
      copyPromptBtn.addEventListener("click", async () => {
        const promptEl = $("#inspirer-manual-prompt");
        if (!promptEl) return;
        try {
          await navigator.clipboard.writeText(promptEl.value);
          copyPromptBtn.textContent = "✓ Kopiert!";
          setTimeout(() => { copyPromptBtn.textContent = "📋 Kopier prompt"; }, 1500);
        } catch (e) {
          // Fallback: select textarea og la bruker Cmd+C selv
          promptEl.select();
          promptEl.setSelectionRange(0, 99999);
          alert("Kunne ikke kopiere automatisk — trykk Cmd+C for å kopiere det markerte feltet.");
        }
      });
    }

    // Manuell modus: paste-respons
    const manualResponseEl = $("#inspirer-manual-response");
    if (manualResponseEl) {
      manualResponseEl.addEventListener("input", e => {
        ui.manualResponse = e.target.value;
        saveUi();
      });
    }

    // Manuell modus: parse pastet svar
    const parseManualBtn = $("#inspirer-parse-manual");
    if (parseManualBtn) {
      parseManualBtn.addEventListener("click", onParseManualResponse);
    }

    // Manuell modus: tøm respons-felt
    const clearManualBtn = $("#inspirer-clear-manual");
    if (clearManualBtn) {
      clearManualBtn.addEventListener("click", () => {
        ui.manualResponse = "";
        saveUi();
        renderShell();
        bindEvents();
      });
    }

    // Suggestion-card actions
    $$(".inspirer-add-btn").forEach(btn => {
      btn.addEventListener("click", () => onAdd(Number(btn.dataset.idx)));
    });
    $$(".inspirer-skip-btn").forEach(btn => {
      btn.addEventListener("click", () => onSkip(Number(btn.dataset.idx)));
    });
    const addAllBtn = $("#inspirer-add-all");
    if (addAllBtn) addAllBtn.addEventListener("click", onAddAll);
    const clearBtn = $("#inspirer-clear");
    if (clearBtn) clearBtn.addEventListener("click", onClear);
  }

  // ----------------------------- fetch flow -----------------------------

  async function onFetch() {
    if (ui.isLoading) return;

    const provider = getCurrentProvider();
    const model = getCurrentModel();
    const url = (ui.url || "").trim();
    const text = (ui.text || "").trim();

    if (!url && !text) {
      alert("Lim inn en URL eller paste nyhetsbrev-teksten først.");
      return;
    }
    if (!window.NewsletterInspirer?.prompts) {
      alert("inspirer-prompts.js er ikke lastet.");
      return;
    }
    if (!window.Ghostwriter?.api?.generate) {
      alert("Ghostwriter api.js er ikke lastet.");
      return;
    }

    // Gemini er eneste provider med url_context — fall tilbake til paste-tekst
    // hvis bruker har URL men ikke Gemini
    const willUseUrl = !!url && provider === "gemini";
    const willUseText = !!text || (!url && !text);

    if (url && !text && provider !== "gemini") {
      alert(`URL-fetch krever Gemini (du bruker ${provider}). Bytt provider i Ghostwriter-fanen, eller paste nyhetsbrev-teksten inn istedenfor.`);
      return;
    }

    const prompts = window.NewsletterInspirer.prompts;
    const voiceProfile = getVoiceProfile();
    const pillarInfo = getPillarInfo();
    const recentPublished = getRecentPublished(8);
    const recentAnchors = getRecentAnchors(8);

    const system = prompts.buildSystemPrompt({ voiceProfile, pillarInfo, recentPublished, recentAnchors });
    const userPrompt = prompts.buildUserPrompt({
      url: willUseUrl ? url : "",
      text: willUseText ? text : "",
    });

    // Start loading state
    ui.isLoading = true;
    ui.elapsedSec = 0;
    ui.abortController = new AbortController();
    ui.elapsedTimer = setInterval(() => {
      ui.elapsedSec++;
      // Lett re-render bare av loading-status, ikke hele skallet
      const btn = $("#inspirer-fetch");
      if (btn) btn.textContent = `Henter… ${ui.elapsedSec}s`;
      const loadingText = $(".inspirer-loading span");
      if (loadingText) loadingText.textContent = `Leser nyhetsbrev og scorer artikler mot pillars… (${ui.elapsedSec}s)`;
    }, 1000);
    renderShell();
    bindEvents();

    try {
      const result = await window.Ghostwriter.api.generate({
        provider,
        model,
        system,
        prompt: userPrompt,
        useUrlContext: willUseUrl,
        signal: ui.abortController.signal,
      });

      const rawText = typeof result === "string" ? result : (result?.text || "");
      const parsed = prompts.parseResponse(rawText);

      if (!parsed.ok) {
        console.warn("[inspirer] Parse feilet:", parsed.error, parsed.raw);
        alert(`Kunne ikke tolke svar fra ${provider}: ${parsed.error}\n\nSe Console for full respons. Prøv igjen, eller bytt provider.`);
        return;
      }

      ui.suggestions = parsed.suggestions;
      ui.lastFetched = new Date().toISOString();
      ui.lastSourceUrl = url || "(pastet tekst)";
      saveUi();
    } catch (e) {
      if (e.name === "AbortError") {
        console.log("[inspirer] Avbrutt av bruker");
      } else {
        console.error("[inspirer] Feil:", e);
        alert(`Feil: ${e.message}`);
      }
    } finally {
      ui.isLoading = false;
      if (ui.elapsedTimer) { clearInterval(ui.elapsedTimer); ui.elapsedTimer = null; }
      ui.abortController = null;
      renderShell();
      bindEvents();
    }
  }

  // ----------------------------- manual mode parser -----------------------------

  function onParseManualResponse() {
    if (!ui.manualResponse || !ui.manualResponse.trim()) {
      alert("Lim inn LLM-svaret først (JSON-arrayet du fikk fra claude.ai/ChatGPT/Gemini).");
      return;
    }
    if (!window.NewsletterInspirer?.prompts?.parseResponse) {
      alert("inspirer-prompts.js er ikke lastet.");
      return;
    }
    const parsed = window.NewsletterInspirer.prompts.parseResponse(ui.manualResponse);
    if (!parsed.ok) {
      alert(`Kunne ikke tolke svar: ${parsed.error}\n\nForventer en JSON-array. Sjekk at du paster hele svaret inkludert klammeparenteser [ ... ].`);
      return;
    }
    if (!parsed.suggestions.length) {
      alert("LLM-svaret tolket OK, men ingen gyldige forslag funnet. Sjekk at JSON-en har pillar/title/anchor-felt.");
      return;
    }
    ui.suggestions = parsed.suggestions;
    ui.lastFetched = new Date().toISOString();
    ui.lastSourceUrl = ui.url || "(manuelt — pastet svar)";
    saveUi();
    renderShell();
    bindEvents();
  }

  // ----------------------------- card actions -----------------------------

  function onAdd(idx) {
    const s = ui.suggestions[idx];
    if (!s) return;
    if (!window.ContentBrain?.addPost) {
      alert("ContentBrain.addPost er ikke tilgjengelig.");
      return;
    }
    const post = {
      status: "idea",
      pillar: s.pillar,
      title: s.title,
      body: s.anchor,
      source: s.sourceUrl || "",
    };
    window.ContentBrain.addPost(post);
    // Fjern fra forslagslisten så bruker ser at det er gjort
    ui.suggestions.splice(idx, 1);
    saveUi();
    renderShell();
    bindEvents();
  }

  function onSkip(idx) {
    ui.suggestions.splice(idx, 1);
    saveUi();
    renderShell();
    bindEvents();
  }

  function onAddAll() {
    if (!ui.suggestions.length) return;
    if (!confirm(`Legg til alle ${ui.suggestions.length} forslag som ideer i Pipeline?`)) return;
    if (!window.ContentBrain?.addPost) {
      alert("ContentBrain.addPost er ikke tilgjengelig.");
      return;
    }
    for (const s of ui.suggestions) {
      window.ContentBrain.addPost({
        status: "idea",
        pillar: s.pillar,
        title: s.title,
        body: s.anchor,
        source: s.sourceUrl || "",
      });
    }
    ui.suggestions = [];
    saveUi();
    renderShell();
    bindEvents();
  }

  function onClear() {
    if (ui.suggestions.length && !confirm("Tøm alle forslag uten å legge dem til?")) return;
    ui.suggestions = [];
    saveUi();
    renderShell();
    bindEvents();
  }

  // ----------------------------- utility -----------------------------

  function formatRelTime(iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const diff = Math.round((Date.now() - t) / 1000);
    if (diff < 60) return `${diff}s siden`;
    if (diff < 3600) return `${Math.round(diff / 60)} min siden`;
    if (diff < 86400) return `${Math.round(diff / 3600)} t siden`;
    return `${Math.round(diff / 86400)} d siden`;
  }

  function shortUrl(u) {
    try {
      const parsed = new URL(u);
      return parsed.hostname.replace(/^www\./, "") + parsed.pathname.slice(0, 25) + (parsed.pathname.length > 25 ? "…" : "");
    } catch (e) { return u.slice(0, 40); }
  }

  // ----------------------------- export -----------------------------

  const NewsletterInspirer = {
    init,
    _getUi: () => ui, // for debugging fra DevTools
  };

  if (typeof window !== "undefined") {
    window.NewsletterInspirer = window.NewsletterInspirer || {};
    Object.assign(window.NewsletterInspirer, NewsletterInspirer);
  }
})();
