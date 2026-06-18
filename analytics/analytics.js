/* =====================================================================
   Content Brain — analytics/analytics.js
   Orchestrator. Eier Analytics-tab og koordinerer parser/store/
   classifier/dashboard. Initialiseres når Analytics-tab aktiveres.

   Wiring fra app.js:
     activateTab("analytics") → Analytics.init()
   ===================================================================== */

(function () {
  "use strict";

  let initialized = false;
  let state = null;

  // Lokal UI-state. Persisteres i localStorage så valg overlever reload.
  const UI_STATE_KEY = "contentBrain.analytics.ui";
  const defaultUi = () => ({
    metric: "weightedEngagements", // weightedEngagements | weightedRate | impressions | engagements | profileViews | likes | comments
    topN: 10,
    catFilter: null,             // null | "peer" | "recruiter" | "board" | "prospect" | "other"
    subTab: "overview",          // overview | engagers | patterns | metrics | import
    metricsFilter: "missing",    // all | missing | has
    metricsSort: "date-desc",
    dateRange: "all",            // 7d | 30d | 90d | 365d | all
    collapsedCards: {},          // { "cardId": true|false }
    dismissedInsights: {},       // { "insightKey": true } — så de ikke kommer tilbake i samme måned
  });
  let ui = defaultUi();
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (raw) Object.assign(ui, JSON.parse(raw));
  } catch (e) {}
  function saveUi() {
    try { localStorage.setItem(UI_STATE_KEY, JSON.stringify(ui)); } catch (e) {}
  }

  function filterByDateRange(metrics) {
    if (!ui.dateRange || ui.dateRange === "all") return metrics;
    const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[ui.dateRange];
    if (!days) return metrics;
    const cutoff = Date.now() - days * 86400000;
    return metrics.filter(m => {
      if (!m.date) return true;
      return new Date(m.date).getTime() >= cutoff;
    });
  }

  function getStores() {
    return {
      parser: window.AnalyticsParser,
      store: window.AnalyticsStore,
      classifier: window.AnalyticsClassifier,
      dashboard: window.AnalyticsDashboard,
      cb: window.ContentBrain,
    };
  }

  // ---------- init ----------

  function init() {
    if (!document.getElementById("analytics")) return;
    if (!initialized) {
      const { store } = getStores();
      state = store.load();
      initialized = true;
    }
    // Sync hver gang fanen åpnes: idempotent, billig, og fanger nye
    // Pipeline-poster som har blitt published siden sist.
    syncPipelinePublishedToMetrics();
    renderShell();
  }

  function syncPipelinePublishedToMetrics(opts) {
    const { silent = false, rerender = false } = opts || {};
    const { store, parser, cb } = getStores();
    if (!store || typeof store.syncPublishedPostsToMetrics !== "function") return { added: 0 };
    if (!parser || !cb || typeof cb.getState !== "function") return { added: 0 };

    // Lazy-load state hvis Analytics-fanen aldri har vært åpnet i denne
    // sesjonen. Dette lar live-hook fra app.js virke uten å først aktivere
    // fanen. Vi flipper IKKE initialized — bare init() gjør det.
    let workingState = state;
    if (!workingState) workingState = store.load();

    const result = store.syncPublishedPostsToMetrics(workingState, cb.getState, parser);
    if (result.added > 0) {
      store.save(workingState);
      // Behold lokal state-ref hvis vi nettopp lazy-lastet, så ikke senere
      // init() overskriver med en stale kopi (store.save har riktignok
      // persistert til localStorage, men dette holder in-memory konsistent).
      state = workingState;
      if (!silent) {
        console.log("[analytics] Synket " + result.added + " published Pipeline-post(s) til metrikker.");
      }
      // Re-render hvis Analytics-fanen er aktiv (live-hook tilfellet)
      if (rerender) {
        const panel = document.getElementById("analytics");
        if (panel && panel.classList.contains("active")) {
          renderShell();
        }
      }
    }
    return result;
  }

  // ---------- shell ----------

  function renderShell() {
    const panel = document.getElementById("analytics");
    if (!panel) return;

    panel.innerHTML = `
      <div class="panel-head">
        <h2>📊 Analytics</h2>
        <p class="muted">LinkedIn-eksport → mønstre over tid. Importér Shares.csv og Connections.csv fra LinkedIns dataeksport.</p>
      </div>

      <nav class="analytics-subtabs" role="tablist">
        <button class="subtab" data-sub="overview" role="tab">Oversikt</button>
        <button class="subtab" data-sub="engagers" role="tab">Engagers</button>
        <button class="subtab" data-sub="patterns" role="tab">Mønstre</button>
        <button class="subtab" data-sub="metrics" role="tab">✏️ Metrikker</button>
        <button class="subtab" data-sub="import" role="tab">Importér</button>
      </nav>

      <div id="analytics-insights" class="analytics-insights"></div>

      <div class="analytics-post-modal" id="analytics-post-modal" hidden>
        <div class="analytics-post-modal-backdrop" id="analytics-post-modal-backdrop"></div>
        <div class="analytics-post-modal-card" role="dialog" aria-modal="true">
          <button class="analytics-post-modal-close" id="analytics-post-modal-close" aria-label="Lukk">×</button>
          <div id="analytics-post-modal-content"></div>
        </div>
      </div>

      <div class="analytics-body">
        <section class="analytics-sub" data-sub="overview">
          <div class="analytics-toolbar">
            <label>
              <span>Metric</span>
              <select id="analytics-metric">
                <option value="weightedEngagements">Score (vektet)</option>
                <option value="weightedRate">Resonans (rate)</option>
                <option value="impressions">Visninger (reach)</option>
                <option value="engagements">Engasjement (sum)</option>
                <option value="profileViews">Profilvisninger</option>
                <option value="followersGained">Nye følgere</option>
                <option value="likes">Likes</option>
                <option value="comments">Kommentarer</option>
              </select>
            </label>
            <label>
              <span>Periode</span>
              <select id="analytics-date-range">
                <option value="7d">Siste 7 dager</option>
                <option value="30d">Siste 30 dager</option>
                <option value="90d">Siste 90 dager</option>
                <option value="365d">I år (365 dager)</option>
                <option value="all">Alt</option>
              </select>
            </label>
            <button class="linkbtn" id="analytics-link-pipeline" title="Match metrics mot Pipeline-poster så pilar-info propagerer">🔗 Link til Pipeline</button>
            <span class="muted small" id="analytics-summary"></span>
          </div>

          <div class="analytics-card" data-card-id="top-posts">
            <h3 class="analytics-card-head" data-card-toggle="top-posts">
              <span class="analytics-card-chevron">▾</span> Topp innlegg
            </h3>
            <div class="analytics-card-body">
              <div id="analytics-chart-engagement"></div>
            </div>
          </div>

          <div class="analytics-card" data-card-id="reach-resonance">
            <h3 class="analytics-card-head" data-card-toggle="reach-resonance">
              <span class="analytics-card-chevron">▾</span> Reach × resonans
            </h3>
            <div class="analytics-card-body">
              <p class="muted small">Hvert innlegg plottet på reach (visninger) mot resonans (vektet rate). Boblestørrelse = vektet score. Median-linjene deler i fire: virale utbrudd havner nede til høyre, tette nettverks-treff oppe til venstre.</p>
              <div id="analytics-chart-reachres"></div>
            </div>
          </div>

          <div class="analytics-card" data-card-id="trend">
            <h3 class="analytics-card-head" data-card-toggle="trend">
              <span class="analytics-card-chevron">▾</span> Trend over tid
            </h3>
            <div class="analytics-card-body">
              <div id="analytics-chart-trend"></div>
            </div>
          </div>

          <div class="analytics-card" data-card-id="pillar">
            <h3 class="analytics-card-head" data-card-toggle="pillar">
              <span class="analytics-card-chevron">▾</span> Per pilar (snitt)
            </h3>
            <div class="analytics-card-body">
              <div id="analytics-chart-pillar"></div>
            </div>
          </div>
        </section>

        <section class="analytics-sub" data-sub="engagers" hidden>
          <div class="analytics-toolbar">
            <div class="chips" id="analytics-cat-filter">
              <button class="chip active" data-cat="all">Alle</button>
              <button class="chip" data-cat="peer">Peers</button>
              <button class="chip" data-cat="recruiter">Hodejegere</button>
              <button class="chip" data-cat="board">Styre</button>
              <button class="chip" data-cat="prospect">Prospects</button>
              <button class="chip" data-cat="other">Andre</button>
            </div>
            <span class="muted small" id="analytics-cat-summary"></span>
          </div>

          <div class="analytics-cat-grid" id="analytics-cat-summary-grid"></div>

          <div class="analytics-card" data-card-id="growth">
            <h3 class="analytics-card-head" data-card-toggle="growth">
              <span class="analytics-card-chevron">▾</span> Nettverkets vekst
            </h3>
            <div class="analytics-card-body">
              <p class="muted small">Kumulativ connections-vekst per måned. Stolpene viser nye per måned, linjen totalen.</p>
              <div id="analytics-chart-growth"></div>
            </div>
          </div>

          <div class="analytics-card" data-card-id="connections-table">
            <h3 class="analytics-card-head" data-card-toggle="connections-table">
              <span class="analytics-card-chevron">▾</span> Connections
            </h3>
            <div class="analytics-card-body">
              <div id="analytics-table-engagers"></div>
            </div>
          </div>
        </section>

        <section class="analytics-sub" data-sub="patterns" hidden>
          <div class="analytics-card" data-card-id="heatmap">
            <h3 class="analytics-card-head" data-card-toggle="heatmap">
              <span class="analytics-card-chevron">▾</span> Posting-mønster (ukedag × time)
            </h3>
            <div class="analytics-card-body">
              <p class="muted small">Snitt engasjement basert på når innlegget ble publisert. Mørk = sterkere.</p>
              <div id="analytics-heatmap"></div>
            </div>
          </div>
        </section>

        <section class="analytics-sub" data-sub="metrics" hidden>
          <div class="analytics-card" data-card-id="metrics-entry">
            <h3 class="analytics-card-head" data-card-toggle="metrics-entry">
              <span class="analytics-card-chevron">▾</span> Manuell metric-entry
            </h3>
            <p class="muted small">
              LinkedIns standard dataeksport gir <strong>ikke</strong> per-post metrikker.
              For å få analytics-data, klikk på et innlegg på LinkedIn → se "Impressions", "Reactions", "Comments" i analytics-panelet → tast tallene inn her.
              Endringer lagres automatisk når du forlater feltet. Bruk filteret nedenfor for å fokusere på de som mangler tall.
            </p>
            <div class="analytics-toolbar">
              <label>
                <span>Filter</span>
                <select id="analytics-metrics-filter">
                  <option value="all">Alle innlegg</option>
                  <option value="missing">Mangler metrikker</option>
                  <option value="has">Har metrikker</option>
                </select>
              </label>
              <label>
                <span>Sortér</span>
                <select id="analytics-metrics-sort">
                  <option value="date-desc">Nyeste først</option>
                  <option value="date-asc">Eldste først</option>
                  <option value="weighted-desc">Score (vektet) høyt → lavt</option>
                  <option value="rate-desc">Resonans (rate) høyt → lavt</option>
                  <option value="engagement-desc">Engasjement høyt → lavt</option>
                  <option value="impressions-desc">Visninger høyt → lavt</option>
                  <option value="profileviews-desc">Profilvisninger høyt → lavt</option>
                  <option value="followers-desc">Nye følgere høyt → lavt</option>
                  <option value="likes-desc">Likes høyt → lavt</option>
                  <option value="comments-desc">Kommentarer høyt → lavt</option>
                  <option value="shares-desc">Shares høyt → lavt</option>
                </select>
              </label>
              <span class="muted small" id="analytics-metrics-summary"></span>
            </div>
            <div class="analytics-card-body">
              <div id="analytics-metrics-table"></div>
            </div>
          </div>
        </section>

        <section class="analytics-sub" data-sub="import" hidden>
          <div class="analytics-card" data-card-id="import">
            <h3 class="analytics-card-head" data-card-toggle="import">
              <span class="analytics-card-chevron">▾</span> Importér LinkedIn-data
            </h3>
            <div class="analytics-card-body">
              <p>
                Eksportér via LinkedIn → <em>Settings &amp; Privacy → Data privacy → Get a copy of your data</em>.
                Velg <strong>"Download larger data archive"</strong> (den øverste radioknappen) — ikke "Want something in particular", den gir bare Articles/Profile/Invitations og mangler de filene vi trenger.
                Filene kommer som .csv i en ZIP via e-post (10 min – 24 t).
                Slipp <strong>Shares.csv</strong>, <strong>Comments.csv</strong> og <strong>Connections.csv</strong> her — vi auto-detekterer format og ignorerer resten.
              </p>

              <div class="analytics-dropzone" id="analytics-dropzone">
                <p>📂 Slipp CSV-filer her, eller</p>
                <input type="file" id="analytics-file-input" accept=".csv,text/csv" multiple hidden />
                <button class="primary" id="analytics-file-btn">Velg filer…</button>
              </div>

              <div class="analytics-demo-row">
                <button class="linkbtn" id="analytics-demo-load" title="Genererer 16 demo-poster + 30 connections så du kan se hvordan tab-en oppfører seg uten å vente på LinkedIn-eksport">🧪 Last inn demo-data</button>
                <span class="muted small">Eller test flyten først med generert data</span>
              </div>

              <div id="analytics-import-log" class="analytics-import-log"></div>

              <h4>Lagret data</h4>
              <ul id="analytics-data-summary"></ul>

              <div class="analytics-danger">
                <button class="linkbtn" id="analytics-find-duplicates" title="Finn metrics med samme content (fingerprint) men ulike datoer. Vises som liste du kan rydde i.">🔍 Finn mulige duplikater</button>
                <button class="linkbtn" id="analytics-clear-demo" title="Fjerner kun metrics og connections som ble lagt til via 'Last inn demo-data'. Dine ekte poster blir igjen.">🧪 Slett bare demo-data</button>
                <button class="linkbtn danger" id="analytics-reset">Slett all analytics-data</button>
              </div>
              <div id="analytics-duplicates-result" class="analytics-duplicates-result"></div>
            </div>
          </div>
        </section>
      </div>
    `;

    // Bind subtabs
    panel.querySelectorAll(".subtab").forEach(b => {
      b.addEventListener("click", () => activateSub(b.dataset.sub));
    });

    // Bind kollapsbare paneler — én delegert klikkhåndterer i panel-en
    panel.addEventListener("click", e => {
      const head = e.target.closest("[data-card-toggle]");
      if (!head) return;
      const cardId = head.getAttribute("data-card-toggle");
      toggleCard(cardId);
    });

    // Anvend persistert kollaps-state for alle kort
    applyCollapsedState();

    // Render insights øverst
    renderInsights();

    // Bind dropzone
    bindImport();

    // Bind toolbar
    const metricSel = document.getElementById("analytics-metric");
    if (metricSel) {
      metricSel.value = ui.metric;
      metricSel.addEventListener("change", () => {
        ui.metric = metricSel.value;
        saveUi();
        renderOverview();
      });
    }
    const dateSel = document.getElementById("analytics-date-range");
    if (dateSel) {
      dateSel.value = ui.dateRange;
      dateSel.addEventListener("change", () => {
        ui.dateRange = dateSel.value;
        saveUi();
        renderOverview();
      });
    }

    const linkBtn = document.getElementById("analytics-link-pipeline");
    if (linkBtn) linkBtn.addEventListener("click", relinkToPipeline);

    // Cat filter chips
    panel.querySelectorAll("#analytics-cat-filter .chip").forEach(c => {
      c.addEventListener("click", () => {
        ui.catFilter = c.dataset.cat === "all" ? null : c.dataset.cat;
        panel.querySelectorAll("#analytics-cat-filter .chip").forEach(x => x.classList.toggle("active", x === c));
        renderEngagers();
      });
    });

    // Reset
    const resetBtn = document.getElementById("analytics-reset");
    if (resetBtn) resetBtn.addEventListener("click", resetAll);
    const clearDemoBtn = document.getElementById("analytics-clear-demo");
    if (clearDemoBtn) clearDemoBtn.addEventListener("click", clearDemoData);
    const findDupBtn = document.getElementById("analytics-find-duplicates");
    if (findDupBtn) findDupBtn.addEventListener("click", findDuplicates);

    // Demo data
    const demoBtn = document.getElementById("analytics-demo-load");
    if (demoBtn) demoBtn.addEventListener("click", loadDemo);

    // Metrics filter + sort
    const mfilter = document.getElementById("analytics-metrics-filter");
    if (mfilter) mfilter.addEventListener("change", () => { ui.metricsFilter = mfilter.value; saveUi(); renderMetricsTable(); });
    const msort = document.getElementById("analytics-metrics-sort");
    if (msort) msort.addEventListener("change", () => { ui.metricsSort = msort.value; saveUi(); renderMetricsTable(); });

    // Post-modal lukk
    const closeBtn = document.getElementById("analytics-post-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", closePostModal);
    const backdrop = document.getElementById("analytics-post-modal-backdrop");
    if (backdrop) backdrop.addEventListener("click", closePostModal);
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") closePostModal();
    });

    activateSub(ui.subTab);
  }

  // ---------- post-modal ----------

  function openPostModal(metricId) {
    const m = state.postMetrics.find(x => x.id === metricId);
    if (!m) return;
    const { store } = getStores();
    const weightedScore = store ? store.weightedEngagements(m) : 0;
    const wr = store ? store.weightedRate(m) : 0;
    const weightedRatePct = wr > 0 ? (wr * 100).toFixed(2) + "%" : "—";
    const cb = window.ContentBrain;
    const cbState = cb ? cb.getState() : null;
    let pillar = null, pipelineTitle = "", pipelineId = m.linkedPostId;
    let displayContent = m.content || "";
    if (pipelineId && cbState && cbState.posts) {
      const p = cbState.posts.find(x => x.id === pipelineId);
      if (p) {
        pillar = p.pillar;
        pipelineTitle = p.title;
        // Bruk fullt Pipeline-body istedenfor det avkortede metric.content
        // (sync trunkerer på 280 tegn for liste-visning, men her vil vi se alt)
        if (p.body && p.body.length > displayContent.length) {
          displayContent = p.body;
        }
      }
    }
    if (!pillar && m._demoPillar) pillar = m._demoPillar;

    const PILLARS = {
      1: "Connective leadership", 2: "Familie & hockey",
      3: "Bygger & lærer", 4: "Krysspollinering",
    };
    const escapeHtml = s => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const fmtDate = iso => {
      if (!iso) return "—";
      const d = new Date(iso);
      return d.toLocaleString("nb-NO", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const content = document.getElementById("analytics-post-modal-content");
    if (!content) return;
    content.innerHTML = `
      <div class="post-modal-head">
        <span class="dot p${pillar || "-"}"></span>
        <span class="muted small">${pillar ? `Pilar ${pillar} — ${PILLARS[pillar]}` : "Ingen pilar-tagg"} · ${fmtDate(m.date)}</span>
      </div>

      <div class="post-modal-metrics">
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.impressions || 0}</div>
          <div class="post-modal-metric-lbl">Visninger</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.likes || 0}</div>
          <div class="post-modal-metric-lbl">Likes</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.comments || 0}</div>
          <div class="post-modal-metric-lbl">Kommentarer</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.shares || 0}</div>
          <div class="post-modal-metric-lbl">Shares</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.saves || 0}</div>
          <div class="post-modal-metric-lbl">Saves</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.sends || 0}</div>
          <div class="post-modal-metric-lbl">Sends</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.profileViews || 0}</div>
          <div class="post-modal-metric-lbl">Profilvisninger</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.followersGained || 0}</div>
          <div class="post-modal-metric-lbl">Nye følgere</div>
        </div>
        <div class="post-modal-metric post-modal-metric-total">
          <div class="post-modal-metric-num">${weightedScore}</div>
          <div class="post-modal-metric-lbl">Score (vektet)</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${m.engagements || 0}</div>
          <div class="post-modal-metric-lbl">Engasjement (rå sum)</div>
        </div>
        <div class="post-modal-metric">
          <div class="post-modal-metric-num">${weightedRatePct}</div>
          <div class="post-modal-metric-lbl">Resonans (vektet rate)</div>
        </div>
      </div>

      <div class="post-modal-body">
        ${escapeHtml(displayContent || "(uten tekst)").split("\n").map(p => `<p>${p}</p>`).join("")}
      </div>

      <div class="post-modal-actions">
        ${pipelineId ? `<span class="muted small">✓ Koblet til Pipeline-post: "${escapeHtml(pipelineTitle || "(uten tittel)")}"</span>` : '<span class="muted small">Ikke koblet til Pipeline</span>'}
        <div class="spacer"></div>
        ${m.url ? `<a class="primary" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">↗ Åpne på LinkedIn</a>` : ""}
      </div>
    `;

    const modal = document.getElementById("analytics-post-modal");
    if (modal) modal.hidden = false;
  }

  function closePostModal() {
    const modal = document.getElementById("analytics-post-modal");
    if (modal) modal.hidden = true;
  }

  function activateSub(sub) {
    ui.subTab = sub;
    document.querySelectorAll(".subtab").forEach(b => b.classList.toggle("active", b.dataset.sub === sub));
    document.querySelectorAll(".analytics-sub").forEach(s => s.hidden = s.dataset.sub !== sub);
    if (sub === "overview") renderOverview();
    if (sub === "engagers") renderEngagers();
    if (sub === "patterns") renderPatterns();
    if (sub === "metrics")  renderMetricsTable();
    if (sub === "import")   renderImportSummary();
    // Apply collapsed state hver gang en tab vises, så det er konsistent
    applyCollapsedState();
  }

  // ---------- kollapsbare paneler ----------

  function toggleCard(cardId) {
    const isCollapsed = !!ui.collapsedCards[cardId];
    ui.collapsedCards[cardId] = !isCollapsed;
    saveUi();
    applyCollapsedState();
  }

  function applyCollapsedState() {
    document.querySelectorAll("[data-card-id]").forEach(card => {
      const id = card.getAttribute("data-card-id");
      const collapsed = !!ui.collapsedCards[id];
      card.classList.toggle("collapsed", collapsed);
    });
  }

  // ---------- insights-banner ----------

  function renderInsights() {
    const node = document.getElementById("analytics-insights");
    if (!node) return;
    const I = window.AnalyticsInsights;
    if (!I) return;
    const { parser, classifier, cb } = getStores();
    const insights = I.generate({
      state,
      getCb: cb ? () => cb.getState() : null,
      parser,
      classifier,
    });

    const visible = insights.filter(i => !ui.dismissedInsights[i.key]);
    if (!visible.length) { node.innerHTML = ""; return; }

    const escapeHtml = s => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    // Sortér: good først (positive), tip, warn
    const order = { good: 0, tip: 1, warn: 2 };
    visible.sort((a, b) => (order[a.tone] || 1) - (order[b.tone] || 1));

    // Vis max 5 av gangen (resten under "Vis flere"-knapp)
    const showAll = ui.insightsExpanded;
    const visibleSet = showAll ? visible : visible.slice(0, 5);
    const hiddenCount = Math.max(0, visible.length - visibleSet.length);

    node.innerHTML = `
      <div class="insights-head">
        <div class="insights-title">
          <strong>🧠 Innsikt</strong>
          <span class="muted small">${visible.length} observasjon${visible.length === 1 ? "" : "er"} basert på dataen din</span>
        </div>
        <button class="linkbtn" id="insights-reset-dismiss" title="Vis alle skjulte insights igjen">↺ Vis alle</button>
      </div>
      <ul class="insights-list">
        ${visibleSet.map(i => `
          <li class="insight insight-${i.tone}" data-key="${escapeHtml(i.key)}">
            <span class="insight-icon">${escapeHtml(i.icon)}</span>
            <div class="insight-body">
              <div class="insight-title">${escapeHtml(i.title)}</div>
              <div class="insight-detail muted small">${escapeHtml(i.detail)}</div>
            </div>
            <button class="linkbtn insight-dismiss" data-key="${escapeHtml(i.key)}" title="Skjul denne">×</button>
          </li>
        `).join("")}
      </ul>
      ${hiddenCount > 0
        ? `<button class="linkbtn insights-expand">Vis ${hiddenCount} til ↓</button>`
        : showAll && visible.length > 5
          ? `<button class="linkbtn insights-collapse">Vis kun topp 5 ↑</button>`
          : ""}
    `;

    node.querySelectorAll(".insight-dismiss").forEach(b => {
      b.addEventListener("click", () => {
        ui.dismissedInsights[b.dataset.key] = true;
        saveUi();
        renderInsights();
      });
    });
    const resetBtn = node.querySelector("#insights-reset-dismiss");
    if (resetBtn) resetBtn.addEventListener("click", () => {
      ui.dismissedInsights = {};
      saveUi();
      renderInsights();
    });
    const expandBtn = node.querySelector(".insights-expand");
    if (expandBtn) expandBtn.addEventListener("click", () => {
      ui.insightsExpanded = true; saveUi(); renderInsights();
    });
    const collapseBtn = node.querySelector(".insights-collapse");
    if (collapseBtn) collapseBtn.addEventListener("click", () => {
      ui.insightsExpanded = false; saveUi(); renderInsights();
    });
  }

  // ---------- enrichment ----------

  function enrichedMetrics() {
    const { cb, store } = getStores();
    const cbState = cb ? cb.getState() : null;
    return state.postMetrics.map(m => {
      let pillar = null;
      if (m.linkedPostId && cbState && cbState.posts) {
        const p = cbState.posts.find(x => x.id === m.linkedPostId);
        if (p && p.pillar) pillar = p.pillar;
      }
      // Demo-data har _demoPillar som fallback hvis ingen Pipeline-match
      if (!pillar && m._demoPillar) pillar = m._demoPillar;
      // Avledede scoring-felt — beregnes on-the-fly så lagret data ikke
      // trenger migrering. weightedEngagements er ny default-scoremetrikk;
      // weightedRate er resonans (dybde per visning); profileViews er manuelt.
      const we = store ? store.weightedEngagements(m) : (m.likes||0)+(m.comments||0)*3+(m.shares||0)*5;
      const imp = m.impressions || 0;
      return {
        ...m,
        pillar,
        saves: m.saves || 0,
        sends: m.sends || 0,
        profileViews: m.profileViews || 0,
        followersGained: m.followersGained || 0,
        weightedEngagements: we,
        weightedRate: imp > 0 ? we / imp : 0,
      };
    });
  }

  // ---------- overview ----------

  function renderOverview() {
    const { dashboard } = getStores();
    // Excluded metrics (outliers) skal IKKE være med i charts/snitt
    const fullList = enrichedMetrics();
    const allMetrics = fullList.filter(m => !m.excluded);
    const metrics = filterByDateRange(allMetrics);
    const excludedCount = fullList.filter(m => m.excluded).length;

    dashboard.renderEngagementBar("#analytics-chart-engagement", metrics, {
      topN: ui.topN, metric: ui.metric,
    });
    dashboard.renderTrendLine("#analytics-chart-trend", metrics, {
      metric: ui.metric,
    });
    dashboard.renderPillarBars("#analytics-chart-pillar", metrics, {
      metric: ui.metric,
    });
    dashboard.renderReachResonance("#analytics-chart-reachres", metrics, {});

    // Bind klikk på hver bar-gruppe i Top innlegg-charten
    const barChart = document.getElementById("analytics-chart-engagement");
    if (barChart) {
      barChart.querySelectorAll(".analytics-bar-group").forEach(g => {
        g.addEventListener("click", (e) => {
          // Skjul-knappen stopper propagation, men dobbelt sikkerhet:
          if (e.target.classList && e.target.classList.contains("analytics-bar-skjul")) return;
          const id = g.getAttribute("data-id");
          if (id) openPostModal(id);
        });
      });
      // Skjul-knapp på hver bar — toggle excluded
      barChart.querySelectorAll(".analytics-bar-skjul").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const id = btn.getAttribute("data-skjul-id");
          const m = state.postMetrics.find(x => x.id === id);
          if (!m) return;
          m.excluded = true;
          const { store } = getStores();
          store.save(state);
          renderInsights();
          renderOverview();
          // Også re-render metrics-tabellen (i bakgrunnen) så Skjul-checkboxen
          // er checked når brukeren bytter dit
          if (typeof renderMetricsTable === "function") {
            try { renderMetricsTable(); } catch (_) {}
          }
        });
      });

      // "N skjult fra analyse"-banner med inline-liste og Vis igjen-knapp per
      let excludedInfo = barChart.querySelector(".analytics-excluded-info");
      if (excludedInfo) excludedInfo.remove();
      const excludedList = fullList.filter(m => m.excluded);
      if (excludedList.length > 0) {
        const info = document.createElement("details");
        info.className = "analytics-excluded-info";
        const escapeHtml = s => String(s ?? "")
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        const truncate = (s, n) => {
          s = String(s || "").replace(/\s+/g, " ").trim();
          return s.length > n ? s.slice(0, n - 1) + "…" : s;
        };
        info.innerHTML = `
          <summary>🔍 <strong>${excludedList.length}</strong> ${excludedList.length === 1 ? "innlegg" : "innlegg"} skjult fra analyse — klikk for å vise</summary>
          <ul class="analytics-excluded-list">
            ${excludedList.map(m => `
              <li>
                <span class="analytics-excluded-content">${escapeHtml(truncate(m.content || m.title || "(uten tekst)", 80))}</span>
                <span class="muted small">${m.engagements || 0} eng</span>
                <button class="linkbtn analytics-unexclude-btn" data-unexclude-id="${escapeHtml(m.id)}">↻ Vis igjen</button>
              </li>
            `).join("")}
          </ul>
        `;
        barChart.appendChild(info);
        // Bind Vis igjen
        info.querySelectorAll(".analytics-unexclude-btn").forEach(btn => {
          btn.addEventListener("click", e => {
            e.preventDefault();
            const id = btn.getAttribute("data-unexclude-id");
            const m = state.postMetrics.find(x => x.id === id);
            if (!m) return;
            m.excluded = false;
            const { store } = getStores();
            store.save(state);
            renderInsights();
            renderOverview();
            if (typeof renderMetricsTable === "function") {
              try { renderMetricsTable(); } catch (_) {}
            }
          });
        });
      }

      // Legg til "Vis mer" / "Vis færre"-knapp under SVG-en
      const allMatching = metrics.filter(m => (m[ui.metric] || 0) > 0).length;
      if (!barChart.querySelector(".analytics-show-more-row")) {
        const row = document.createElement("div");
        row.className = "analytics-show-more-row";
        const showMore = document.createElement("button");
        showMore.className = "linkbtn";
        showMore.textContent = ui.topN < allMatching ? `+ Vis flere (nå ${Math.min(ui.topN, allMatching)} av ${allMatching})` : `↺ Tilbakestill til 10 (viser ${allMatching})`;
        showMore.addEventListener("click", () => {
          if (ui.topN < allMatching) {
            ui.topN = Math.min(ui.topN + 10, allMatching);
          } else {
            ui.topN = 10;
          }
          saveUi();
          renderOverview();
        });
        row.appendChild(showMore);
        barChart.appendChild(row);
      }
    }

    const summary = document.getElementById("analytics-summary");
    if (summary) {
      const linked = metrics.filter(m => m.linkedPostId).length;
      const rangeLabel = {
        "7d": "siste 7 dager",
        "30d": "siste 30 dager",
        "90d": "siste 90 dager",
        "365d": "siste 365 dager",
        "all": "all tid",
      }[ui.dateRange] || "all tid";
      const filterNote = metrics.length !== allMetrics.length
        ? ` · viser ${metrics.length} av ${allMetrics.length} for ${rangeLabel}`
        : ` · ${rangeLabel}`;
      summary.textContent = `${linked} av ${metrics.length} koblet til Pipeline${filterNote}`;
    }
  }

  // ---------- engagers ----------

  function renderEngagers() {
    const { classifier, dashboard } = getStores();
    const classified = classifier.categorizeConnections(state);
    const breakdown = classifier.breakdownByCategory(state);

    dashboard.renderCategorySummary("#analytics-cat-summary-grid", breakdown);
    dashboard.renderNetworkGrowth("#analytics-chart-growth", state.connections);
    dashboard.renderConnectionsTable("#analytics-table-engagers", classified, {
      filter: ui.catFilter,
      limit: 100,
    });

    // Bind override-dropdowns (re-binding hver render — enkel og trygt)
    document.querySelectorAll(".analytics-cat-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const { store } = getStores();
        store.setEngagerTag(state, sel.dataset.name, sel.value);
        store.save(state);
        renderEngagers();
      });
    });

    const summary = document.getElementById("analytics-cat-summary");
    if (summary) summary.textContent = `${state.connections.length} connections totalt`;
  }

  // ---------- patterns ----------

  function renderPatterns() {
    const { dashboard } = getStores();
    dashboard.renderHeatmap("#analytics-heatmap", enrichedMetrics());
  }

  // ---------- manual metric entry ----------

  function renderMetricsTable() {
    const node = document.getElementById("analytics-metrics-table");
    if (!node) return;
    const summary = document.getElementById("analytics-metrics-summary");

    let metrics = enrichedMetrics().slice();
    const hasMetrics = m => (m.impressions || m.likes || m.comments || m.shares) > 0;
    const total = metrics.length;
    const withMetrics = metrics.filter(hasMetrics).length;

    // Filter
    if (ui.metricsFilter === "missing") metrics = metrics.filter(m => !hasMetrics(m));
    else if (ui.metricsFilter === "has") metrics = metrics.filter(hasMetrics);

    // Sort
    if (ui.metricsSort === "date-desc")               metrics.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    else if (ui.metricsSort === "date-asc")           metrics.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    else if (ui.metricsSort === "weighted-desc")      metrics.sort((a, b) => (b.weightedEngagements || 0) - (a.weightedEngagements || 0));
    else if (ui.metricsSort === "rate-desc")          metrics.sort((a, b) => (b.weightedRate || 0) - (a.weightedRate || 0));
    else if (ui.metricsSort === "engagement-desc")    metrics.sort((a, b) => (b.engagements || 0) - (a.engagements || 0));
    else if (ui.metricsSort === "impressions-desc")   metrics.sort((a, b) => (b.impressions || 0) - (a.impressions || 0));
    else if (ui.metricsSort === "profileviews-desc")  metrics.sort((a, b) => (b.profileViews || 0) - (a.profileViews || 0));
    else if (ui.metricsSort === "followers-desc")     metrics.sort((a, b) => (b.followersGained || 0) - (a.followersGained || 0));
    else if (ui.metricsSort === "likes-desc")         metrics.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    else if (ui.metricsSort === "comments-desc")      metrics.sort((a, b) => (b.comments || 0) - (a.comments || 0));
    else if (ui.metricsSort === "shares-desc")        metrics.sort((a, b) => (b.shares || 0) - (a.shares || 0));

    if (summary) {
      summary.textContent = `${withMetrics} av ${total} har metrikker · ${total - withMetrics} gjenstår`;
    }

    if (!metrics.length) {
      node.innerHTML = '<div class="analytics-empty">Ingen innlegg matcher filteret. Bytt filter eller importér Shares.csv først.</div>';
      return;
    }

    const escapeHtml = s => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const fmtDate = iso => {
      if (!iso) return "—";
      const d = new Date(iso);
      return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "2-digit" });
    };
    const truncate = (s, n) => {
      s = String(s || "").replace(/\s+/g, " ").trim();
      return s.length > n ? s.slice(0, n - 1) + "…" : s;
    };

    node.innerHTML = `
      <table class="analytics-metrics-table">
        <thead>
          <tr>
            <th>Dato</th>
            <th>Innlegg</th>
            <th class="num">Visn.</th>
            <th class="num">Likes</th>
            <th class="num">Komm.</th>
            <th class="num">Shares</th>
            <th class="num" title="Saves / bokmerker — fra LinkedIns post-analytics">Saves</th>
            <th class="num" title="Sends — DM-delinger, fra LinkedIns post-analytics">Sends</th>
            <th class="num" title="Profilvisninger fra denne posten — manuelt">Profilv.</th>
            <th class="num" title="Nye følgere fra denne posten — manuelt">Følg.</th>
            <th class="num" title="Rå sum: likes + komm + shares">Sum</th>
            <th class="num" title="Vektet score: like×1 + komm×3 + save×4 + repost×5 + send×6">Score</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${metrics.map(m => `
            <tr data-id="${escapeHtml(m.id)}" data-url="${escapeHtml(m.url || "")}" class="${m.excluded ? "metrics-row-excluded" : ""}">
              <td class="muted small">${fmtDate(m.date)}</td>
              <td>
                <div class="metrics-content metrics-content-clickable" data-modal-id="${escapeHtml(m.id)}" title="Klikk for å se hele innlegget">${escapeHtml(truncate(m.content, 100))}</div>
                <div class="metrics-row-links">
                  ${m.source === "pipeline" && !((m.impressions || 0) + (m.likes || 0) + (m.comments || 0) + (m.shares || 0)) ? `<span class="metrics-source-badge" title="Lagt til automatisk fra Pipeline da posten ble markert som publisert. Fyll inn visn/likes/komm/shares manuelt fra LinkedIn-appen.">⏳ Mangler tall</span>` : ""}
                  <button type="button" class="linkbtn metrics-view-btn" data-modal-id="${escapeHtml(m.id)}">👁️ Vis detaljer</button>
                  ${m.url ? `<a class="muted small" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">↗ LinkedIn</a>` : ""}
                </div>
              </td>
              <td class="num"><input type="number" min="0" class="metrics-input" data-field="impressions" value="${m.impressions || ""}" placeholder="0"/></td>
              <td class="num"><input type="number" min="0" class="metrics-input" data-field="likes" value="${m.likes || ""}" placeholder="0"/></td>
              <td class="num"><input type="number" min="0" class="metrics-input" data-field="comments" value="${m.comments || ""}" placeholder="0"/></td>
              <td class="num"><input type="number" min="0" class="metrics-input" data-field="shares" value="${m.shares || ""}" placeholder="0"/></td>
              <td class="num"><input type="number" min="0" class="metrics-input" data-field="saves" value="${m.saves || ""}" placeholder="0"/></td>
              <td class="num"><input type="number" min="0" class="metrics-input" data-field="sends" value="${m.sends || ""}" placeholder="0"/></td>
              <td class="num"><input type="number" min="0" class="metrics-input" data-field="profileViews" value="${m.profileViews || ""}" placeholder="0"/></td>
              <td class="num"><input type="number" min="0" class="metrics-input" data-field="followersGained" value="${m.followersGained || ""}" placeholder="0"/></td>
              <td class="num metrics-sum">${m.engagements || 0}</td>
              <td class="num metrics-score" title="Vektet score">${m.weightedEngagements || 0}</td>
              <td>
                <span class="metrics-status muted small"></span>
                <label class="metrics-exclude-toggle" title="Ekskluder fra snitt og top-performers (f.eks. for outliers som skjevvrir analysen)">
                  <input type="checkbox" class="metrics-exclude-checkbox" data-id="${escapeHtml(m.id)}" ${m.excluded ? "checked" : ""} />
                  <span class="metrics-exclude-label">Skjul</span>
                </label>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    // Bind autosave on blur for hver input
    node.querySelectorAll(".metrics-input").forEach(input => {
      input.addEventListener("blur", () => saveMetricRow(input));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); input.blur(); }
      });
    });

    // Bind klikk på "Vis detaljer" og innholdet → åpne modal
    node.querySelectorAll("[data-modal-id]").forEach(el => {
      el.addEventListener("click", () => openPostModal(el.dataset.modalId));
    });

    // Bind Skjul-checkbox: marker som ekskludert fra analyse-aggregeringer
    node.querySelectorAll(".metrics-exclude-checkbox").forEach(cb => {
      cb.addEventListener("change", e => {
        const id = e.target.dataset.id;
        const metric = state.postMetrics.find(m => m.id === id);
        if (!metric) return;
        metric.excluded = !!e.target.checked;
        const { store } = getStores();
        store.save(state);
        // Visuell dimming på raden
        const row = e.target.closest("tr");
        if (row) row.classList.toggle("metrics-row-excluded", metric.excluded);
        // Re-render insights/charts så outliers utelates fra snitt.
        // Kall ALLE views uansett subTab så Overview-tabben er ferskt
        // når brukeren bytter tilbake — DOM-en er hidden men oppdatert.
        renderInsights();
        renderOverview();
        renderEngagers();
        renderPatterns();
      });
    });
  }

  function saveMetricRow(inputEl) {
    const { store } = getStores();
    const row = inputEl.closest("tr");
    if (!row) return;
    const id = row.dataset.id;
    const metric = state.postMetrics.find(m => m.id === id);
    if (!metric) return;

    const fields = ["impressions", "likes", "comments", "shares", "saves", "sends", "profileViews", "followersGained"];
    let changed = false;
    fields.forEach(f => {
      const el = row.querySelector(`.metrics-input[data-field="${f}"]`);
      if (!el) return; // profileViews-input finnes alltid, men vær defensiv
      const v = Number(el.value) || 0;
      if (metric[f] !== v) { metric[f] = v; changed = true; }
    });
    if (!changed) return;

    // Recompute engagements + rate
    metric.engagements = (metric.likes || 0) + (metric.comments || 0) + (metric.shares || 0);
    metric.engagementRate = metric.impressions > 0 ? metric.engagements / metric.impressions : 0;

    // Update sum-cell + vektet score-cell i UI
    const sumCell = row.querySelector(".metrics-sum");
    if (sumCell) sumCell.textContent = metric.engagements;
    const scoreCell = row.querySelector(".metrics-score");
    if (scoreCell) scoreCell.textContent = store.weightedEngagements(metric);

    // Skjul "Mangler tall"-badgen så snart tall er fylt inn
    const totalNow = (metric.impressions || 0) + (metric.likes || 0) + (metric.comments || 0) + (metric.shares || 0);
    if (totalNow > 0) {
      const badge = row.querySelector(".metrics-source-badge");
      if (badge) badge.remove();
    }

    // Status indicator
    const status = row.querySelector(".metrics-status");
    if (status) {
      status.textContent = "✓ Lagret";
      status.classList.add("ok");
      setTimeout(() => { status.textContent = ""; status.classList.remove("ok"); }, 1500);
    }

    store.save(state);
  }

  // ---------- import ----------

  function bindImport() {
    const dz = document.getElementById("analytics-dropzone");
    const input = document.getElementById("analytics-file-input");
    const btn = document.getElementById("analytics-file-btn");
    if (!dz || !input || !btn) return;

    btn.addEventListener("click", () => input.click());
    input.addEventListener("change", () => handleFiles(input.files));

    ["dragenter", "dragover"].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("dragover"); })
    );
    ["dragleave", "drop"].forEach(ev =>
      dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("dragover"); })
    );
    dz.addEventListener("drop", e => {
      const files = e.dataTransfer?.files;
      if (files && files.length) handleFiles(files);
    });
  }

  async function handleFiles(fileList) {
    const log = document.getElementById("analytics-import-log");
    if (log) log.innerHTML = "";
    const { parser, store } = getStores();
    const files = Array.from(fileList || []);
    if (!files.length) return;

    for (const file of files) {
      try {
        const text = await file.text();
        const { format, records, meta } = parser.parseFile(text, file.name);
        let summary;
        if (format === "posts") {
          const r = store.mergePostMetrics(state, records);
          summary = `${file.name}: ${records.length} posts → ${r.added} nye, ${r.updated} oppdaterte`;
          appendLog(summary, "ok");
          // Diagnostisk: hvis ingen metric-kolonner ble funnet, advar tydelig
          if (meta && meta.hasMetrics === false) {
            appendLog(`⚠ Shares.csv mangler engagement-metrikker (Impressions/Likes/Comments). LinkedIns standard dataeksport inkluderer ikke disse. Bruk "Manuell entry"-tabellen nedenfor for å taste inn metrikker per post.`, "warn");
            const found = Object.entries(meta.columnsFound || {})
              .filter(([k, v]) => v && !["impressions","likes","comments","shares","engagements"].includes(k))
              .map(([k, v]) => `${k}=${v}`).join(", ");
            if (found) appendLog(`   Fant kolonner: ${found}`, "info");
            if (meta.headerKeys && meta.headerKeys.length) {
              appendLog(`   Alle headere i fila: ${meta.headerKeys.join(", ")}`, "info");
            }
          }
          continue;
        } else if (format === "connections") {
          const r = store.mergeConnections(state, records);
          summary = `${file.name}: ${records.length} connections → ${r.added} nye, ${r.updated} oppdaterte`;
        } else if (format === "comments" || format === "reactions") {
          summary = `${file.name}: ${format} (${records.length}) — registrert men ikke aggregert (LinkedIn-eksporten inneholder kun DINE handlinger, ikke andres mot dine innlegg)`;
        } else {
          summary = `${file.name}: ukjent format — hopper over`;
        }
        store.recordImport(state, { format, count: records.length, filename: file.name });
        appendLog(summary, "ok");
      } catch (err) {
        appendLog(`${file.name}: feil — ${err.message}`, "err");
      }
    }

    const { store: storeRef } = getStores();
    storeRef.save(state);

    // Auto-link til Pipeline etter import
    autoLink();

    // Re-render alle views så data dukker opp
    renderImportSummary();
    renderInsights();
    if (ui.subTab === "overview") renderOverview();
    if (ui.subTab === "engagers") renderEngagers();
  }

  function appendLog(text, kind = "ok") {
    const log = document.getElementById("analytics-import-log");
    if (!log) return;
    const li = document.createElement("div");
    const prefix = { ok: "✓ ", err: "✗ ", warn: "⚠ ", info: "  " }[kind] || "  ";
    li.className = "analytics-import-row " + (kind === "err" ? "err" : kind === "warn" ? "warn" : kind === "info" ? "info" : "ok");
    li.textContent = prefix + text;
    log.appendChild(li);
  }

  function renderImportSummary() {
    const out = document.getElementById("analytics-data-summary");
    if (!out) return;
    out.innerHTML = `
      <li><strong>${state.postMetrics.length}</strong> innlegg med metrics</li>
      <li><strong>${state.connections.length}</strong> connections</li>
      <li><strong>${Object.keys(state.engagerTags).length}</strong> manuelt overstyrte kategorier</li>
      <li><strong>${state.imports.length}</strong> tidligere import-batches${state.lastImportAt ? ` (siste: ${fmtDateTime(state.lastImportAt)})` : ""}</li>
    `;
  }

  function fmtDateTime(iso) {
    const d = new Date(iso);
    return d.toLocaleString("nb-NO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  // ---------- pipeline linking ----------

  function autoLink() {
    const { store, parser, cb } = getStores();
    if (!cb) return;
    const r = store.linkToPipeline(state, () => cb.getState(), parser);
    store.save(state);
    appendLog(`Pipeline-link: ${r.linked} matchet, ${r.unlinked} uten match`, "ok");
  }

  function relinkToPipeline() {
    const { store, parser, cb } = getStores();
    if (!cb) { alert("Pipeline ikke tilgjengelig."); return; }
    // Nullstill linker så algoritmen kjører på nytt
    state.postMetrics.forEach(m => { m.linkedPostId = null; });
    const r = store.linkToPipeline(state, () => cb.getState(), parser);
    store.save(state);
    alert(`${r.linked} innlegg matchet mot Pipeline, ${r.unlinked} uten match.`);
    renderOverview();
  }

  // ---------- demo data ----------

  function loadDemo() {
    if (!window.AnalyticsDemo) { alert("Demo-modul ikke lastet."); return; }
    if (state.postMetrics.length > 0 || state.connections.length > 0) {
      if (!confirm("Du har allerede analytics-data lagret. Demo-data vil legge seg PÅ TOPPEN. Fortsette?")) return;
    }
    const { store } = getStores();
    const r = window.AnalyticsDemo.loadDemoData(state);
    store.save(state);
    appendLog(`Demo-data lastet inn: ${r.addedPosts} posts, ${r.addedConnections} connections`, "ok");
    renderImportSummary();
  }

  // ---------- top-performers API (eksponeres til Ghostwriter) ----------

  /**
   * Topp N innlegg for en gitt pilar, sortert på vektet engasjement
   * (like×1 + komm×3 + repost×5) som default — så dybde i responsen teller
   * mer enn rå antall. Send opts.metric ("impressions" | "weightedRate" |
   * "engagements" | "profileViews") for å score på en annen dimensjon.
   * Brukes av Ghostwriter Voice Profile for å vise hvilke innlegg som traff.
   */
  function getTopPerformers(pillar, n = 3, opts = {}) {
    const metric = opts.metric || "weightedEngagements";
    return enrichedMetrics()
      .filter(m => !m.excluded)
      .filter(m => !pillar || m.pillar === pillar)
      .filter(m => (m[metric] || 0) > 0)
      .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
      .slice(0, n);
  }

  /**
   * Pilar-performance over et tidsvindu. Returnerer { snitt, count, vsAll }
   * for hver pilar. vsAll er +/- prosent vs gjennomsnitt av alle pilarer.
   */
  function getPillarPerformance(opts = {}) {
    const metric = opts.metric || "weightedEngagements";
    const sinceDays = opts.sinceDays || 56; // 8 uker default
    const cutoff = Date.now() - sinceDays * 86400000;

    const recent = enrichedMetrics().filter(m => {
      if (m.excluded) return false;
      if (!m.date) return false;
      return new Date(m.date).getTime() >= cutoff;
    });

    if (!recent.length) return null;

    // Tomme poster (0 engagement) skal ikke drage snittet ned — beregn
    // bare på poster med faktiske tall.
    const withData = recent.filter(m => (m[metric] || 0) > 0);
    const overall = withData.length
      ? withData.reduce((sum, m) => sum + (m[metric] || 0), 0) / withData.length
      : 0;
    const byPillar = {};
    [1, 2, 3, 4].forEach(p => {
      const subset = withData.filter(m => m.pillar === p);
      const avg = subset.length ? subset.reduce((s, m) => s + (m[metric] || 0), 0) / subset.length : 0;
      byPillar[p] = {
        pillar: p,
        count: subset.length,
        avg: Math.round(avg),
        vsAll: overall > 0 ? (avg - overall) / overall : 0,
      };
    });
    return { overall: Math.round(overall), byPillar, windowDays: sinceDays, totalPosts: withData.length };
  }

  // ---------- reset ----------

  function resetAll() {
    if (!confirm("Slett ALL analytics-data (post-metrics, connections, kategori-overrides, import-historikk)?\n\nDette kan ikke angres.")) return;
    const { store } = getStores();
    store.reset();
    state = store.emptyState();
    renderShell();
    alert("Analytics-data slettet.");
  }

  /**
   * Finn metrics med samme content (fingerprint) men ulike datoer/IDs.
   * Vanlig årsak: samme post er sync-et fra Pipeline OG importert fra
   * LinkedIn-CSV, eller importert to ganger. Lister gruppene og lar
   * Michel slette den ene per par via en konkret knapp.
   */
  function findDuplicates() {
    const node = document.getElementById("analytics-duplicates-result");
    if (!node) return;
    const groups = {};
    // Mer aggressiv match enn fingerprint alene: normaliser content til
    // første 60 alpha-tegn etter cleanup. Fanger duplikater hvor fingerprint
    // er ulik pga URL-er, hashtags, eller minimale tekst-endringer.
    const normalizeForDedup = s => {
      return String(s || "")
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, "")
        .replace(/[#@][\w-]+/g, "")
        .replace(/[^a-zæøå0-9\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 60);
    };
    state.postMetrics.forEach(m => {
      const key = normalizeForDedup(m.content || m.title || "");
      if (!key || key.length < 20) return; // ignorer for korte/tomme
      (groups[key] || (groups[key] = [])).push(m);
    });
    const dupes = Object.entries(groups).filter(([, arr]) => arr.length > 1);
    if (!dupes.length) {
      node.innerHTML = '<div class="muted small">✓ Ingen duplikater funnet — alle metrics har unik content-fingerprint.</div>';
      return;
    }

    const escapeHtml = s => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const fmt = iso => {
      if (!iso) return "—";
      const d = new Date(iso);
      return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "2-digit" });
    };

    node.innerHTML = `
      <div class="analytics-duplicates-header">
        <strong>🔍 ${dupes.length} ${dupes.length === 1 ? "duplikat-gruppe" : "duplikat-grupper"} funnet</strong>
        <p class="muted small">Hver gruppe har samme innhold men ulik dato/kilde. Behold den med ekte metrics — slett de tomme.</p>
      </div>
      ${dupes.map((grp, gi) => {
        const arr = grp[1].slice().sort((a, b) => (b.engagements || 0) - (a.engagements || 0));
        return `
          <div class="analytics-duplicate-group">
            <div class="muted small">Gruppe ${gi + 1} — ${arr.length} entries</div>
            <ul>
              ${arr.map(m => `
                <li>
                  <span class="muted small">${fmt(m.date)}</span>
                  <span class="analytics-dup-content">${escapeHtml((m.content || "(uten tekst)").slice(0, 80))}</span>
                  <span class="muted small">${m.engagements || 0} eng · ${m.source === "pipeline" ? "Pipeline" : "CSV"}</span>
                  <button class="linkbtn danger" data-delete-id="${escapeHtml(m.id)}">Slett denne</button>
                </li>
              `).join("")}
            </ul>
          </div>
        `;
      }).join("")}
    `;

    node.querySelectorAll("[data-delete-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-delete-id");
        const m = state.postMetrics.find(x => x.id === id);
        if (!m) return;
        if (!confirm(`Slett denne metric-raden?\n\nDato: ${m.date}\nEngagement: ${m.engagements || 0}\n\nKan ikke angres uten å re-importere.`)) return;
        state.postMetrics = state.postMetrics.filter(x => x.id !== id);
        const { store } = getStores();
        store.save(state);
        findDuplicates(); // re-render listen
        renderInsights();
        if (ui.subTab === "overview") renderOverview();
      });
    });
  }

  /**
   * Slett kun demo-data (metrics og connections med _demoPillar/_demo-flagg).
   * Lar ekte importerte/synkede poster være i fred. Brukes når demo-data
   * fra tidligere testing skaper duplikater i analyser.
   */
  function clearDemoData() {
    const metricsBefore = state.postMetrics.length;
    const connsBefore = state.connections.length;
    const demoMetrics = state.postMetrics.filter(m => m._demoPillar !== undefined || m._demo === true).length;
    const demoConns = state.connections.filter(c => c._demo === true).length;
    if (demoMetrics === 0 && demoConns === 0) {
      alert("Ingen demo-data funnet. Alt i analytics ser ut som ekte data (CSV-import eller Pipeline-sync).");
      return;
    }
    if (!confirm(`Slett ${demoMetrics} demo-metrics og ${demoConns} demo-connections?\n\nEkte data (CSV-importert + Pipeline-sync) blir liggende.\nDette kan ikke angres uten å importere på nytt.`)) return;

    state.postMetrics = state.postMetrics.filter(m => m._demoPillar === undefined && m._demo !== true);
    state.connections = state.connections.filter(c => c._demo !== true);
    const { store } = getStores();
    store.save(state);
    renderShell();
    alert(`Demo-data slettet: ${metricsBefore - state.postMetrics.length} metrics + ${connsBefore - state.connections.length} connections fjernet. Ekte data uberørt.`);
  }

  // ---------- public API ----------

  const Analytics = {
    init,
    /**
     * Åpne post-detalj-modal for en gitt metric-id. Brukes av dashboard.js
     * sine klikkbare elementer (trend-dots, bar-charts).
     */
    _openPostModal(id) {
      if (!state) {
        const { store } = getStores();
        state = store.load();
      }
      openPostModal(id);
    },
    /**
     * Topp-N performende innlegg for en pilar.
     * Brukes av Ghostwriter for å auto-foreslå few-shot eksempler.
     */
    getTopPerformers(pillar, n, opts) {
      if (!state) {
        const { store } = getStores();
        state = store.load();
      }
      return getTopPerformers(pillar, n, opts);
    },
    /**
     * Per-pilar performance siste N dager.
     * Brukes av Ghostwriter Compose for å vise "denne pilaren har
     * underperformet"-hints.
     */
    getPillarPerformance(opts) {
      if (!state) {
        const { store } = getStores();
        state = store.load();
      }
      return getPillarPerformance(opts);
    },
    /**
     * Sync Pipeline-published posts til metrics-tabellen. Kalles av
     * app.js sin upsertPost når en post er published med URL+dato, slik
     * at radene dukker opp uten at brukeren må åpne Analytics-fanen
     * først. Idempotent og soft-coupled (app.js kaller via optional
     * chaining; null-safe hvis Analytics ikke er lastet).
     */
    syncFromPipeline() {
      return syncPipelinePublishedToMetrics({ silent: true, rerender: true });
    },

    /**
     * Er det noe data overhodet? Lar Ghostwriter unngå å vise hints
     * når det ikke er noe å rapportere fra.
     */
    hasData() {
      if (!state) {
        const { store } = getStores();
        state = store.load();
      }
      return state.postMetrics.length > 0;
    },
    // For debugging fra DevTools
    _getState: () => state,
    _reload: () => { const { store } = getStores(); state = store.load(); renderShell(); },
  };

  if (typeof window !== "undefined") window.Analytics = Analytics;
})();
