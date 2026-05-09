/* =====================================================================
   Ghostwriter — ghostwriter.js (main module)
   Compose-panel, generator, output, edit, lagre til Pipeline.
   ===================================================================== */

(() => {
  "use strict";

  const { api, prompts, voiceProfile, editTracker } = window.Ghostwriter;
  const { LENGTH_PRESETS, PILLAR_INFO, TONE_AXES, buildSystemPrompt, buildUserPrompt, buildRegeneratePrompt, selectExamples } = prompts;

  // ----------------------------- state (UI-local) -----------------------------

  /**
   * Smart default-provider: hvis vi er på HTTPS (typisk Pages-deploy)
   * og ikke localhost, default til Gemini. Ollama fungerer kun lokalt
   * (mixed-content), så å starte med Ollama på Pages skaper umiddelbart
   * forvirring ("blokkert (HTTPS)"-status).
   */
  function defaultProviderForOrigin() {
    const isHttps = location.protocol === "https:";
    const isLocalhost = ["localhost", "127.0.0.1", ""].includes(location.hostname);
    if (isHttps && !isLocalhost) return "gemini";
    return "ollama";
  }

  const _defaultProvider = defaultProviderForOrigin();
  const _defaultModel = _defaultProvider === "gemini" ? "gemini-2.5-flash" : "llama3.1:8b";

  const ui = {
    provider: _defaultProvider,
    model: _defaultModel,
    pillar: 1,
    lengthKey: "standard",
    composeMode: "standard",   // "standard" | "article-reaction"
    toneByPillar: {},           // { 1: 30, 2: 20, 3: 20, 4: 70 } — defaults fra TONE_AXES, brukes i system-prompt
    anchor: "",
    idea: "",
    articleText: "",            // artikkel-tekst for reaction-modus
    articleUrl: "",             // referanse-URL (valgfritt)
    articleAngle: "",           // Michels vinkel

    // Conversation: array av { id, role, text, timestamp, meta? }
    // Phase 4: chat-style refinement. Første turn er fra Compose-feltene,
    // påfølgende user-turns er feedback i Forbedre-flyten.
    conversation: [],
    feedbackInput: "",          // tekst i Forbedre-feltet før Send
    feedbackInProgress: false,  // true når Forbedre-feltet er åpent

    output: "",                 // view of editable last model turn (for word count + edit-tracking)
    lastGenerated: "",          // første model-turn — baseline for edit-feedback-loop
    lastSystemPrompt: "",
    lastUserPrompt: "",
    busy: false,
    abortController: null,
    voiceProfileExpanded: false,

    // Auto-Draft i Pipeline: opprettes ved første model-turn, oppdateres
    // ved hver iterasjon, "promoteres" til Klar når Lagre klikkes.
    // Forhindrer datatap når brukeren ikke klikker Lagre.
    autoDraftPostId: null,
    autoDraftSavedAt: null,
  };

  // ----------------------------- conversation helpers -----------------------------

  const newTurnId = () => "t_" + Math.random().toString(36).slice(2, 10);

  function getCurrentToneValue() {
    const pillar = ui.pillar;
    if (typeof ui.toneByPillar?.[pillar] === "number") return ui.toneByPillar[pillar];
    return TONE_AXES?.[pillar]?.defaultValue ?? 50;
  }
  function setCurrentToneValue(value) {
    if (!ui.toneByPillar) ui.toneByPillar = {};
    ui.toneByPillar[ui.pillar] = value;
  }

  function lastModelTurn() {
    for (let i = ui.conversation.length - 1; i >= 0; i--) {
      if (ui.conversation[i].role === "model") return ui.conversation[i];
    }
    return null;
  }

  /**
   * Siste DRAFT-turn — det vi lagrer til Pipeline.
   * Hopper over "answer"-turns (Spør-modus) som ikke produserer nytt utkast.
   */
  function lastDraftTurn() {
    for (let i = ui.conversation.length - 1; i >= 0; i--) {
      const t = ui.conversation[i];
      if (t.role === "model" && (t.type === "draft" || !t.type)) return t;
    }
    return null;
  }

  function firstModelTurn() {
    return ui.conversation.find(t => t.role === "model") || null;
  }

  function addUserTurn(text, type = "iterate") {
    ui.conversation.push({
      id: newTurnId(),
      role: "user",
      type,                          // "start" | "iterate" | "ask"
      text,
      timestamp: new Date().toISOString(),
    });
  }

  function addModelTurn(text, meta, type = "draft") {
    ui.conversation.push({
      id: newTurnId(),
      role: "model",
      type,                          // "draft" | "answer"
      text,
      timestamp: new Date().toISOString(),
      meta: meta || null,
    });
    // Bare draft-turns blir editerbare og kan lagres
    if (type === "draft") {
      ui.output = text;
      if (!ui.lastGenerated) ui.lastGenerated = text;
    }
  }

  function clearConversation() {
    ui.conversation = [];
    ui.feedbackInput = "";
    ui.feedbackInProgress = false;
    ui.output = "";
    ui.lastGenerated = "";
    ui.lastMeta = null;
    ui.lastSystemPrompt = "";
    ui.lastUserPrompt = "";
    ui.autoDraftPostId = null;
    ui.autoDraftSavedAt = null;
  }

  /**
   * Auto-save siste draft som Pipeline-Draft. Opprettes ved første
   * model-turn, oppdateres ved hver iterasjon. Sikrer at brukeren aldri
   * mister arbeid selv om de glemmer å klikke Lagre.
   *
   * - Hvis ui.autoDraftPostId ikke finnes (eller posten er slettet):
   *   opprett ny Pipeline-post med status="draft"
   * - Hvis den finnes: oppdater body + metadata
   */
  function autoSaveDraftToPipeline() {
    const cb = window.ContentBrain;
    if (!cb || !cb.addPost) return;

    const draft = lastDraftTurn();
    if (!draft || !draft.text.trim()) return;

    // Sjekk at eksisterende post-ID fortsatt er gyldig
    if (ui.autoDraftPostId && cb.hasPost && !cb.hasPost(ui.autoDraftPostId)) {
      ui.autoDraftPostId = null;
    }

    const firstLine = draft.text.split("\n").find(l => l.trim()) || "Ghostwriter draft";
    const title = firstLine.slice(0, 80) + (firstLine.length > 80 ? "…" : "");
    const isArticleReaction = ui.composeMode === "article-reaction";
    const sourceField = isArticleReaction
      ? (ui.articleUrl.trim() || "ghostwriter (article reaction)")
      : "ghostwriter";
    const noteField = isArticleReaction
      ? `Article reaction. Angle: ${ui.articleAngle.slice(0, 200)}\nArticle excerpt: ${ui.articleText.slice(0, 300)}…`
      : `Anchor: ${ui.anchor.slice(0, 200)}`;

    if (ui.autoDraftPostId && cb.updatePost) {
      // Oppdater eksisterende auto-draft
      cb.updatePost(ui.autoDraftPostId, {
        title,
        body: draft.text,
        pillar: ui.pillar,
        source: sourceField,
        notes: noteField,
      });
    } else {
      // Opprett ny auto-draft
      const id = cb.addPost({
        title,
        body: draft.text,
        pillar: ui.pillar,
        status: "draft",
        source: sourceField,
        notes: noteField,
        capturedAt: new Date().toISOString(),
      });
      ui.autoDraftPostId = id;
    }

    ui.autoDraftSavedAt = new Date().toISOString();
    saveDraftSoon();   // persistere autoDraftPostId i ghostwriter.draft

    // Vis status-melding
    showAutoDraftStatus();
  }

  // Debounced oppdatering av auto-Pipeline-draft når brukeren editerer inline
  let autoDraftUpdateTimer = null;
  function scheduleAutoDraftUpdate() {
    if (autoDraftUpdateTimer) clearTimeout(autoDraftUpdateTimer);
    autoDraftUpdateTimer = setTimeout(() => {
      autoSaveDraftToPipeline();
    }, 1500);
  }

  function showAutoDraftStatus() {
    const el = document.querySelector("#gw-autodraft-status");
    if (!el) return;
    if (ui.autoDraftSavedAt) {
      const t = new Date(ui.autoDraftSavedAt).toLocaleTimeString("nb-NO", {
        hour: "2-digit", minute: "2-digit",
      });
      el.textContent = `💾 Auto-lagret som Draft i Pipeline ${t}`;
      el.className = "gw-autodraft-status saved";
    } else {
      el.textContent = "";
    }
  }

  /**
   * Bygg messages-array for API basert på samtale-historikken.
   * Første user-message er fra Compose-feltene (anker/article).
   *
   * KRITISK: påfølgende user-meldinger får eksplisitt mode-markør så
   * modellen vet om det er en revisjon eller et spørsmål. Uten dette
   * tolker modellen ofte chatty feedback som dialogue og svarer med
   * meta-tekst i stedet for å regenerere posten.
   *
   * @param {string} initialUserPrompt - faktisk prompt for første user-turn
   * @param {Array} conversation - samtale-array (default: ui.conversation, eksponert for testing)
   */
  function buildConversationMessages(initialUserPrompt, conversation = ui.conversation) {
    const messages = [];
    let firstUserSent = false;

    for (const turn of conversation) {
      if (turn.role === "user") {
        if (!firstUserSent) {
          // Første user-turn: faktisk prompt fra Compose-feltene
          messages.push({ role: "user", content: initialUserPrompt });
          firstUserSent = true;
        } else {
          // Påfølgende: marker tydelig hva slags melding dette er
          let content;
          if (turn.type === "ask") {
            content =
              "[QUESTION — please answer my question concisely. Do NOT produce a new draft of the post. Just answer.]\n\n" +
              turn.text;
          } else {
            // iterate (default)
            content =
              "[REVISE THE DRAFT — produce a FULL revised version of the LinkedIn post incorporating the feedback below. Output the complete post itself, not commentary, not a discussion, not meta-text. Maintain length and voice rules from the system prompt.]\n\n" +
              turn.text;
          }
          messages.push({ role: "user", content });
        }
      } else if (turn.role === "model") {
        messages.push({ role: "assistant", content: turn.text });
      }
    }
    return messages;
  }

  function loadUiState() {
    try {
      const raw = localStorage.getItem("ghostwriter.ui");
      if (raw) Object.assign(ui, JSON.parse(raw));
    } catch (e) {}
  }

  function saveUiState() {
    const persisted = {
      provider: ui.provider,
      model: ui.model,
      pillar: ui.pillar,
      lengthKey: ui.lengthKey,
      composeMode: ui.composeMode,
      toneByPillar: ui.toneByPillar,
    };
    try {
      localStorage.setItem("ghostwriter.ui", JSON.stringify(persisted));
    } catch (e) {}
  }

  // Compose-input + output autosave (debounced) — så ingen edits går tapt
  // ved reload, accidental tab-bytte, eller browser-krasj.
  let draftSaveTimer = null;
  function saveDraftSoon() {
    showAutosaveStatus("lagrer…");
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      try {
        localStorage.setItem("ghostwriter.draft", JSON.stringify({
          anchor: ui.anchor,
          idea: ui.idea,
          articleText: ui.articleText,
          articleUrl: ui.articleUrl,
          articleAngle: ui.articleAngle,
          conversation: ui.conversation,
          feedbackInput: ui.feedbackInput,
          feedbackInProgress: ui.feedbackInProgress,
          feedbackMode: ui.feedbackMode,
          autoDraftPostId: ui.autoDraftPostId,
          autoDraftSavedAt: ui.autoDraftSavedAt,
          output: ui.output,
          lastGenerated: ui.lastGenerated,    // bevar baseline for edit-tracking på tvers av reload
          lastMeta: ui.lastMeta,
          savedAt: new Date().toISOString(),
        }));
        const t = new Date().toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
        showAutosaveStatus(`● Auto-lagret ${t}`, "saved");
      } catch (e) {
        showAutosaveStatus("kunne ikke lagre", "err");
      }
    }, 400);
  }
  function showAutosaveStatus(text, cls) {
    const el = document.querySelector("#gw-autosave");
    if (!el) return;
    el.textContent = text;
    el.className = "gw-autosave" + (cls ? " " + cls : "");
  }
  function loadDraft() {
    try {
      const raw = localStorage.getItem("ghostwriter.draft");
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.anchor) ui.anchor = draft.anchor;
      if (draft.idea) ui.idea = draft.idea;
      if (draft.articleText)  ui.articleText  = draft.articleText;
      if (draft.articleUrl)   ui.articleUrl   = draft.articleUrl;
      if (draft.articleAngle) ui.articleAngle = draft.articleAngle;
      if (Array.isArray(draft.conversation)) ui.conversation = draft.conversation;
      if (typeof draft.feedbackInput === "string") ui.feedbackInput = draft.feedbackInput;
      if (typeof draft.feedbackInProgress === "boolean") ui.feedbackInProgress = draft.feedbackInProgress;
      if (typeof draft.feedbackMode === "string") ui.feedbackMode = draft.feedbackMode;
      if (typeof draft.autoDraftPostId === "string") ui.autoDraftPostId = draft.autoDraftPostId;
      if (typeof draft.autoDraftSavedAt === "string") ui.autoDraftSavedAt = draft.autoDraftSavedAt;

      // Sanity: feedback-modus uten samtale gir mening ikke. Reset.
      if (ui.feedbackInProgress && ui.conversation.length === 0) {
        ui.feedbackInProgress = false;
        ui.feedbackInput = "";
      }
      // Sanity: ingen draft i samtalen → ikke i feedback heller
      if (ui.feedbackInProgress && !lastDraftTurn()) {
        ui.feedbackInProgress = false;
      }
      if (draft.output) ui.output = draft.output;
      if (draft.lastGenerated) ui.lastGenerated = draft.lastGenerated;
      if (draft.lastMeta) ui.lastMeta = draft.lastMeta;
      if (draft.savedAt) {
        const t = new Date(draft.savedAt).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
        setTimeout(() => showAutosaveStatus(`● Auto-lagret ${t}`, "saved"), 100);
      }
    } catch (e) {}
  }
  function saveOutputDraft() { saveDraftSoon(); }

  // ----------------------------- helpers -----------------------------

  const $ = sel => document.querySelector(sel);
  const escapeHtml = s => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function isLocalOrigin() {
    const h = location.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "" || location.protocol === "file:";
  }

  // ----------------------------- environment check -----------------------------

  /**
   * Ollama-providers trenger å snakke med http://localhost:11434.
   * Browseren blokkerer mixed content fra HTTPS-sider med få unntak.
   * Hvis vi er på Pages (HTTPS, ikke localhost): vis advarsel.
   *
   * Gemini/Claude bruker HTTPS-endpoints og fungerer derfor på Pages.
   * Denne sjekken brukes kun for Ollama.
   */
  function checkEnvironment() {
    // Bare Ollama har mixed-content-problem
    if (ui.provider !== "ollama") return { ok: true };
    if (location.protocol === "https:" && !isLocalOrigin()) {
      return {
        ok: false,
        reason: "remote-https",
        message: "Ollama trenger å kjøres fra http://localhost. Bytt til Gemini-provider (fungerer på Pages), eller kjør 'npm run dev' og åpne http://localhost:8081.",
      };
    }
    return { ok: true };
  }

  // ----------------------------- render: top bar (provider + voice profile toggle) -----------------------------

  function renderTopBar(container) {
    const providers = api.listProviders();
    const currentProvider = api.getProvider(ui.provider);
    const needsKey = currentProvider?.requiresApiKey;
    const hasKey = needsKey && api.hasApiKey(ui.provider);

    container.innerHTML = `
      <div class="gw-topbar">
        <div class="gw-provider">
          <label>
            <span>Provider</span>
            <select id="gw-provider">
              ${providers.map(p => `
                <option value="${p.key}" ${p.key === ui.provider ? "selected" : ""}>${escapeHtml(p.label)}</option>
              `).join("")}
            </select>
          </label>
          <label>
            <span>Modell</span>
            <select id="gw-model"></select>
          </label>
          ${needsKey
            ? `<button type="button" class="gw-apikey-btn ${hasKey ? "set" : "unset"}" id="gw-apikey" title="${hasKey ? "API-nøkkel satt — klikk for å endre" : "Sett API-nøkkel"}">
                 ${hasKey ? "🔑 Endre nøkkel" : "🔑 Sett nøkkel"}
               </button>`
            : ""}
          <span class="gw-status" id="gw-provider-status"></span>
        </div>
        <button type="button" class="linkbtn" id="gw-toggle-vp">
          ${ui.voiceProfileExpanded ? "Skjul Voice Profile" : "Voice Profile"}
        </button>
      </div>
    `;

    refreshModelList();
    pingProvider();

    $("#gw-provider").addEventListener("change", e => {
      ui.provider = e.target.value;
      const p = api.getProvider(ui.provider);
      ui.model = p.defaultModel;
      saveUiState();
      renderAll();    // re-render så API-nøkkel-knapp dukker opp/forsvinner
    });

    $("#gw-model").addEventListener("change", e => {
      ui.model = e.target.value;
      saveUiState();
    });

    $("#gw-toggle-vp").addEventListener("click", () => {
      ui.voiceProfileExpanded = !ui.voiceProfileExpanded;
      renderAll();
    });

    // API-nøkkel-knapp: prompt for ny nøkkel, eller fjern hvis brukeren limer inn tom streng
    const apikeyBtn = $("#gw-apikey");
    if (apikeyBtn) {
      apikeyBtn.addEventListener("click", () => {
        const provider = api.getProvider(ui.provider);
        const existing = api.getApiKey(ui.provider) || "";
        const masked = existing ? existing.slice(0, 6) + "…" + existing.slice(-4) : "";
        const help = provider.apiKeyHelp || "";
        const promptMsg = `${provider.label} API-nøkkel${existing ? ` (nåværende: ${masked})` : ""}\n\n${help}\n\nLim inn nøkkel (tom streng for å fjerne):`;
        const newKey = prompt(promptMsg, existing);
        if (newKey === null) return;     // brukeren cancelte
        api.setApiKey(ui.provider, newKey.trim());
        renderAll();                      // re-render for ny knapp-state og ping
      });
    }
  }

  async function refreshModelList() {
    const select = $("#gw-model");
    if (!select) return;
    const provider = api.getProvider(ui.provider);
    select.innerHTML = `<option value="${escapeHtml(ui.model)}">${escapeHtml(ui.model)}</option>`;
    try {
      const models = await provider.listModels();
      if (models && models.length) {
        select.innerHTML = models.map(m =>
          `<option value="${escapeHtml(m)}" ${m === ui.model ? "selected" : ""}>${escapeHtml(m)}</option>`
        ).join("");
      }
    } catch (e) { /* keep fallback */ }
  }

  async function pingProvider() {
    const status = $("#gw-provider-status");
    if (!status) return;
    const provider = api.getProvider(ui.provider);
    if (!provider.ping) {
      status.textContent = "";
      return;
    }

    // Hvis provider trenger nøkkel og vi mangler en — vis det tydelig
    if (provider.requiresApiKey && !api.hasApiKey(ui.provider)) {
      status.textContent = "● mangler nøkkel";
      status.className = "gw-status err";
      return;
    }

    status.textContent = "sjekker…";
    status.className = "gw-status muted";

    // Mixed-content-sjekken gjelder kun for Ollama (lokal HTTP).
    // Gemini/Claude er HTTPS, så hopp over for dem.
    if (ui.provider === "ollama") {
      const env = checkEnvironment();
      if (!env.ok) {
        status.textContent = "blokkert (HTTPS)";
        status.className = "gw-status err";
        return;
      }
    }

    const ok = await provider.ping();
    status.textContent = ok ? "● tilkoblet" : "● ikke tilgjengelig";
    status.className = "gw-status " + (ok ? "ok" : "err");
  }

  // ----------------------------- render: voice profile drawer -----------------------------

  function renderVoiceProfileDrawer(container) {
    container.innerHTML = ui.voiceProfileExpanded ? `<div class="gw-vp-drawer" id="gw-vp-drawer"></div>` : "";
    if (ui.voiceProfileExpanded) {
      voiceProfile.render($("#gw-vp-drawer"));
    }
  }

  // ----------------------------- render: compose -----------------------------

  function renderCompose(container) {
    container.innerHTML = `
      <div class="gw-section">
        <div class="gw-compose-head">
          <h3>Compose</h3>
          <div class="gw-mode-toggle" role="tablist">
            <button type="button" class="gw-mode-btn ${ui.composeMode === "standard" ? "active" : ""}" data-mode="standard">Standard</button>
            <button type="button" class="gw-mode-btn ${ui.composeMode === "article-reaction" ? "active" : ""}" data-mode="article-reaction">Article reaction</button>
          </div>
        </div>
        <p class="muted small">${ui.composeMode === "article-reaction"
          ? "Lim inn artikkel-tekst og din vinkel — modellen genererer en kort reaksjon i din stemme."
          : "Et konkret øyeblikk eller en spenningspunkt — det modellen bygger på."}</p>

        <div class="gw-compose-meta">
          <label>
            <span>Pilar</span>
            <select id="gw-pillar">
              ${[1, 2, 3, 4].map(p => `
                <option value="${p}" ${p === ui.pillar ? "selected" : ""}>
                  ${p} · ${escapeHtml(PILLAR_INFO[p].label)}
                </option>
              `).join("")}
            </select>
          </label>
          <label>
            <span>Lengde</span>
            <select id="gw-length">
              ${Object.entries(LENGTH_PRESETS).map(([k, v]) => `
                <option value="${k}" ${k === ui.lengthKey ? "selected" : ""}>${escapeHtml(v.label)}</option>
              `).join("")}
            </select>
          </label>
        </div>

        ${renderToneSlider()}

        ${ui.composeMode === "article-reaction"
          ? renderArticleReactionFields()
          : renderStandardFields()}

        <div class="gw-compose-actions">
          <span class="muted small" id="gw-from-pipeline-hint"></span>
          <span class="gw-autosave" id="gw-autosave"></span>
          <div class="spacer"></div>
          ${ui.busy
            ? `<button type="button" id="gw-cancel" class="secondary">Avbryt</button>
               <span class="gw-elapsed" id="gw-elapsed">0.0s</span>`
            : `<button type="button" id="gw-generate" class="primary" title="Cmd+Enter">Generer utkast</button>`}
        </div>
      </div>
    `;

    // Mode-toggle
    container.querySelectorAll(".gw-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const newMode = btn.dataset.mode;
        if (newMode === ui.composeMode) return;
        // Hvis det er en aktiv samtale, advar før vi bytter modus
        if (ui.conversation.length > 0) {
          if (!confirm(`Bytte til ${newMode === "article-reaction" ? "Article reaction" : "Standard"}-modus?\n\nDette starter en ny samtale. Lagre eller forkast den nåværende først hvis du vil ta vare på utkastet.`)) {
            return;
          }
          clearConversation();
        }
        ui.composeMode = newMode;
        saveUiState();
        renderAll();
      });
    });

    $("#gw-pillar").addEventListener("change", e => {
      ui.pillar = +e.target.value;
      saveUiState();
      updateWordCount();
      renderAll();   // for å oppdatere tone-slider med ny pilars akser
    });

    const toneSlider = $("#gw-tone-slider");
    if (toneSlider) {
      toneSlider.addEventListener("input", e => {
        const v = +e.target.value;
        setCurrentToneValue(v);
        const valEl = $("#gw-tone-value");
        if (valEl) valEl.textContent = v;
        saveUiState();
      });
    }
    $("#gw-length").addEventListener("change", e => {
      ui.lengthKey = e.target.value;
      saveUiState();
      updateWordCount();
    });

    // Felt-binding avhengig av modus
    if (ui.composeMode === "standard") {
      $("#gw-anchor")?.addEventListener("input", e => { ui.anchor = e.target.value; saveDraftSoon(); });
      $("#gw-idea")?.addEventListener("input",   e => { ui.idea   = e.target.value; saveDraftSoon(); });
      setupMic();
    } else {
      $("#gw-article-text")?.addEventListener("input",  e => { ui.articleText  = e.target.value; saveDraftSoon(); });
      $("#gw-article-url")?.addEventListener("input",   e => { ui.articleUrl   = e.target.value; saveDraftSoon(); });
      $("#gw-article-angle")?.addEventListener("input", e => { ui.articleAngle = e.target.value; saveDraftSoon(); });
      setupAngleMic();
    }

    $("#gw-generate")?.addEventListener("click", onGenerate);
    $("#gw-cancel")?.addEventListener("click", onCancel);
  }

  /**
   * Auto-tilpass tekstboks-høyde til innholdet — så hele utkastet vises
   * uten scroll. Min 4 rows, max 50 rows (for veldig lange tekster).
   */
  function autoSizeTextarea(el) {
    if (!el) return;
    const lineHeight = 22;       // grovt estimat (matcher line-height i CSS)
    const minHeight = lineHeight * 4;
    const maxHeight = lineHeight * 50;
    el.style.height = "auto";
    const desired = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
    el.style.height = desired + "px";
  }

  // ----------------------------- elapsed timer + cancel -----------------------------

  let elapsedTimer = null;
  let elapsedStart = 0;
  function startElapsedTimer() {
    elapsedStart = Date.now();
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = setInterval(() => {
      const el = document.querySelector("#gw-elapsed");
      if (!el) return;
      const seconds = ((Date.now() - elapsedStart) / 1000).toFixed(1);
      el.textContent = `${seconds}s`;
    }, 100);
  }
  function stopElapsedTimer() {
    if (elapsedTimer) clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function onCancel() {
    if (ui.abortController) {
      ui.abortController.abort();
    }
  }

  function renderToneSlider() {
    const axis = TONE_AXES?.[ui.pillar];
    if (!axis) return "";
    const value = getCurrentToneValue();
    return `
      <div class="gw-tone">
        <div class="gw-tone-head">
          <span class="muted small">Tone for denne pilaren</span>
          <span class="gw-tone-value" id="gw-tone-value">${value}</span>
        </div>
        <input type="range" min="0" max="100" step="5" value="${value}" id="gw-tone-slider" class="gw-tone-slider"/>
        <div class="gw-tone-labels">
          <span class="gw-tone-label-low">${escapeHtml(axis.low)}</span>
          <span class="gw-tone-label-high">${escapeHtml(axis.high)}</span>
        </div>
      </div>
    `;
  }

  function renderStandardFields() {
    return `
      <label>
        <span>
          Anker — det konkrete øyeblikket
          <span class="gw-anchor-mic-host">
            <select id="gw-mic-lang" class="gw-mic-lang">
              <option value="nb-NO">🇳🇴 Norsk</option>
              <option value="en-US">🇬🇧 English</option>
            </select>
            <button type="button" id="gw-mic" class="gw-mic-btn" title="Snakk inn anker">🎤</button>
            <span class="gw-mic-status" id="gw-mic-status"></span>
          </span>
        </span>
        <textarea id="gw-anchor" rows="4" placeholder="F.eks: 'En kollega kom innom i dag og sa at hun ikke turte å spørre direkte i møtet. Vi snakket om det i 5 min, og det endret hvordan jeg leser slike rom.'">${escapeHtml(ui.anchor)}</textarea>
      </label>

      <label>
        <span>Refleksjonen du vil lande på (valgfritt)</span>
        <textarea id="gw-idea" rows="2" placeholder="F.eks: 'Sideways conversations matter more than people think.'">${escapeHtml(ui.idea)}</textarea>
      </label>
    `;
  }

  function renderArticleReactionFields() {
    const isGemini = ui.provider === "gemini";
    const urlHint = isGemini
      ? "Med Gemini kan du la artikkel-tekst stå tom — modellen henter URL-en selv."
      : "Ollama kan ikke hente URLs — du må lime inn tekst nedenfor.";

    return `
      <label>
        <span>
          Artikkel-URL
          <span class="muted small">${escapeHtml(urlHint)}</span>
        </span>
        <input type="url" id="gw-article-url" placeholder="https://…" value="${escapeHtml(ui.articleUrl)}"/>
      </label>

      <label>
        <span>Artikkel-tekst ${isGemini ? "(valgfritt hvis URL er fylt)" : "(påkrevd)"}</span>
        <textarea id="gw-article-text" rows="8" placeholder="${isGemini
          ? "Valgfritt — la stå tom hvis du har URL og vil at Gemini skal hente artikkelen.\n\nEller: Cmd+A i artikkel-fanen → Cmd+C → her: Cmd+V"
          : "Lim inn hele eller relevante deler av artikkelen.\n\nTips: Cmd+A i artikkel-fanen → Cmd+C → her: Cmd+V"}">${escapeHtml(ui.articleText)}</textarea>
      </label>

      <label>
        <span>
          Din vinkel — hva fanget deg, hva er din take?
          <span class="gw-anchor-mic-host">
            <select id="gw-angle-mic-lang" class="gw-mic-lang">
              <option value="nb-NO">🇳🇴 Norsk</option>
              <option value="en-US">🇬🇧 English</option>
            </select>
            <button type="button" id="gw-angle-mic" class="gw-mic-btn" title="Snakk inn vinkel">🎤</button>
            <span class="gw-mic-status" id="gw-angle-mic-status"></span>
          </span>
        </span>
        <textarea id="gw-article-angle" rows="3" placeholder="F.eks: 'Det artikkelen sier om regulatorisk gap matcher det jeg ser i medtech-eksport — vil koble dette til norsk health export-strategi.'">${escapeHtml(ui.articleAngle)}</textarea>
      </label>
    `;
  }

  // ----------------------------- speech input -----------------------------

  let micRecognition = null;
  let micActive = false;
  let micActiveContext = null;     // { btn, status, target, onText }

  /**
   * Konfigurer mic-knapp for et hvilket som helst tekstfelt.
   *
   * @param {Object} cfg
   * @param {string} cfg.btnSelector
   * @param {string} cfg.statusSelector
   * @param {string} cfg.langSelector
   * @param {string} cfg.targetSelector  - textarea/input å skrive til
   * @param {Function} cfg.onText        - callback når ny tekst er transkribert (string → void)
   * @param {string} cfg.tooltipIdle     - tooltip når ikke i opptak
   */
  function setupMicGeneric(cfg) {
    const btn = document.querySelector(cfg.btnSelector);
    const status = document.querySelector(cfg.statusSelector);
    const langSel = document.querySelector(cfg.langSelector);
    if (!btn) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btn.disabled = true;
      btn.title = "Stemmenotat ikke støttet i denne nettleseren";
      if (status) {
        status.textContent = "ikke støttet";
        status.className = "gw-mic-status err";
      }
      return;
    }

    btn.addEventListener("click", () => {
      // Hvis denne mic-en er aktiv: stopp. Hvis en annen er aktiv: stopp den, start denne.
      if (micActive && micActiveContext?.btn === btn) {
        stopMicGeneric();
      } else {
        if (micActive) stopMicGeneric();
        startMicGeneric({ btn, status, langSel, target: document.querySelector(cfg.targetSelector), onText: cfg.onText, tooltipIdle: cfg.tooltipIdle });
      }
    });
  }

  function startMicGeneric({ btn, status, langSel, target, onText, tooltipIdle }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    micActiveContext = { btn, status, target, onText, tooltipIdle };
    micRecognition = new SR();
    micRecognition.lang = langSel?.value || "nb-NO";
    micRecognition.continuous = true;
    micRecognition.interimResults = true;

    micRecognition.onstart = () => {
      micActive = true;
      btn.classList.add("recording");
      btn.textContent = "⏹";
      btn.title = "Stopp opptak";
      if (status) {
        status.textContent = "lytter…";
        status.className = "gw-mic-status ok";
      }
    };

    micRecognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += text + " ";
        else interim += text;
      }
      if (finalText) {
        const trimmed = finalText.trim();
        if (onText) onText(trimmed);
        if (target) {
          target.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      if (interim && status) {
        status.textContent = `…${interim}`;
        status.className = "gw-mic-status muted";
      }
    };

    micRecognition.onerror = (event) => {
      if (status) {
        status.textContent = `feil: ${event.error}`;
        status.className = "gw-mic-status err";
      }
      stopMicGeneric();
    };

    micRecognition.onend = () => {
      micActive = false;
      btn.classList.remove("recording");
      btn.textContent = "🎤";
      btn.title = tooltipIdle || "Snakk inn";
      if (status) {
        setTimeout(() => { if (!micActive) status.textContent = ""; }, 1500);
      }
      micActiveContext = null;
    };

    try {
      micRecognition.start();
    } catch (e) {
      if (status) {
        status.textContent = "kunne ikke starte: " + e.message;
        status.className = "gw-mic-status err";
      }
    }
  }

  function stopMicGeneric() {
    if (micRecognition) {
      try { micRecognition.stop(); } catch (e) {}
    }
  }

  // Backwards-compat: setupMic for anker-feltet
  function setupMic() {
    setupMicGeneric({
      btnSelector: "#gw-mic",
      statusSelector: "#gw-mic-status",
      langSelector: "#gw-mic-lang",
      targetSelector: "#gw-anchor",
      tooltipIdle: "Snakk inn anker",
      onText: (text) => {
        ui.anchor = (ui.anchor ? ui.anchor.trim() + " " : "") + text;
        const el = document.querySelector("#gw-anchor");
        if (el) el.value = ui.anchor;
      },
    });
  }

  // Mic for "Din vinkel"-feltet i article-reaction-modus
  function setupAngleMic() {
    setupMicGeneric({
      btnSelector: "#gw-angle-mic",
      statusSelector: "#gw-angle-mic-status",
      langSelector: "#gw-angle-mic-lang",
      targetSelector: "#gw-article-angle",
      tooltipIdle: "Snakk inn vinkel",
      onText: (text) => {
        ui.articleAngle = (ui.articleAngle ? ui.articleAngle.trim() + " " : "") + text;
        const el = document.querySelector("#gw-article-angle");
        if (el) el.value = ui.articleAngle;
      },
    });
  }

  // Mic for feedback-feltet (Forbedre-flyt)
  function setupFeedbackMic() {
    setupMicGeneric({
      btnSelector: "#gw-feedback-mic",
      statusSelector: "#gw-feedback-mic-status",
      langSelector: "#gw-feedback-mic-lang",
      targetSelector: "#gw-feedback-input",
      tooltipIdle: "Snakk inn forbedring",
      onText: (text) => {
        ui.feedbackInput = (ui.feedbackInput ? ui.feedbackInput.trim() + " " : "") + text;
        const el = document.querySelector("#gw-feedback-input");
        if (el) el.value = ui.feedbackInput;
      },
    });
  }

  // Aliaser for backwards-compat
  function startMic(langCode) {
    // Brukes ikke direkte lenger — setupMic håndterer dette
  }
  function stopMic() { stopMicGeneric(); }

  // ----------------------------- render: output -----------------------------

  function renderOutput(container) {
    // Tom samtale + ikke i gang: vis tom tilstand
    if (ui.conversation.length === 0 && !ui.busy) {
      container.innerHTML = `
        <div class="gw-section gw-output gw-output-empty">
          <p class="muted small">Samtalen kommer her når du har generert første utkast. Etter første utkast kan du forbedre via tekst eller mic.</p>
        </div>
      `;
      return;
    }

    // Render conversation-tråd
    const lastModel = lastModelTurn();
    const showActions = lastModel && !ui.busy;

    // Antall turns + grov token-estimat (bare advarsel når det blir stort)
    const totalChars = ui.conversation.reduce((s, t) => s + (t.text?.length || 0), 0);
    const estTokens = Math.round(totalChars / 4);  // grov tommelfingerregel
    const warning = estTokens > 8000
      ? `<span class="gw-conv-warn">⚠ Stor samtale (~${estTokens} tokens). Vurder å lagre eller starte ny.</span>`
      : "";

    const pillarLabel = PILLAR_INFO[ui.pillar]?.label || "";
    container.innerHTML = `
      <div class="gw-section gw-conv">
        <div class="gw-conv-head">
          <h3>
            <span class="dot p${ui.pillar}" title="Pilar ${ui.pillar}: ${escapeHtml(pillarLabel)}"></span>
            Samtale
            <span class="muted small">Pilar ${ui.pillar} · ${ui.conversation.length} turn${ui.conversation.length === 1 ? "" : "s"}</span>
          </h3>
          <div class="gw-conv-head-actions">
            <span class="gw-autodraft-status" id="gw-autodraft-status"></span>
            <span class="muted small" id="gw-conv-meta">${warning}</span>
            <button type="button" class="linkbtn" id="gw-conv-new" title="Forkast samtalen og start på nytt (auto-Draft i Pipeline beholdes)">↺ Ny samtale</button>
          </div>
        </div>

        <div class="gw-conv-thread" id="gw-conv-thread">
          ${ui.conversation.map((turn, idx) => renderTurn(turn, idx, idx === ui.conversation.length - 1)).join("")}
          ${ui.busy ? `<div class="gw-conv-card gw-conv-card-model gw-conv-busy">
            <div class="gw-conv-role">🤖 Ghostwriter</div>
            <div class="gw-conv-busy-indicator">
              <span class="gw-elapsed" id="gw-elapsed">0.0s</span>
              <button type="button" id="gw-cancel" class="secondary">Avbryt</button>
            </div>
          </div>` : ""}
        </div>

        ${showActions ? renderConvActions() : ""}

        <div id="gw-prompt-preview" class="gw-prompt-preview" hidden></div>
      </div>
    `;

    // Bind events for siste model-turn (editerbar tekst)
    bindConvEvents();
    updateWordCount();
    showAutoDraftStatus();
  }

  function renderTurn(turn, idx, isLast) {
    const lastDraft = lastDraftTurn();
    const isLastDraft = turn.role === "model" && (turn.type === "draft" || !turn.type) && lastDraft && turn.id === lastDraft.id;

    if (turn.role === "user") {
      const userLabel =
        turn.type === "ask" ? "👤 Du (spør)" :
        turn.type === "start" || idx === 0 ? "👤 Du (start)" :
        "👤 Du (forbedring)";
      return `
        <div class="gw-conv-card gw-conv-card-user${turn.type === "ask" ? " gw-conv-card-ask" : ""}">
          <div class="gw-conv-role">${userLabel}</div>
          <div class="gw-conv-text gw-conv-user-text">${escapeHtml(turn.text)}</div>
        </div>
      `;
    }

    // model turn
    const meta = turn.meta;
    const metaStr = meta
      ? `${meta.tokens || "?"} tokens · ${meta.durationMs ? (meta.durationMs / 1000).toFixed(1) + "s" : "?"}${meta.tokensPerSec ? ` · ${meta.tokensPerSec} t/s` : ""}`
      : "";

    if (turn.type === "answer") {
      // Svar på spørsmål — read-only, kompakt visning, ikke i utkast-stilen
      return `
        <div class="gw-conv-card gw-conv-card-model gw-conv-card-answer">
          <div class="gw-conv-role">
            🤖 Ghostwriter (svar)
            ${metaStr ? `<span class="muted small">${escapeHtml(metaStr)}</span>` : ""}
          </div>
          <div class="gw-conv-text gw-conv-answer-text">${escapeHtml(turn.text)}</div>
        </div>
      `;
    }

    // draft-turn — editerbar hvis det er siste draft i samtalen
    const editableAttr = isLastDraft ? "" : "readonly";
    return `
      <div class="gw-conv-card gw-conv-card-model${isLastDraft ? " is-last" : ""}">
        <div class="gw-conv-role">
          🤖 Ghostwriter (utkast)
          ${metaStr ? `<span class="muted small">${escapeHtml(metaStr)}</span>` : ""}
        </div>
        <textarea class="gw-conv-text gw-conv-model-text" data-turn-id="${turn.id}" rows="${Math.max(4, Math.min(20, turn.text.split("\n").length + 2))}" ${editableAttr}>${escapeHtml(turn.text)}</textarea>
        ${isLastDraft ? `<div class="gw-conv-foot"><span class="gw-word-count" id="gw-word-count"></span></div>` : ""}
      </div>
    `;
  }

  function renderConvActions() {
    if (ui.feedbackInProgress) {
      const mode = ui.feedbackMode || "iterate";   // "iterate" | "ask"
      const isAsk = mode === "ask";
      const heading = isAsk
        ? "Spør / chat — spør om noe i forrige svar, ingen ny utkast genereres"
        : "Forbedre — beskriv eller dikter inn hva du vil endre";
      const placeholder = isAsk
        ? "F.eks: 'hva betyr leader amplification i denne sammenhengen?', 'kan du forklare den siste setningen?', 'hvorfor valgte du å åpne med X?'"
        : "F.eks: 'kortere', 'liker ikke avslutningen', 'gi 3 alternativer for åpningen', 'blend forrige med en mer personlig tone'";
      const sendLabel = isAsk ? "Send spørsmål" : "Send forbedring";
      const micTooltip = isAsk ? "Snakk inn spørsmål" : "Snakk inn forbedring";

      const chips = isAsk
        ? `
          <button type="button" class="gw-chip" data-chip="forklar dette enklere">forklar enklere</button>
          <button type="button" class="gw-chip" data-chip="hvorfor valgte du den formuleringen">hvorfor denne formuleringen</button>
          <button type="button" class="gw-chip" data-chip="hva betyr">hva betyr…</button>
          <button type="button" class="gw-chip" data-chip="andre måter å si dette på">andre formuleringer</button>
        `
        : `
          <button type="button" class="gw-chip" data-chip="kortere">kortere</button>
          <button type="button" class="gw-chip" data-chip="mer personlig">mer personlig</button>
          <button type="button" class="gw-chip" data-chip="annen avslutning">annen avslutning</button>
          <button type="button" class="gw-chip" data-chip="skarpere åpning">skarpere åpning</button>
          <button type="button" class="gw-chip" data-chip="gi 3 alternativer for avslutningen">3 alternativer for avslutning</button>
        `;

      return `
        <div class="gw-conv-feedback${isAsk ? " gw-conv-feedback-ask" : ""}">
          <div class="gw-feedback-head">
            <span>${escapeHtml(heading)}</span>
            <span class="gw-anchor-mic-host">
              <select id="gw-feedback-mic-lang" class="gw-mic-lang">
                <option value="nb-NO">🇳🇴 Norsk</option>
                <option value="en-US">🇬🇧 English</option>
              </select>
              <button type="button" id="gw-feedback-mic" class="gw-mic-btn" title="${escapeHtml(micTooltip)}">🎤</button>
              <span class="gw-mic-status" id="gw-feedback-mic-status"></span>
            </span>
          </div>
          <textarea id="gw-feedback-input" rows="3" placeholder="${escapeHtml(placeholder)}">${escapeHtml(ui.feedbackInput)}</textarea>

          <div class="gw-feedback-chips">
            ${chips}
          </div>

          <div class="gw-feedback-actions">
            <button type="button" class="linkbtn" id="gw-feedback-cancel">Avbryt</button>
            <div class="spacer"></div>
            <button type="button" class="primary" id="gw-feedback-send" title="Cmd+Enter">${escapeHtml(sendLabel)}</button>
          </div>
        </div>
      `;
    }

    const draft = lastDraftTurn();
    const lastTurn = ui.conversation[ui.conversation.length - 1];
    const lastIsAnswer = lastTurn?.role === "model" && lastTurn?.type === "answer";

    // Tilpasset hjelpetekst basert på kontekst
    let helpText;
    if (!draft) {
      helpText = "Ingen utkast å lagre ennå.";
    } else if (lastIsAnswer) {
      helpText = "Spør videre, forbedre utkastet, eller lagre siste utkast.";
    } else {
      helpText = "Liker du den?";
    }

    return `
      <div class="gw-conv-actions">
        <span class="muted small">${escapeHtml(helpText)}</span>
        <button type="button" class="linkbtn" id="gw-copy">Kopier</button>
        <button type="button" class="linkbtn" id="gw-show-prompt">Vis prompt</button>
        <div class="spacer"></div>
        <button type="button" class="secondary" id="gw-ask">? Spør</button>
        <button type="button" class="secondary" id="gw-iterate">↻ Forbedre</button>
        ${draft ? `
          <button type="button" class="linkbtn" id="gw-save-draft" title="Lagre siste utkast som Draft">Lagre som Draft</button>
          <button type="button" class="primary" id="gw-save-ready" title="Lagre siste utkast til Pipeline (Klar)">Lagre til Pipeline (Klar)</button>
        ` : ""}
      </div>
    `;
  }

  function bindConvEvents() {
    // Auto-resize alle samtale-tekstbokser til innholdet
    document.querySelectorAll(".gw-conv-model-text").forEach(autoSizeTextarea);

    // Editerbart siste DRAFT-tekstområde (ikke answer-turns)
    const lastTextarea = document.querySelector(".gw-conv-card.is-last .gw-conv-model-text");
    if (lastTextarea) {
      lastTextarea.addEventListener("input", e => {
        const draft = lastDraftTurn();
        if (draft) draft.text = e.target.value;
        ui.output = e.target.value;
        updateWordCount();
        saveDraftSoon();
        autoSizeTextarea(lastTextarea);
        // Debounce auto-Pipeline-update så vi ikke spammer på hvert tastetrykk
        scheduleAutoDraftUpdate();
      });
    }

    // Action-knapper (kun synlige når ikke busy og har siste turn)
    $("#gw-iterate")?.addEventListener("click", () => {
      ui.feedbackInProgress = true;
      ui.feedbackMode = "iterate";
      ui.feedbackInput = "";
      renderAll();
      setTimeout(() => $("#gw-feedback-input")?.focus(), 50);
    });
    $("#gw-ask")?.addEventListener("click", () => {
      ui.feedbackInProgress = true;
      ui.feedbackMode = "ask";
      ui.feedbackInput = "";
      renderAll();
      setTimeout(() => $("#gw-feedback-input")?.focus(), 50);
    });
    $("#gw-save-draft")?.addEventListener("click", () => savePost("draft"));
    $("#gw-save-ready")?.addEventListener("click", () => savePost("ready"));
    $("#gw-copy")?.addEventListener("click", onCopy);
    $("#gw-show-prompt")?.addEventListener("click", togglePromptPreview);

    // Cancel-knapp i busy-card
    $("#gw-cancel")?.addEventListener("click", onCancel);

    // Ny samtale — forkast samtale-state, men auto-Draft i Pipeline beholdes
    $("#gw-conv-new")?.addEventListener("click", () => {
      const hasAutoDraft = ui.autoDraftPostId && window.ContentBrain?.hasPost?.(ui.autoDraftPostId);
      const msg = hasAutoDraft
        ? "Starte ny samtale?\n\nNåværende utkast er allerede auto-lagret som Draft i Pipeline og blir bevart der. Du kan finne det igjen senere."
        : "Forkaste denne samtalen og starte ny? Det er ingen auto-Draft i Pipeline ennå.";
      if (!confirm(msg)) return;
      clearConversation();
      try { localStorage.removeItem("ghostwriter.draft"); } catch (e) {}
      renderAll();
    });

    // Feedback-flyt
    if (ui.feedbackInProgress) {
      $("#gw-feedback-input")?.addEventListener("input", e => {
        ui.feedbackInput = e.target.value;
      });
      $("#gw-feedback-cancel")?.addEventListener("click", () => {
        ui.feedbackInProgress = false;
        ui.feedbackInput = "";
        renderAll();
      });
      $("#gw-feedback-send")?.addEventListener("click", onIterate);
      // Quick chips
      document.querySelectorAll(".gw-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          const text = chip.dataset.chip;
          ui.feedbackInput = ui.feedbackInput
            ? ui.feedbackInput.trim() + ", " + text
            : text;
          $("#gw-feedback-input").value = ui.feedbackInput;
          $("#gw-feedback-input").focus();
        });
      });
      // Mic for feedback
      setupFeedbackMic();
    }
  }

  // ----------------------------- word count -----------------------------

  /**
   * Tell ord i output, vis live + farge mot mål-rekkevidden.
   * grønn = i mål, oransje = under, rød = over (>+15%).
   */
  function updateWordCount() {
    const el = document.querySelector("#gw-word-count");
    if (!el) return;
    const text = (ui.output || "").trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const lengthInfo = LENGTH_PRESETS[ui.lengthKey] || LENGTH_PRESETS.standard;

    // Parse "150-250 words" → [150, 250]
    const m = lengthInfo.wordRange.match(/(\d+)\s*-\s*(\d+)/);
    const min = m ? +m[1] : 0;
    const max = m ? +m[2] : Infinity;
    const overTolerance = max * 1.15;

    let cls, hint;
    if (words === 0) {
      cls = "muted"; hint = "—";
    } else if (words < min) {
      cls = "warn"; hint = `${min - words} for kort`;
    } else if (words <= max) {
      cls = "ok"; hint = "i mål";
    } else if (words <= overTolerance) {
      cls = "warn"; hint = `${words - max} for langt`;
    } else {
      cls = "err"; hint = `${words - max} for langt`;
    }

    el.className = `gw-word-count ${cls}`;
    el.textContent = `${words} ord (mål: ${lengthInfo.wordRange.replace(" words", "")}) · ${hint}`;
  }

  // ----------------------------- generate -----------------------------

  async function onGenerate() {
    if (ui.busy) return;

    // Validering avhengig av modus
    if (ui.composeMode === "standard") {
      if (!ui.anchor.trim()) {
        alert("Skriv et anker først — modellen trenger noe konkret å bygge på.");
        return;
      }
    } else if (ui.composeMode === "article-reaction") {
      const hasText = ui.articleText.trim().length > 0;
      const hasUrl = ui.articleUrl.trim().length > 0;

      if (!hasText && !hasUrl) {
        alert("Lim inn artikkel-tekst eller URL.");
        return;
      }

      // URL-only krever Gemini (url_context). Ollama kan ikke fetche URL-er.
      if (!hasText && hasUrl && ui.provider !== "gemini") {
        alert("URL-fetching krever Gemini-provider. Bytt provider, eller lim inn artikkel-teksten manuelt.");
        return;
      }

      if (hasText && ui.articleText.trim().length < 100) {
        alert("Artikkel-teksten ser veldig kort ut. Lim inn mer, eller la feltet stå tomt og bruk URL hvis du er på Gemini.");
        return;
      }
    }

    const env = checkEnvironment();
    if (!env.ok) {
      alert(env.message);
      return;
    }

    const profile = voiceProfile.getProfile();
    const posts = window.ContentBrain.getState().posts;
    const examples = selectExamples({ posts, pillar: ui.pillar, voiceProfile: profile, max: 3 });

    const system = buildSystemPrompt({
      voiceProfile: profile,
      pillar: ui.pillar,
      examples,
      lengthKey: ui.lengthKey,
      toneValue: getCurrentToneValue(),
    });
    const user = buildInitialUserPrompt();

    // Ny generering = nullstill samtale først, så append første user-turn
    clearConversation();

    // Lag et lesbart resymé av Compose-feltene som første user-turn-tekst
    // (Den faktiske prompten som sendes er user-variabelen — turn-teksten er kun til UI)
    const userTurnSummary = ui.composeMode === "article-reaction"
      ? `📰 Article reaction · Pilar ${ui.pillar} · ${LENGTH_PRESETS[ui.lengthKey].label}\n\n${ui.articleUrl ? `URL: ${ui.articleUrl}\n` : ""}${ui.articleText ? `Tekst: ${ui.articleText.slice(0, 200)}${ui.articleText.length > 200 ? "…" : ""}\n` : ""}Vinkel: ${ui.articleAngle || "(ingen)"}`
      : `Pilar ${ui.pillar} · ${LENGTH_PRESETS[ui.lengthKey].label}\n\nAnker: ${ui.anchor}${ui.idea ? `\n\nRefleksjon: ${ui.idea}` : ""}`;
    addUserTurn(userTurnSummary);

    ui.lastSystemPrompt = system;
    ui.lastUserPrompt = user;
    ui.busy = true;
    renderAll();

    ui.abortController = new AbortController();
    startElapsedTimer();

    try {
      const lengthInfo = LENGTH_PRESETS[ui.lengthKey];

      // Bruk url_context hvis dette er en article-reaction uten paste-tekst
      // (kun støttet på Gemini — UI-validering har allerede stoppet andre kombinasjoner)
      const useUrlContext =
        ui.composeMode === "article-reaction"
        && !ui.articleText.trim()
        && !!ui.articleUrl.trim()
        && ui.provider === "gemini";

      const result = await api.generate({
        provider: ui.provider,
        model: ui.model,
        system,
        prompt: user,
        options: { temperature: 0.5, num_predict: lengthInfo.numPredict },
        signal: ui.abortController.signal,
        useUrlContext,
      });
      addModelTurn(result.text, result.meta);
      ui.lastMeta = result.meta;
      saveDraftSoon();
      autoSaveDraftToPipeline();   // beskytt mot datatap
    } catch (e) {
      if (e.name === "AbortError") {
        // brukeren klikket Avbryt — fjern user-turn-en så Compose-feltene fortsatt kan brukes
        if (ui.conversation[ui.conversation.length - 1]?.role === "user") {
          ui.conversation.pop();
        }
      } else {
        alert("Generering feilet: " + e.message);
        if (ui.conversation[ui.conversation.length - 1]?.role === "user") {
          ui.conversation.pop();
        }
      }
    } finally {
      ui.busy = false;
      ui.abortController = null;
      stopElapsedTimer();
      renderAll();
    }
  }

  /**
   * Forbedre/Spør-flyt: bruker har gitt tilbakemelding eller spørsmål.
   * Vi appender user-turn til samtalen og kjører multi-turn API-kall.
   *
   * - "iterate"-modus: modellen genererer et NYTT utkast som erstatter siste draft
   * - "ask"-modus: modellen SVARER på spørsmålet, draft-turn endres ikke
   */
  async function onIterate() {
    if (ui.busy) return;
    const feedback = (ui.feedbackInput || "").trim();
    const mode = ui.feedbackMode || "iterate";
    if (!feedback) {
      alert(mode === "ask" ? "Skriv eller dikter inn et spørsmål først." : "Skriv eller dikter inn en forbedring først.");
      return;
    }
    if (ui.conversation.length === 0) {
      alert("Ingen samtale å iterere på. Generer et utkast først.");
      return;
    }

    const env = checkEnvironment();
    if (!env.ok) {
      alert(env.message);
      return;
    }

    // Append user-turn med riktig type
    const userType = mode === "ask" ? "ask" : "iterate";
    addUserTurn(feedback, userType);

    ui.feedbackInput = "";
    ui.feedbackInProgress = false;
    ui.busy = true;
    renderAll();

    ui.abortController = new AbortController();
    startElapsedTimer();

    try {
      // Bygg system-prompt på nytt (kan ha endret seg om voice profile er oppdatert)
      const profile = voiceProfile.getProfile();
      const posts = window.ContentBrain.getState().posts;
      const examples = selectExamples({ posts, pillar: ui.pillar, voiceProfile: profile, max: 3 });
      let system = buildSystemPrompt({
        voiceProfile: profile,
        pillar: ui.pillar,
        examples,
        lengthKey: ui.lengthKey,
        toneValue: getCurrentToneValue(),
      });

      // Per-turn-markører settes i buildConversationMessages — ingen
      // ekstra system-prompt-addendum trengs. Det unngår motsetninger
      // når samtalen blander iterate og ask.

      // Bygg messages-array
      const initialUserPrompt = buildInitialUserPrompt();
      const messages = buildConversationMessages(initialUserPrompt);

      ui.lastSystemPrompt = system;
      ui.lastUserPrompt = feedback;

      const lengthInfo = LENGTH_PRESETS[ui.lengthKey];
      // Ask-modus skal ikke generere langt — kortere svar er bedre
      const numPredict = mode === "ask" ? 600 : lengthInfo.numPredict;
      const useUrlContext =
        ui.composeMode === "article-reaction"
        && !ui.articleText.trim()
        && !!ui.articleUrl.trim()
        && ui.provider === "gemini";

      const result = await api.generate({
        provider: ui.provider,
        model: ui.model,
        system,
        messages,
        options: { temperature: mode === "ask" ? 0.3 : 0.5, num_predict: numPredict },
        signal: ui.abortController.signal,
        useUrlContext,
      });

      const modelType = mode === "ask" ? "answer" : "draft";
      addModelTurn(result.text, result.meta, modelType);
      ui.lastMeta = result.meta;
      saveDraftSoon();
      // Bare auto-save når det er en NY draft (ikke ved Spør-svar)
      if (modelType === "draft") autoSaveDraftToPipeline();
    } catch (e) {
      if (e.name === "AbortError") {
        // brukeren avbrøt — fjern siste user-turn
        if (ui.conversation[ui.conversation.length - 1]?.role === "user") {
          ui.conversation.pop();
        }
      } else {
        const verb = mode === "ask" ? "Spørsmål" : "Forbedring";
        alert(`${verb} feilet: ${e.message}`);
      }
    } finally {
      ui.busy = false;
      ui.abortController = null;
      stopElapsedTimer();
      renderAll();
    }
  }

  /**
   * Bygg den initielle user-prompten basert på Compose-feltene.
   * Brukes når vi sender hele samtale-historikken til API — første turn
   * må være den fulle prompten, ikke bare et resymé.
   */
  function buildInitialUserPrompt() {
    if (ui.composeMode === "article-reaction") {
      return prompts.buildArticleReactionUserPrompt({
        articleText: ui.articleText,
        articleUrl: ui.articleUrl,
        angle: ui.articleAngle,
        pillar: ui.pillar,
        lengthKey: ui.lengthKey,
      });
    }
    return buildUserPrompt({
      anchor: ui.anchor,
      idea: ui.idea,
      pillar: ui.pillar,
      lengthKey: ui.lengthKey,
    });
  }

  async function onRegenerate() {
    const instruction = $("#gw-instruction").value.trim();
    if (!instruction) {
      alert("Skriv en instruks først (f.eks. 'kortere', 'mer personlig').");
      return;
    }
    if (!ui.output.trim()) {
      alert("Ingen tidligere output å regenerere fra.");
      return;
    }

    const env = checkEnvironment();
    if (!env.ok) {
      alert(env.message);
      return;
    }

    const profile = voiceProfile.getProfile();
    const posts = window.ContentBrain.getState().posts;
    const examples = selectExamples({ posts, pillar: ui.pillar, voiceProfile: profile, max: 3 });

    const system = buildSystemPrompt({
      voiceProfile: profile,
      pillar: ui.pillar,
      examples,
      lengthKey: ui.lengthKey,
      toneValue: getCurrentToneValue(),
    });
    const user = buildRegeneratePrompt({
      previousDraft: ui.output,
      instruction,
      pillar: ui.pillar,
      lengthKey: ui.lengthKey,
    });

    ui.lastSystemPrompt = system;
    ui.lastUserPrompt = user;
    ui.busy = true;
    renderAll();

    ui.abortController = new AbortController();
    startElapsedTimer();

    try {
      const lengthInfo = LENGTH_PRESETS[ui.lengthKey];
      const result = await api.generate({
        provider: ui.provider,
        model: ui.model,
        system,
        prompt: user,
        options: { temperature: 0.5, num_predict: lengthInfo.numPredict },
        signal: ui.abortController.signal,
      });
      ui.output = result.text;
      ui.lastGenerated = result.text;     // ny baseline for edit-feedback-loop
      ui.lastMeta = result.meta;
      saveDraftSoon();
    } catch (e) {
      if (e.name === "AbortError") {
        // brukeren klikket Avbryt — ingen alert
      } else {
        alert("Regenerering feilet: " + e.message);
      }
    } finally {
      ui.busy = false;
      ui.abortController = null;
      stopElapsedTimer();
      renderAll();
    }
  }

  // ----------------------------- save / copy / prompt preview -----------------------------

  function onCopy() {
    if (!ui.output) return;
    navigator.clipboard.writeText(ui.output).then(() => {
      const btn = $("#gw-copy");
      const original = btn.textContent;
      btn.textContent = "✓ Kopiert";
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  }

  function togglePromptPreview() {
    const el = $("#gw-prompt-preview");
    if (el.hidden) {
      el.hidden = false;
      el.innerHTML = `
        <div class="gw-prompt-head">
          <h4>System prompt</h4>
          <button type="button" class="linkbtn" data-copy="system">Kopier</button>
        </div>
        <pre id="gw-prompt-system">${escapeHtml(ui.lastSystemPrompt)}</pre>
        <div class="gw-prompt-head">
          <h4>User prompt</h4>
          <button type="button" class="linkbtn" data-copy="user">Kopier</button>
        </div>
        <pre id="gw-prompt-user">${escapeHtml(ui.lastUserPrompt)}</pre>
      `;
      // Bind kopier-knapper
      el.querySelectorAll("[data-copy]").forEach(btn => {
        btn.addEventListener("click", () => {
          const text = btn.dataset.copy === "system" ? ui.lastSystemPrompt : ui.lastUserPrompt;
          navigator.clipboard.writeText(text).then(() => {
            const original = btn.textContent;
            btn.textContent = "✓ Kopiert";
            setTimeout(() => { btn.textContent = original; }, 1500);
          });
        });
      });
    } else {
      el.hidden = true;
    }
  }

  function savePost(status) {
    // Bruk siste model-turn sin tekst (kan være inline-edited av brukeren)
    const lastModel = lastModelTurn();
    const finalText = (lastModel?.text || ui.output || "").trim();
    if (!finalText) {
      alert("Ingen tekst å lagre.");
      return;
    }
    ui.output = finalText;
    const cb = window.ContentBrain;
    if (!cb || !cb.addPost) {
      alert("ContentBrain-interface ikke tilgjengelig.");
      return;
    }
    const firstLine = ui.output.split("\n").find(l => l.trim()) || "Ghostwriter draft";
    const title = firstLine.slice(0, 80) + (firstLine.length > 80 ? "…" : "");

    // Edit-feedback-loop: spore diff mellom generert og brukerens endelige versjon.
    // Bare hvis vi har lastGenerated (post er resultat av generering, ikke manuell skriving)
    // og brukeren faktisk har gjort en substansiell endring.
    let editHistory = null;
    if (editTracker && ui.lastGenerated && ui.output !== ui.lastGenerated) {
      try {
        editTracker.recordEdit({
          generated: ui.lastGenerated,
          edited: ui.output,
          pillar: ui.pillar,
          model: ui.model,
          postId: null, // settes etter addPost hvis vi vil
        });
        editHistory = {
          generated: ui.lastGenerated,
          timestamp: new Date().toISOString(),
          model: ui.model,
        };
      } catch (e) {
        console.warn("editTracker.recordEdit feilet:", e);
      }
    }

    const isArticleReaction = ui.composeMode === "article-reaction";
    const sourceField = isArticleReaction
      ? (ui.articleUrl.trim() || "ghostwriter (article reaction)")
      : "ghostwriter";
    const noteField = isArticleReaction
      ? `Article reaction. Angle: ${ui.articleAngle.slice(0, 200)}\nArticle excerpt: ${ui.articleText.slice(0, 300)}…`
      : `Anchor: ${ui.anchor.slice(0, 200)}`;

    let postId;
    // Hvis vi har en auto-Draft i Pipeline allerede: oppdater den i stedet
    // for å lage duplikat. Promoter til ønsket status (klar/draft).
    if (ui.autoDraftPostId && cb.hasPost && cb.hasPost(ui.autoDraftPostId) && cb.updatePost) {
      cb.updatePost(ui.autoDraftPostId, {
        title,
        body: finalText,
        pillar: ui.pillar,
        status,
        source: sourceField,
        notes: noteField,
        editHistory,
      });
      postId = ui.autoDraftPostId;
    } else {
      // Fallback: opprett ny post
      postId = cb.addPost({
        title,
        body: finalText,
        pillar: ui.pillar,
        status,
        source: sourceField,
        notes: noteField,
        capturedAt: new Date().toISOString(),
        editHistory,
      });
    }

    // Tøm Compose + samtalen etter lagring så form-en er klar for neste idé
    ui.anchor = "";
    ui.idea = "";
    ui.articleText = "";
    ui.articleUrl = "";
    ui.articleAngle = "";
    clearConversation();
    try { localStorage.removeItem("ghostwriter.draft"); } catch (e) {}
    renderAll();

    const editNote = editHistory ? " (din edit lagret for læring)" : "";
    alert(`Lagret til Pipeline som "${status === "ready" ? "Klar" : "Draft"}"${editNote}.`);
  }

  // ----------------------------- pipeline → ghostwriter ("Generer utkast" fra et eksisterende kort) -----------------------------

  function loadFromPipeline(post) {
    if (!post) return;
    ui.pillar = post.pillar || 1;
    ui.output = "";
    ui.lastGenerated = "";

    // Smart routing: hvis source er en URL, åpne i article-reaction-modus
    const sourceLooksLikeUrl = post.source && /^https?:\/\//i.test(post.source.trim());
    if (sourceLooksLikeUrl) {
      ui.composeMode = "article-reaction";
      ui.articleUrl = post.source.trim();
      ui.articleAngle = post.body || post.title || "";
      ui.articleText = "";   // Michel må selv lime inn artikkel-tekst
      ui.anchor = "";
      ui.idea = "";
    } else {
      ui.composeMode = "standard";
      ui.anchor = post.body || post.title || "";
      ui.idea = "";
      ui.articleText = "";
      ui.articleUrl = "";
      ui.articleAngle = "";
    }

    saveUiState();
    renderAll();
    const hint = $("#gw-from-pipeline-hint");
    if (hint) {
      hint.textContent = sourceLooksLikeUrl
        ? `Lastet fra Pipeline (article reaction): "${(post.title || "").slice(0, 50)}"`
        : `Lastet fra Pipeline: "${(post.title || "").slice(0, 60)}"`;
    }
  }

  // ----------------------------- root render -----------------------------

  function renderAll() {
    const root = document.querySelector("#ghostwriter");
    if (!root) return;

    let topbar = root.querySelector(".gw-topbar-host");
    let drawer = root.querySelector(".gw-drawer-host");
    let compose = root.querySelector(".gw-compose-host");
    let output = root.querySelector(".gw-output-host");

    if (!topbar) {
      root.innerHTML = `
        <div class="panel-head">
          <h2>Ghostwriter</h2>
          <p class="muted">Idé → utkast i din stemme. Provider: lokal Ollama (gratis).</p>
        </div>
        <div class="gw-topbar-host"></div>
        <div class="gw-drawer-host"></div>
        <div class="gw-compose-host"></div>
        <div class="gw-output-host"></div>
      `;
      topbar = root.querySelector(".gw-topbar-host");
      drawer = root.querySelector(".gw-drawer-host");
      compose = root.querySelector(".gw-compose-host");
      output = root.querySelector(".gw-output-host");
    }

    renderTopBar(topbar);
    renderVoiceProfileDrawer(drawer);
    renderCompose(compose);
    renderOutput(output);
  }

  // ----------------------------- init -----------------------------

  function init() {
    loadUiState();
    loadDraft();
    renderAll();
    setupKeyboardShortcuts();
    setupBeforeUnloadGuard();
    setupRateLimitFeedback();
  }

  // ----------------------------- rate limit auto-retry feedback -----------------------------

  /**
   * Lytt på rate-limit-events fra api.js og vis tydelig nedteller-status
   * mens vi venter på at Gemini skal slippe oss inn igjen.
   */
  let rateLimitListenersBound = false;
  function setupRateLimitFeedback() {
    if (rateLimitListenersBound) return;
    rateLimitListenersBound = true;

    window.addEventListener("ghostwriter:rate-limited", (e) => {
      const { model, retrySeconds } = e.detail || {};
      console.info(`[Ghostwriter] Rate-limited på ${model}. Auto-retry om ${retrySeconds}s.`);
      // Vise i elapsed-time-feltet hvis det er aktivt
      const el = document.querySelector("#gw-elapsed");
      if (el) el.textContent = `⏳ rate-limited, prøver igjen om ${Math.ceil(retrySeconds)}s`;
    });

    window.addEventListener("ghostwriter:rate-limit-tick", (e) => {
      const remaining = Math.ceil((e.detail?.remainingMs || 0) / 1000);
      const el = document.querySelector("#gw-elapsed");
      if (el && remaining > 0) {
        el.textContent = `⏳ rate-limited, prøver igjen om ${remaining}s`;
      }
    });

    window.addEventListener("ghostwriter:rate-limit-resolved", () => {
      console.info("[Ghostwriter] Rate-limit ferdig, prøver igjen.");
      const el = document.querySelector("#gw-elapsed");
      if (el) el.textContent = "0.0s";   // restart elapsed-timer
      elapsedStart = Date.now();
    });
  }

  // ----------------------------- beforeunload guard -----------------------------

  /**
   * Backstop: hvis brukeren prøver å lukke fanen midt i en samtale med
   * en ferskt-redigert draft som ikke er auto-lagret enda, vis browser-
   * advarsel. Auto-save-til-Pipeline løser de fleste tilfeller, men
   * dette er ekstra forsikring mot edge cases.
   */
  let beforeUnloadBound = false;
  function setupBeforeUnloadGuard() {
    if (beforeUnloadBound) return;
    beforeUnloadBound = true;

    window.addEventListener("beforeunload", (e) => {
      // Bare advar hvis det finnes en draft som ikke er auto-lagret
      // (sjekker timestamp-forskjell mellom siste edit og auto-save)
      const draft = lastDraftTurn();
      if (!draft) return;
      // Hvis ingen auto-draft i Pipeline, advar — vi kan miste alt
      if (!ui.autoDraftPostId) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    });
  }

  // ----------------------------- keyboard shortcuts -----------------------------

  let shortcutsBound = false;
  function setupKeyboardShortcuts() {
    if (shortcutsBound) return;
    shortcutsBound = true;

    document.addEventListener("keydown", (e) => {
      // Bare aktiv når Ghostwriter-tab er synlig
      const ghostwriterActive = document.querySelector("#ghostwriter")?.classList.contains("active");
      if (!ghostwriterActive) return;

      // Cmd+Enter (Mac) eller Ctrl+Enter — kontekst-avhengig
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (ui.busy) return;
        if (ui.feedbackInProgress) {
          onIterate();             // Forbedre-flyt aktiv → send forbedring
        } else {
          onGenerate();             // Ellers → ny generering
        }
        return;
      }

      // Esc — lukk Voice Profile eller avbryt feedback-flyt
      if (e.key === "Escape") {
        if (ui.feedbackInProgress) {
          e.preventDefault();
          ui.feedbackInProgress = false;
          ui.feedbackInput = "";
          renderAll();
          return;
        }
        if (ui.voiceProfileExpanded) {
          e.preventDefault();
          ui.voiceProfileExpanded = false;
          renderAll();
          return;
        }
      }
    });
  }

  // ----------------------------- export -----------------------------

  window.Ghostwriter = window.Ghostwriter || {};
  window.Ghostwriter.init = init;
  window.Ghostwriter.loadFromPipeline = loadFromPipeline;
  // Eksponer generic mic-setup så Capture-tab og andre kan bruke den
  window.Ghostwriter.setupMic = setupMicGeneric;
  // Eksponert for testing — ren funksjon, lett å verifisere
  window.Ghostwriter.buildConversationMessages = buildConversationMessages;
})();
