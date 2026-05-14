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

  // Lokal UI-state (ikke persistert i analytics-store; for filtre/sort).
  const ui = {
    metric: "engagements",       // engagements | impressions | likes | comments
    topN: 10,
    catFilter: null,             // null | "peer" | "recruit" | "board" | "prospect" | "other"
    subTab: "overview",          // overview | engagers | patterns | import
  };

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
      renderShell();
      initialized = true;
    } else {
      renderShell();
    }
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
        <button class="subtab" data-sub="import" role="tab">Importér</button>
      </nav>

      <div class="analytics-body">
        <section class="analytics-sub" data-sub="overview">
          <div class="analytics-toolbar">
            <label>
              <span>Metric</span>
              <select id="analytics-metric">
                <option value="engagements">Engasjement (sum)</option>
                <option value="impressions">Visninger</option>
                <option value="likes">Likes</option>
                <option value="comments">Kommentarer</option>
              </select>
            </label>
            <button class="linkbtn" id="analytics-link-pipeline" title="Match metrics mot Pipeline-poster så pilar-info propagerer">🔗 Link til Pipeline</button>
            <span class="muted small" id="analytics-summary"></span>
          </div>

          <div class="analytics-card">
            <h3>Topp innlegg</h3>
            <div id="analytics-chart-engagement"></div>
          </div>

          <div class="analytics-card">
            <h3>Trend over tid</h3>
            <div id="analytics-chart-trend"></div>
          </div>

          <div class="analytics-card">
            <h3>Per pilar (snitt)</h3>
            <div id="analytics-chart-pillar"></div>
          </div>
        </section>

        <section class="analytics-sub" data-sub="engagers" hidden>
          <div class="analytics-toolbar">
            <div class="chips" id="analytics-cat-filter">
              <button class="chip active" data-cat="all">Alle</button>
              <button class="chip" data-cat="peer">Peers</button>
              <button class="chip" data-cat="recruit">Rekrutter</button>
              <button class="chip" data-cat="board">Styre</button>
              <button class="chip" data-cat="prospect">Prospects</button>
              <button class="chip" data-cat="other">Andre</button>
            </div>
            <span class="muted small" id="analytics-cat-summary"></span>
          </div>

          <div class="analytics-cat-grid" id="analytics-cat-summary-grid"></div>

          <div class="analytics-card">
            <h3>Nettverkets vekst</h3>
            <p class="muted small">Kumulativ connections-vekst per måned. Stolpene viser nye per måned, linjen totalen.</p>
            <div id="analytics-chart-growth"></div>
          </div>

          <div class="analytics-card">
            <h3>Connections</h3>
            <div id="analytics-table-engagers"></div>
          </div>
        </section>

        <section class="analytics-sub" data-sub="patterns" hidden>
          <div class="analytics-card">
            <h3>Posting-mønster (ukedag × time)</h3>
            <p class="muted small">Snitt engasjement basert på når innlegget ble publisert. Mørk = sterkere.</p>
            <div id="analytics-heatmap"></div>
          </div>
        </section>

        <section class="analytics-sub" data-sub="import" hidden>
          <div class="analytics-card">
            <h3>Importér LinkedIn-data</h3>
            <p>
              Eksportér via LinkedIn → <em>Settings &amp; Privacy → Data privacy → Get a copy of your data</em>.
              Velg "Want something in particular?" og hak av <strong>Posts</strong>, <strong>Comments</strong>, <strong>Connections</strong>.
              Filene kommer som .csv i en ZIP. Slipp dem her — vi auto-detekterer format.
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
              <button class="linkbtn danger" id="analytics-reset">Slett all analytics-data</button>
            </div>
          </div>
        </section>
      </div>
    `;

    // Bind subtabs
    panel.querySelectorAll(".subtab").forEach(b => {
      b.addEventListener("click", () => activateSub(b.dataset.sub));
    });

    // Bind dropzone
    bindImport();

    // Bind toolbar
    const metricSel = document.getElementById("analytics-metric");
    if (metricSel) {
      metricSel.value = ui.metric;
      metricSel.addEventListener("change", () => {
        ui.metric = metricSel.value;
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

    // Demo data
    const demoBtn = document.getElementById("analytics-demo-load");
    if (demoBtn) demoBtn.addEventListener("click", loadDemo);

    activateSub(ui.subTab);
  }

  function activateSub(sub) {
    ui.subTab = sub;
    document.querySelectorAll(".subtab").forEach(b => b.classList.toggle("active", b.dataset.sub === sub));
    document.querySelectorAll(".analytics-sub").forEach(s => s.hidden = s.dataset.sub !== sub);
    if (sub === "overview") renderOverview();
    if (sub === "engagers") renderEngagers();
    if (sub === "patterns") renderPatterns();
    if (sub === "import")   renderImportSummary();
  }

  // ---------- enrichment ----------

  function enrichedMetrics() {
    const { cb } = getStores();
    const cbState = cb ? cb.getState() : null;
    return state.postMetrics.map(m => {
      let pillar = null;
      if (m.linkedPostId && cbState && cbState.posts) {
        const p = cbState.posts.find(x => x.id === m.linkedPostId);
        if (p && p.pillar) pillar = p.pillar;
      }
      // Demo-data har _demoPillar som fallback hvis ingen Pipeline-match
      if (!pillar && m._demoPillar) pillar = m._demoPillar;
      return { ...m, pillar };
    });
  }

  // ---------- overview ----------

  function renderOverview() {
    const { dashboard } = getStores();
    const metrics = enrichedMetrics();

    dashboard.renderEngagementBar("#analytics-chart-engagement", metrics, {
      topN: ui.topN, metric: ui.metric,
    });
    dashboard.renderTrendLine("#analytics-chart-trend", metrics, {
      metric: ui.metric,
    });
    dashboard.renderPillarBars("#analytics-chart-pillar", metrics, {
      metric: ui.metric,
    });

    const summary = document.getElementById("analytics-summary");
    if (summary) {
      const linked = metrics.filter(m => m.linkedPostId).length;
      summary.textContent = `${metrics.length} innlegg importert · ${linked} koblet til Pipeline`;
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
        const { format, records } = parser.parseFile(text, file.name);
        let summary;
        if (format === "posts") {
          const r = store.mergePostMetrics(state, records);
          summary = `${file.name}: ${records.length} posts → ${r.added} nye, ${r.updated} oppdaterte`;
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
    if (ui.subTab === "overview") renderOverview();
    if (ui.subTab === "engagers") renderEngagers();
  }

  function appendLog(text, kind = "ok") {
    const log = document.getElementById("analytics-import-log");
    if (!log) return;
    const li = document.createElement("div");
    li.className = "analytics-import-row " + (kind === "err" ? "err" : "ok");
    li.textContent = (kind === "err" ? "✗ " : "✓ ") + text;
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
   * Topp N innlegg for en gitt pilar, sortert på engasjement (sum likes+
   * comments+shares) som default. Brukes av Ghostwriter Voice Profile
   * for å vise hvilke faktiske innlegg som har truffet best.
   */
  function getTopPerformers(pillar, n = 3, opts = {}) {
    const metric = opts.metric || "engagements";
    return enrichedMetrics()
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
    const metric = opts.metric || "engagements";
    const sinceDays = opts.sinceDays || 56; // 8 uker default
    const cutoff = Date.now() - sinceDays * 86400000;

    const recent = enrichedMetrics().filter(m => {
      if (!m.date) return false;
      return new Date(m.date).getTime() >= cutoff;
    });

    if (!recent.length) return null;

    const overall = recent.reduce((sum, m) => sum + (m[metric] || 0), 0) / recent.length;
    const byPillar = {};
    [1, 2, 3, 4].forEach(p => {
      const subset = recent.filter(m => m.pillar === p);
      const avg = subset.length ? subset.reduce((s, m) => s + (m[metric] || 0), 0) / subset.length : 0;
      byPillar[p] = {
        pillar: p,
        count: subset.length,
        avg: Math.round(avg),
        vsAll: overall > 0 ? (avg - overall) / overall : 0,
      };
    });
    return { overall: Math.round(overall), byPillar, windowDays: sinceDays, totalPosts: recent.length };
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

  // ---------- public API ----------

  const Analytics = {
    init,
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
