/* =====================================================================
   Content Brain — app.js
   v0.1 — vanilla JS, localStorage, single-page tab navigation
   ===================================================================== */

(() => {
  "use strict";

  // ----------------------------- constants -----------------------------

  const STORAGE_KEY = "contentBrain.v1";
  const CALENDAR_WEEKS = 8;

  const PILLARS = {
    1: { label: "Connective leadership", short: "Leadership", cls: "p1" },
    2: { label: "Familie & hockey",      short: "Familie",    cls: "p2" },
    3: { label: "Bygger & lærer",        short: "Bygger",     cls: "p3" },
    4: { label: "Krysspollinering",      short: "Krysspoll.", cls: "p4" },
  };

  const STATUS_LABEL = {
    idea: "Idé",
    draft: "Draft",
    ready: "Klar",
    scheduled: "Planlagt",
    published: "Publisert",
  };

  // ----------------------------- state -----------------------------

  /** @type {{posts: Array, meta: {seeded: boolean, rotationAnchor: number, rotationAnchorWeek: string}}} */
  let state = load();
  // Funksjons-deklarasjonen ensureSortIndex hoistes innenfor IIFE-scope og er trygg å kalle her
  ensureSortIndex();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn("Could not parse localStorage, falling back to seed", e);
    }
    return defaultState();
  }

  function defaultState() {
    return {
      posts: (window.SEED_POSTS || []).map(p => ({ ...p })),
      meta: {
        seeded: true,
        rotationAnchor: 1,                 // pilar for current week
        rotationAnchorWeek: isoWeekStart(new Date()),
      }
    };
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ----------------------------- helpers -----------------------------

  const $  = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const newId = () => "p_" + Math.random().toString(36).slice(2, 10);

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function daysFromNow(iso) {
    if (!iso) return null;
    const t = new Date(iso + "T00:00:00").getTime();
    if (isNaN(t)) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = t - today.getTime();
    return Math.round(diffMs / 86400000);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
  }

  function pillarBadge(pillar) {
    const cls = pillar && PILLARS[pillar] ? PILLARS[pillar].cls : "p-";
    const label = pillar && PILLARS[pillar] ? PILLARS[pillar].short : "—";
    return `<span class="dot ${cls}" title="Pilar ${pillar || "—"}: ${escapeHtml(label)}"></span>`;
  }

  // Monday 00:00 of the ISO week containing `date`
  function isoWeekStart(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;        // Sunday → 7
    if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
    return d.toISOString().slice(0, 10);
  }

  function isoWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  function addDays(isoDate, days) {
    const d = new Date(isoDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function weeksBetween(isoA, isoB) {
    const a = new Date(isoA + "T00:00:00Z");
    const b = new Date(isoB + "T00:00:00Z");
    return Math.round((b - a) / (7 * 86400000));
  }

  function pillarForWeek(weekStartIso) {
    const anchor = state.meta.rotationAnchor || 1;
    const anchorWeek = state.meta.rotationAnchorWeek || isoWeekStart(new Date());
    const offset = weeksBetween(anchorWeek, weekStartIso);
    const idx = ((anchor - 1) + offset) % 4;
    return ((idx % 4) + 4) % 4 + 1;        // ensure 1..4
  }

  // ----------------------------- CRUD -----------------------------

  /**
   * sortIndex (ascending) styrer rekkefølge i Pipeline-lanes. Migrasjon:
   * alle posts uten sortIndex får én tildelt per lane, sortert etter
   * capturedAt desc → eksisterende rekkefølge bevares ved første load.
   */
  function ensureSortIndex() {
    const unmigrated = state.posts.filter(p => typeof p.sortIndex !== "number");
    if (!unmigrated.length) return;
    const byStatus = {};
    unmigrated.forEach(p => {
      const s = p.status || "idea";
      (byStatus[s] ||= []).push(p);
    });
    Object.entries(byStatus).forEach(([status, posts]) => {
      const existingMax = Math.max(
        -1,
        ...state.posts
          .filter(p => p.status === status && typeof p.sortIndex === "number")
          .map(p => p.sortIndex)
      );
      posts.sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || ""));
      posts.forEach((p, i) => { p.sortIndex = existingMax + 1 + i; });
    });
    save();
  }

  function minSortIndexInLane(status) {
    const items = state.posts.filter(p => p.status === status && typeof p.sortIndex === "number");
    if (!items.length) return 0;
    return Math.min(...items.map(p => p.sortIndex));
  }

  function upsertPost(post) {
    if (typeof post.sortIndex !== "number") {
      // Nye posts havner øverst i sin lane
      post.sortIndex = minSortIndexInLane(post.status || "idea") - 1;
    }
    const i = state.posts.findIndex(p => p.id === post.id);
    if (i >= 0) state.posts[i] = post;
    else state.posts.push(post);
    save();
    // Live-hook: hvis posten er publisert med URL+dato, be Analytics om å
    // sync-e så den dukker opp i Mangler metrikker-tabellen uten at fanen
    // må åpnes manuelt. Soft-koblet: no-op hvis Analytics ikke er lastet.
    if (post.status === "published" && post.publishedAt && post.linkedinUrl) {
      try { window.Analytics?.syncFromPipeline?.(); } catch (e) {
        console.warn("[content-brain] Analytics.syncFromPipeline feilet", e);
      }
    }
  }

  function deletePost(id) {
    state.posts = state.posts.filter(p => p.id !== id);
    save();
  }

  function getPost(id) { return state.posts.find(p => p.id === id); }

  // ----------------------------- tab navigation -----------------------------

  function activateTab(name) {
    $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    $$(".panel").forEach(p => p.classList.toggle("active", p.id === name));
    if (name === "pipeline")    renderPipeline();
    if (name === "calendar")    renderCalendar();
    if (name === "archive")     renderArchive();
    if (name === "capture")     renderCaptureRecent();
    if (name === "ghostwriter" && window.Ghostwriter?.init) window.Ghostwriter.init();
    if (name === "analytics"   && window.Analytics?.init)   window.Analytics.init();
    if (name === "inspirasjon" && window.NewsletterInspirer?.init) window.NewsletterInspirer.init();
  }

  $$(".tab").forEach(t => t.addEventListener("click", () => activateTab(t.dataset.tab)));

  // ----------------------------- CAPTURE -----------------------------

  $("#capture-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const post = {
      id: newId(),
      status: $("#capture-status").value,
      pillar: $("#capture-pillar").value ? Number($("#capture-pillar").value) : null,
      title:  $("#capture-title").value.trim(),
      body:   $("#capture-body").value.trim(),
      source: $("#capture-source").value.trim(),
      notes: "",
      capturedAt: new Date().toISOString(),
      publishedAt: null,
      scheduledFor: null,
      linkedinUrl: ""
    };
    if (!post.title) return;
    upsertPost(post);

    // reset form, keep pillar so a chain of related captures stays in flow
    $("#capture-title").value  = "";
    $("#capture-body").value   = "";
    $("#capture-source").value = "";
    $("#capture-status").value = "idea";

    renderCaptureRecent();
    $("#capture-title").focus();
  });

  // Mic på Capture-body-feltet — krever Ghostwriter.setupMic
  // (som lastes etter app.js i HTML, så bind asynkront)
  function setupCaptureMic() {
    if (!window.Ghostwriter?.setupMic) return;
    window.Ghostwriter.setupMic({
      btnSelector: "#capture-mic",
      statusSelector: "#capture-mic-status",
      langSelector: "#capture-mic-lang",
      targetSelector: "#capture-body",
      tooltipIdle: "Snakk inn ideen",
      onText: (text) => {
        const el = $("#capture-body");
        if (!el) return;
        const current = el.value;
        el.value = (current ? current.trim() + " " : "") + text;
      },
    });
  }
  // Run after DOM and ghostwriter modules are loaded
  setTimeout(setupCaptureMic, 0);

  function renderCaptureRecent() {
    const list = $("#capture-list");
    const recent = state.posts
      .slice()
      .sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || ""))
      .slice(0, 8);
    list.innerHTML = recent.length
      ? recent.map(renderCard).join("")
      : `<li class="empty">Ingen idéer enda. Skriv noe over.</li>`;
    bindCardClicks(list);

    const total = state.posts.length;
    $("#capture-count").textContent = `${total} totalt`;
  }

  // ----------------------------- PIPELINE -----------------------------

  let pipelinePillar = "all";
  let pipelineSearch = "";

  $$("#pipeline-pillar-filter .chip").forEach(c => {
    c.addEventListener("click", () => {
      pipelinePillar = c.dataset.pillar;
      $$("#pipeline-pillar-filter .chip").forEach(x => x.classList.toggle("active", x === c));
      renderPipeline();
    });
  });

  $("#pipeline-search").addEventListener("input", (e) => {
    pipelineSearch = e.target.value.trim().toLowerCase();
    renderPipeline();
  });

  /**
   * Sjekk planlagte poster og vis banner hvis noen skal publiseres
   * innen 2 dager. Banneret er klikkbar — scroller til posten.
   */
  function renderReminderBanner() {
    const banner = $("#pipeline-reminder-banner");
    if (!banner) return;
    const upcoming = state.posts
      .filter(p => p.scheduledFor && (p.status === "ready" || p.status === "scheduled"))
      .map(p => ({ ...p, daysUntil: daysFromNow(p.scheduledFor) }))
      .filter(p => p.daysUntil !== null && p.daysUntil >= 0 && p.daysUntil <= 2)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    if (!upcoming.length) {
      banner.hidden = true;
      banner.innerHTML = "";
      return;
    }
    const first = upcoming[0];
    const whenText = first.daysUntil === 0 ? "i dag" : first.daysUntil === 1 ? "i morgen" : `om ${first.daysUntil} dager`;
    const extra = upcoming.length > 1 ? ` (+ ${upcoming.length - 1} til)` : "";
    banner.hidden = false;
    banner.innerHTML = `
      <span class="pipeline-reminder-icon">📅</span>
      <span class="pipeline-reminder-text">
        <strong>${upcoming.length === 1 ? "1 innlegg" : `${upcoming.length} innlegg`}</strong>
        klar for publisering snart: <em>${escapeHtml(first.title)}</em>
        — planlagt ${whenText}${extra}
      </span>
      <button class="linkbtn pipeline-reminder-jump" data-jump-id="${first.id}">Vis →</button>
      <button class="linkbtn pipeline-reminder-dismiss" title="Skjul">×</button>
    `;
    const jumpBtn = banner.querySelector(".pipeline-reminder-jump");
    if (jumpBtn) jumpBtn.addEventListener("click", () => {
      const card = $(`.card[data-id="${first.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.style.outline = "2px solid #6366f1";
        setTimeout(() => { card.style.outline = ""; }, 2000);
      }
    });
    const dismissBtn = banner.querySelector(".pipeline-reminder-dismiss");
    if (dismissBtn) dismissBtn.addEventListener("click", () => { banner.hidden = true; });
  }

  function renderPipeline() {
    renderReminderBanner();
    // Lane "ready" inkluderer både ready og scheduled — slik at planlagte
    // poster blir i Klar-kolonnen istedenfor å forsvinne til Kalender.
    const laneStatuses = {
      idea: ["idea"],
      draft: ["draft"],
      ready: ["ready", "scheduled"],
    };
    Object.entries(laneStatuses).forEach(([lane, statuses]) => {
      const items = state.posts.filter(p => {
        if (!statuses.includes(p.status)) return false;
        if (pipelinePillar !== "all" && String(p.pillar) !== pipelinePillar) return false;
        if (pipelineSearch) {
          const hay = (p.title + " " + p.body + " " + (p.notes || "")).toLowerCase();
          if (!hay.includes(pipelineSearch)) return false;
        }
        return true;
      }).sort((a, b) => {
        // I Klar-lane: scheduled-poster først (tidligst dato øverst),
        // så ready-poster (etter sortIndex/capturedAt som før)
        if (lane === "ready") {
          const aSched = a.scheduledFor || "";
          const bSched = b.scheduledFor || "";
          if (aSched && !bSched) return -1;
          if (!aSched && bSched) return 1;
          if (aSched && bSched) return aSched.localeCompare(bSched);
        }
        const ai = typeof a.sortIndex === "number" ? a.sortIndex : Number.MAX_SAFE_INTEGER;
        const bi = typeof b.sortIndex === "number" ? b.sortIndex : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return (b.capturedAt || "").localeCompare(a.capturedAt || "");
      });

      const laneEl = $("#lane-" + lane);
      $("#count-" + lane).textContent = items.length;
      laneEl.innerHTML = items.length
        ? items.map(p => renderCard(p, { showReorder: true })).join("")
        : `<li class="empty">Tom</li>`;
      bindCardClicks(laneEl);
      wireLaneDragAndDrop(laneEl, lane);
    });
  }

  function renderCard(p, opts = {}) {
    const { showReorder = false } = opts;
    const meta = [];
    if (p.publishedAt)  meta.push(`Publisert ${fmtDate(p.publishedAt)}`);
    if (p.scheduledFor) {
      // Tydeligere visning av planlagt-dato: pille med 📅 + "Planlagt 4. juni"
      const daysUntil = daysFromNow(p.scheduledFor);
      const urgent = daysUntil !== null && daysUntil <= 2 && daysUntil >= 0;
      meta.push(`<span class="card-scheduled-pill ${urgent ? "urgent" : ""}" title="Planlagt publisering">📅 ${fmtDate(p.scheduledFor)}${daysUntil !== null && daysUntil >= 0 && daysUntil <= 7 ? ` (${daysUntil === 0 ? "i dag" : daysUntil === 1 ? "i morgen" : `om ${daysUntil} dager`})` : ""}</span>`);
    }
    if (p.source)       meta.push(`<span title="${escapeHtml(p.source)}">kilde</span>`);
    if (p.linkedinUrl)  meta.push(`<a href="${escapeHtml(p.linkedinUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">LinkedIn ↗</a>`);

    // Mangler-URL-varsel: published-poster uten linkedinUrl fanges ikke av
    // Analytics-sync. Vis liten pille så Michel husker å fylle inn URL.
    if (p.status === "published" && !p.linkedinUrl) {
      meta.push(`<span class="card-warning-pill" title="Uten LinkedIn-URL fanger ikke Analytics-sync denne posten">⚠ mangler URL</span>`);
    }

    // "→ Ghostwriter" tilgjengelig på alle ikke-publiserte kort
    const ghostwriterBtn = p.status !== "published"
      ? `<button class="linkbtn" data-action="ghostwriter" data-id="${p.id}" onclick="event.stopPropagation()">→ Ghostwriter</button>`
      : "";

    // Reorder-knapper bare i Pipeline-lanes (showReorder=true)
    const reorderCtrls = showReorder
      ? `<span class="card-reorder">
           <button class="card-arrow" data-action="move-up" data-id="${p.id}" title="Flytt opp" onclick="event.stopPropagation()" aria-label="Flytt opp">↑</button>
           <button class="card-arrow" data-action="move-down" data-id="${p.id}" title="Flytt ned" onclick="event.stopPropagation()" aria-label="Flytt ned">↓</button>
         </span>`
      : "";

    const draggable = showReorder ? ` draggable="true"` : "";

    return `
      <li class="card${showReorder ? " card-draggable" : ""}" data-id="${p.id}"${draggable}>
        <div class="card-head">
          ${pillarBadge(p.pillar)}
          <span class="card-title">${escapeHtml(p.title || "(uten tittel)")}</span>
          ${reorderCtrls}
        </div>
        ${p.body ? `<div class="card-body">${escapeHtml(p.body)}</div>` : ""}
        ${meta.length ? `<div class="card-meta">${meta.join(" · ")}</div>` : ""}
        ${ghostwriterBtn ? `<div class="card-actions">${ghostwriterBtn}</div>` : ""}
      </li>
    `;
  }

  function bindCardClicks(container) {
    container.querySelectorAll(".card").forEach(c => {
      c.addEventListener("click", () => openEdit(c.dataset.id));
    });
    container.querySelectorAll('[data-action="ghostwriter"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        window.ContentBrain?.sendToGhostwriter?.(btn.dataset.id);
      });
    });
    container.querySelectorAll('[data-action="move-up"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveCardInLane(btn.dataset.id, "up");
      });
    });
    container.querySelectorAll('[data-action="move-down"]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        moveCardInLane(btn.dataset.id, "down");
      });
    });
  }

  // ----------------------------- PIPELINE: REORDERING -----------------------------

  /**
   * Bytter sortIndex med nabokortet i samme lane.
   * Beregner over post.status (ikke det rendrede DOM) for å unngå filter-bias.
   */
  function moveCardInLane(id, direction) {
    const p = state.posts.find(q => q.id === id);
    if (!p) return;
    const lane = state.posts
      .filter(q => q.status === p.status)
      .sort((a, b) => {
        const ai = typeof a.sortIndex === "number" ? a.sortIndex : Number.MAX_SAFE_INTEGER;
        const bi = typeof b.sortIndex === "number" ? b.sortIndex : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return (b.capturedAt || "").localeCompare(a.capturedAt || "");
      });
    const idx = lane.findIndex(q => q.id === id);
    if (idx < 0) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= lane.length) return;
    const tmp = lane[idx].sortIndex;
    lane[idx].sortIndex = lane[swapWith].sortIndex;
    lane[swapWith].sortIndex = tmp;
    save();
    renderPipeline();
  }

  // HTML5 drag-and-drop state (kun gyldig under én drag-syklus)
  let _dragSrcId = null;

  function wireLaneDragAndDrop(lane, status) {
    if (!lane) return;
    lane.addEventListener("dragover", onLaneDragOver);
    lane.addEventListener("drop", (e) => onLaneDrop(e, status));
    lane.querySelectorAll(".card-draggable").forEach(card => {
      card.addEventListener("dragstart", onCardDragStart);
      card.addEventListener("dragend",   onCardDragEnd);
      card.addEventListener("dragover",  onCardDragOver);
      card.addEventListener("dragleave", onCardDragLeave);
    });
  }

  function onCardDragStart(e) {
    _dragSrcId = this.dataset.id;
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", _dragSrcId); } catch (_) {}
    this.classList.add("dragging");
  }

  function onCardDragEnd() {
    this.classList.remove("dragging");
    document.querySelectorAll(".card.drop-before, .card.drop-after").forEach(c => {
      c.classList.remove("drop-before", "drop-after");
    });
    _dragSrcId = null;
  }

  function onCardDragOver(e) {
    if (!_dragSrcId || this.dataset.id === _dragSrcId) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    // Nullstill indikatorer på andre kort
    document.querySelectorAll(".card.drop-before, .card.drop-after").forEach(c => {
      if (c !== this) c.classList.remove("drop-before", "drop-after");
    });
    const rect = this.getBoundingClientRect();
    const isAbove = (e.clientY - rect.top) < rect.height / 2;
    this.classList.toggle("drop-before", isAbove);
    this.classList.toggle("drop-after", !isAbove);
  }

  function onCardDragLeave() {
    this.classList.remove("drop-before", "drop-after");
  }

  function onLaneDragOver(e) {
    if (!_dragSrcId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onLaneDrop(e, targetStatus) {
    if (!_dragSrcId) return;
    e.preventDefault();

    const src = state.posts.find(p => p.id === _dragSrcId);
    if (!src) return;

    const lane = $("#lane-" + targetStatus);
    const cardEls = Array.from(lane.querySelectorAll(".card"));
    const targetCard = e.target.closest(".card");

    // Bygg ny rekkefølge av ID-er i mål-lane (uten kilden, så setter vi den inn riktig sted)
    const orderedIds = cardEls.map(c => c.dataset.id).filter(id => id !== _dragSrcId);

    if (targetCard && targetCard.dataset.id !== _dragSrcId) {
      const isBefore = targetCard.classList.contains("drop-before");
      const idx = orderedIds.indexOf(targetCard.dataset.id);
      if (idx >= 0) orderedIds.splice(isBefore ? idx : idx + 1, 0, _dragSrcId);
      else orderedIds.push(_dragSrcId);
    } else {
      // Slippet i tom plass → bunnen av lanen
      orderedIds.push(_dragSrcId);
    }

    // Krys-lane-flytt: oppdater status
    if (src.status !== targetStatus) {
      src.status = targetStatus;
    }

    // Renummerér mål-lanen (top→bunn = 0,1,2,...)
    orderedIds.forEach((id, i) => {
      const p = state.posts.find(q => q.id === id);
      if (p) p.sortIndex = i;
    });

    // Cleanup visuals
    document.querySelectorAll(".card.drop-before, .card.drop-after, .card.dragging").forEach(c => {
      c.classList.remove("drop-before", "drop-after", "dragging");
    });
    _dragSrcId = null;

    save();
    renderPipeline();
  }

  // ----------------------------- CALENDAR -----------------------------

  $("#rotation-anchor").addEventListener("change", (e) => {
    state.meta.rotationAnchor = Number(e.target.value);
    state.meta.rotationAnchorWeek = isoWeekStart(new Date());
    save();
    renderCalendar();
  });

  // Pilar-filter på Kalender (mirror av Pipeline-chips)
  let calendarPillar = "all";
  $$("#calendar-pillar-filter .chip").forEach(c => {
    c.addEventListener("click", () => {
      calendarPillar = c.dataset.pillar;
      $$("#calendar-pillar-filter .chip").forEach(x => x.classList.toggle("active", x === c));
      renderCalendar();
    });
  });

  function renderCalendar() {
    $("#rotation-anchor").value = String(state.meta.rotationAnchor || 1);

    const list = $("#calendar-list");
    const startWeek = isoWeekStart(new Date());

    const rows = [];
    for (let i = 0; i < CALENDAR_WEEKS; i++) {
      const weekStart = addDays(startWeek, i * 7);
      const weekEnd   = addDays(weekStart, 6);
      const pillar    = pillarForWeek(weekStart);

      // Pilar-filter: hopp over uker som ikke matcher valgt pilar
      if (calendarPillar !== "all" && String(pillar) !== calendarPillar) continue;

      // any posts scheduled this week?
      const scheduled = state.posts.filter(p =>
        p.scheduledFor && p.scheduledFor >= weekStart && p.scheduledFor <= weekEnd
      ).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

      // also surface the matching ready-drafts for this pillar
      const readyForPillar = state.posts.filter(p =>
        p.status === "ready" && p.pillar === pillar
      );

      const wn = isoWeekNumber(new Date(weekStart + "T00:00:00Z"));
      rows.push(`
        <li class="cal-row ${i === 0 ? "this-week" : ""}">
          <div>
            <div class="cal-week">Uke ${wn}</div>
            <span class="cal-dates">${fmtDate(weekStart)} – ${fmtDate(weekEnd)}</span>
          </div>
          <div>${pillarBadge(pillar)}</div>
          <div>
            <div class="cal-pillar-label">${escapeHtml(PILLARS[pillar].label)}</div>
            <div class="cal-slot">
              ${
                scheduled.length
                  ? scheduled.map(p => `
                      <a href="#" data-id="${p.id}" class="cal-post-link"
                         title="${escapeHtml(p.title)}">→ ${escapeHtml(p.title)}</a>
                    `).join("")
                  : `<span class="empty-slot">${
                      readyForPillar.length
                        ? `${readyForPillar.length} klare drafts for denne pilaren`
                        : "ingenting planlagt"
                    }</span>`
              }
            </div>
          </div>
          <div class="cal-action">
            <button class="linkbtn" data-week="${weekStart}">Plassér…</button>
          </div>
        </li>
      `);
    }

    list.innerHTML = rows.join("");

    list.querySelectorAll(".cal-post-link").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openEdit(a.dataset.id);
      });
    });

    list.querySelectorAll("[data-week]").forEach(btn => {
      btn.addEventListener("click", () => openSlotPicker(btn.dataset.week));
    });
  }

  function openSlotPicker(weekStart) {
    const pillar = pillarForWeek(weekStart);
    const candidates = state.posts.filter(p =>
      (p.status === "ready" || p.status === "draft") && (!p.pillar || p.pillar === pillar)
    );
    if (!candidates.length) {
      alert(`Ingen klare/draft-innlegg for pilar ${pillar} (${PILLARS[pillar].label}).\n\nGå til Pipeline og merk noe som "Klar" først.`);
      return;
    }
    const list = candidates.map((p, i) =>
      `${i + 1}. [${STATUS_LABEL[p.status]}] ${p.title}`
    ).join("\n");
    const ans = prompt(`Velg innlegg for uke som starter ${weekStart}:\n\n${list}\n\nSkriv nummer (1-${candidates.length}):`);
    const n = Number(ans);
    if (!n || n < 1 || n > candidates.length) return;
    const chosen = candidates[n - 1];
    chosen.scheduledFor = addDays(weekStart, 1); // tirsdag som default
    chosen.status = "scheduled";
    upsertPost(chosen);
    renderCalendar();
  }

  // ----------------------------- ARCHIVE -----------------------------

  let archivePillar = "all";
  let archiveSearch = "";

  $$("#archive-pillar-filter .chip").forEach(c => {
    c.addEventListener("click", () => {
      archivePillar = c.dataset.pillar;
      $$("#archive-pillar-filter .chip").forEach(x => x.classList.toggle("active", x === c));
      renderArchive();
    });
  });

  $("#archive-search").addEventListener("input", (e) => {
    archiveSearch = e.target.value.trim().toLowerCase();
    renderArchive();
  });

  function renderArchive() {
    const items = state.posts
      .filter(p => p.status === "published")
      .filter(p => archivePillar === "all" || String(p.pillar) === archivePillar)
      .filter(p => {
        if (!archiveSearch) return true;
        const hay = (p.title + " " + p.body + " " + (p.notes || "")).toLowerCase();
        return hay.includes(archiveSearch);
      })
      .sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));

    const list = $("#archive-list");
    list.innerHTML = items.length
      ? items.map(renderCard).join("")
      : `<li class="empty">${archiveSearch || archivePillar !== "all" ? "Ingen treff i dette filteret." : "Ingen publiserte innlegg ennå."}</li>`;
    bindCardClicks(list);
  }

  // ----------------------------- EDIT MODAL -----------------------------

  const modal = $("#modal-backdrop");

  function openEdit(id) {
    const p = getPost(id);
    if (!p) return;
    $("#edit-id").value         = p.id;
    $("#edit-title").value      = p.title || "";
    $("#edit-body").value       = p.body || "";
    $("#edit-pillar").value     = p.pillar ? String(p.pillar) : "";
    $("#edit-status").value     = p.status || "idea";
    $("#edit-scheduled").value  = p.scheduledFor || "";
    $("#edit-published").value  = p.publishedAt || "";
    $("#edit-linkedin").value   = p.linkedinUrl || "";
    $("#edit-source").value     = p.source || "";
    $("#edit-notes").value      = p.notes || "";
    $("#modal-title").textContent = "Rediger · " + (STATUS_LABEL[p.status] || "");
    modal.hidden = false;
    setTimeout(() => $("#edit-title").focus(), 30);
  }

  function closeEdit() { modal.hidden = true; }
  $("#modal-close").addEventListener("click", closeEdit);
  $("#modal-cancel").addEventListener("click", closeEdit);
  modal.addEventListener("click", e => { if (e.target === modal) closeEdit(); });

  // Reset-knapper for dato-felt — native HTML5 date-input mangler kjapt
  // tøm-aksjon. Disse tømmer feltet i ett klikk.
  $("#edit-scheduled-clear").addEventListener("click", () => {
    $("#edit-scheduled").value = "";
  });
  $("#edit-published-clear").addEventListener("click", () => {
    $("#edit-published").value = "";
  });

  $("#edit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#edit-id").value;
    const existing = getPost(id);
    const oldStatus = existing ? existing.status : null;
    const p = existing || { id, capturedAt: new Date().toISOString() };
    p.title        = $("#edit-title").value.trim();
    p.body         = $("#edit-body").value.trim();
    p.pillar       = $("#edit-pillar").value ? Number($("#edit-pillar").value) : null;
    p.status       = $("#edit-status").value;
    p.scheduledFor = $("#edit-scheduled").value || null;
    p.publishedAt  = $("#edit-published").value || null;
    p.linkedinUrl  = $("#edit-linkedin").value.trim();
    p.source       = $("#edit-source").value.trim();
    p.notes        = $("#edit-notes").value.trim();

    // implicit status nudges
    if (p.publishedAt && p.status !== "published") p.status = "published";
    // Merknad: tidligere flippet vi til "scheduled" når scheduledFor ble satt,
    // men det fjernet posten fra Klar-kolonnen. Nå beholder vi status og
    // viser planlagte poster sortert øverst i Klar-lane (Phase 17).

    // Hvis status endret seg på en eksisterende post, re-tildel sortIndex
    // slik at posten havner på toppen av ny lane (matcher intuisjonen
    // "nettopp flyttet hit = øverst"). Nye posts håndteres allerede av
    // upsertPost via dens egen sortIndex-defaulting.
    if (existing && oldStatus !== p.status) {
      p.sortIndex = minSortIndexInLane(p.status) - 1;
    }

    upsertPost(p);
    closeEdit();
    rerenderActive();
  });

  $("#modal-delete").addEventListener("click", () => {
    const id = $("#edit-id").value;
    if (!id) return;
    if (!confirm("Slett dette innlegget? Dette kan ikke angres.")) return;
    deletePost(id);
    closeEdit();
    rerenderActive();
  });

  function rerenderActive() {
    const active = $(".tab.active")?.dataset.tab || "capture";
    activateTab(active);
  }

  // ----------------------------- IMPORT/EXPORT/RESET -----------------------------

  // iCal-eksport: genererer .ics-fil med planlagte poster.
  // Brukeren importerer til Google Calendar for å få e-post-påminnelser dagen før.
  function generateIcalContent() {
    const scheduled = state.posts.filter(p =>
      p.scheduledFor && (p.status === "ready" || p.status === "scheduled")
    );
    const pad = n => String(n).padStart(2, "0");
    const fmtIcalDate = isoDate => isoDate.replace(/-/g, ""); // YYYYMMDD
    const nowStamp = (() => {
      const d = new Date();
      return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    })();
    const escape = s => String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
    const pillarLabel = p => p && PILLARS[p] ? PILLARS[p].label : "—";

    const events = scheduled.map(p => {
      const dateOnly = String(p.scheduledFor).slice(0, 10);
      const dtStart = fmtIcalDate(dateOnly);
      const next = new Date(dateOnly + "T00:00:00");
      next.setDate(next.getDate() + 1);
      const dtEnd = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
      const summary = `📝 ${p.title || "(uten tittel)"}`;
      const description = [
        `Pilar: ${pillarLabel(p.pillar)}`,
        "",
        p.body || "",
        "",
        "— fra Content Brain",
      ].join("\n");
      return [
        "BEGIN:VEVENT",
        `UID:content-brain-${p.id}@michgeid.github.io`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        `SUMMARY:${escape(summary)}`,
        `DESCRIPTION:${escape(description)}`,
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escape(summary)}`,
        "END:VALARM",
        "END:VEVENT",
      ].join("\r\n");
    });
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Content Brain//Pipeline Schedule//NB",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");
  }

  $("#export-ical").addEventListener("click", () => {
    const scheduled = state.posts.filter(p =>
      p.scheduledFor && (p.status === "ready" || p.status === "scheduled")
    );
    if (!scheduled.length) {
      alert("Ingen planlagte innlegg å eksportere. Sett en dato i 'Planlagt for'-feltet på et innlegg først.");
      return;
    }
    const ics = generateIcalContent();
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `content-brain-schedule-${new Date().toISOString().slice(0,10)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    alert(`📅 Eksporterte ${scheduled.length} ${scheduled.length === 1 ? "innlegg" : "innlegg"}.\n\nNeste steg:\n1. Åpne Google Calendar\n2. Innstillinger → Importer & eksporter → Importér\n3. Velg den nedlastede .ics-filen\n\nKalenderen vil sende deg påminnelse 1 dag før hver publisering.`);
  });

  $("#export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `content-brain-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  $("#import-json").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const incoming = JSON.parse(text);

      // Detekt format:
      // - v0.7+ backup: { version, exportedAt, contentBrain: {...}, ghostwriter: {...} }
      // - Legacy/eksport-JSON: { posts: [...], meta: {...}, voiceProfile: {...} }
      let actualState;
      let ghostwriterKeys = null;

      if (incoming.contentBrain && typeof incoming.contentBrain === "object") {
        actualState = incoming.contentBrain;
        ghostwriterKeys = incoming.ghostwriter || null;
      } else if (incoming.posts && Array.isArray(incoming.posts)) {
        actualState = incoming;
      } else {
        throw new Error("Ugjenkjennelig fil-format. Forventet enten v0.7-backup eller eksport-JSON.");
      }

      if (!Array.isArray(actualState.posts)) {
        throw new Error("Posts-array mangler eller er ikke en array");
      }

      const ghostwriterCount = ghostwriterKeys ? Object.keys(ghostwriterKeys).length : 0;
      const ghostwriterSummary = ghostwriterCount > 0
        ? ` + ${ghostwriterCount} Ghostwriter-keys (samtaler, edit-statistikk, UI-state)`
        : "";

      if (!confirm(`Importér ${actualState.posts.length} innlegg${ghostwriterSummary}?\n\nDette overskriver nåværende state. API-nøkler påvirkes ikke.`)) return;

      state = actualState;
      save();

      // Restorer Ghostwriter-keys (hvis backup-format)
      if (ghostwriterKeys) {
        Object.entries(ghostwriterKeys).forEach(([k, v]) => {
          try { localStorage.setItem(k, JSON.stringify(v)); } catch (err) {}
        });
      }

      // Restorer analytics (hvis i backup-format)
      if (incoming.analytics) {
        try { localStorage.setItem("contentBrain.analytics", JSON.stringify(incoming.analytics)); } catch (err) {}
      }

      rerenderActive();
      alert(`Import vellykket. ${actualState.posts.length} innlegg gjenopprettet${ghostwriterSummary}.`);
    } catch (err) {
      alert("Kunne ikke importere: " + err.message);
    } finally {
      e.target.value = "";
    }
  });

  $("#reset-all").addEventListener("click", () => {
    const typed = prompt(
      "⚠️ ADVARSEL\n\n" +
      "Dette sletter ALL data (posts, Voice Profile, edit-tracker-statistikk).\n" +
      "Pipeline-kortene erstattes av seed-data.\n\n" +
      "Denne handlingen kan IKKE angres uten en backup.\n\n" +
      "For å bekrefte, skriv NULLSTILL nedenfor (store bokstaver):"
    );
    if (typed !== "NULLSTILL") {
      if (typed !== null) alert("Avbrutt — du skrev ikke NULLSTILL eksakt.");
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    try { localStorage.removeItem("contentBrain.analytics"); } catch (e) {}
    state = defaultState();
    save();
    rerenderActive();
    alert("Nullstilling utført. App-en bruker nå seed-data.");
  });

  // Tema-toggle: lyst (default) / mørkt. Lagres i localStorage.
  const THEME_KEY = "contentBrain.theme";
  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      $("#theme-toggle").textContent = "☀ Lyst";
    } else {
      document.documentElement.removeAttribute("data-theme");
      $("#theme-toggle").textContent = "🌙 Mørkt";
    }
  }
  function getInitialTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored) return stored;
    } catch (e) {}
    // Følg system-preferanse hvis ikke valgt
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }
  applyTheme(getInitialTheme());
  $("#theme-toggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
  });

  // Backup-knapp: laster ned full JSON-snapshot med timestamp i filnavnet.
  // Forsvar mot Safari ITP / browser-data-clearing. Indikerer i orange
  // hvis siste backup er > 7 dager siden.
  const BACKUP_KEY = "contentBrain.lastBackup";
  function getLastBackupAt() {
    try {
      const v = localStorage.getItem(BACKUP_KEY);
      return v ? new Date(v) : null;
    } catch (e) { return null; }
  }
  function setLastBackupAt(date) {
    try { localStorage.setItem(BACKUP_KEY, date.toISOString()); } catch (e) {}
  }
  function refreshBackupButton() {
    const btn = $("#backup-now");
    if (!btn) return;
    const last = getLastBackupAt();
    if (!last) {
      btn.classList.add("warn");
      btn.title = "Ingen backup tatt enda. Anbefales jevnlig som forsikring mot data-tap.";
      return;
    }
    const daysSince = (Date.now() - last.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince > 7) {
      btn.classList.add("warn");
      btn.title = `Siste backup: ${Math.round(daysSince)} dager siden. Vurder å ta ny.`;
    } else {
      btn.classList.remove("warn");
      const daysStr = daysSince < 1 ? "i dag" : `${Math.round(daysSince)} dag${Math.round(daysSince) === 1 ? "" : "er"} siden`;
      btn.title = `Siste backup: ${daysStr}`;
    }
  }
  function performBackup() {
    // Inkluder all relevant localStorage i backupen, ikke bare contentBrain.v1.
    // Dette dekker Voice Profile, edit-tracker-data, ghostwriter-UI-state,
    // og evnt. ghostwriter.draft (pågående samtale).
    const backup = {
      version: "v0.7-backup",
      exportedAt: new Date().toISOString(),
      contentBrain: state,
      ghostwriter: {},
      analytics: null,
    };
    try {
      ["ghostwriter.editLearning", "ghostwriter.ui", "ghostwriter.draft"].forEach(k => {
        const v = localStorage.getItem(k);
        if (v) backup.ghostwriter[k] = JSON.parse(v);
      });
    } catch (e) {}
    try {
      const aRaw = localStorage.getItem("contentBrain.analytics");
      if (aRaw) backup.analytics = JSON.parse(aRaw);
    } catch (e) {}
    // API-nøkler eksluderes BEVISST — sikkerhet
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `content-brain-backup-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    setLastBackupAt(new Date());
    refreshBackupButton();
    hideBackupBanner();
  }

  $("#backup-now").addEventListener("click", performBackup);
  refreshBackupButton();

  // ----------------------------- Auto-prompt backup -----------------------------
  // Hvis siste backup > 7 dager (eller aldri tatt): vis banner ved sideåpning.
  // "Senere" gjemmer banner kun for denne sesjonen — kommer tilbake neste gang.

  const BACKUP_BANNER_SESSION_KEY = "contentBrain.backupBannerDismissed";

  function showBackupBannerIfDue() {
    const banner = $("#backup-banner");
    if (!banner) return;

    // Hvis brukeren allerede har dismissert banneret denne sesjonen, ikke vis det igjen
    try {
      if (sessionStorage.getItem(BACKUP_BANNER_SESSION_KEY) === "1") return;
    } catch (e) {}

    const last = getLastBackupAt();
    let textNode = $("#backup-banner-text");
    if (!last) {
      textNode.textContent = "📦 Du har aldri tatt backup. En forsikring mot data-tap (Safari ITP, browser-krasj, etc.).";
      banner.hidden = false;
      return;
    }
    const daysSince = (Date.now() - last.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSince > 7) {
      textNode.textContent = `📦 Det er ${Math.round(daysSince)} dager siden siste backup. Anbefales ukentlig som forsikring.`;
      banner.hidden = false;
    }
  }

  function hideBackupBanner() {
    const banner = $("#backup-banner");
    if (banner) banner.hidden = true;
  }

  $("#backup-banner-now").addEventListener("click", performBackup);
  $("#backup-banner-later").addEventListener("click", () => {
    try { sessionStorage.setItem(BACKUP_BANNER_SESSION_KEY, "1"); } catch (e) {}
    hideBackupBanner();
  });
  showBackupBannerIfDue();

  // ----------------------------- Incognito-deteksjon -----------------------------
  // Chromium incognito har lav storage-quota (~120 MB vs flere GB normalt).
  // Vi sjekker quota og advarer hvis det ser ut som privat fane.
  // Dette er heuristikk, men pålitelig nok for å gi brukeren en advarsel.

  const INCOGNITO_BANNER_DISMISSED_KEY = "contentBrain.incognitoBannerDismissed";

  async function detectAndWarnIncognito() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    try {
      const { quota } = await navigator.storage.estimate();
      // Incognito kvote er typisk < 120 MB. Vanlig browser har flere GB.
      const QUOTA_THRESHOLD = 200_000_000;   // 200 MB grense
      if (quota && quota < QUOTA_THRESHOLD) {
        showIncognitoBanner();
      }
    } catch (e) {}
  }

  function showIncognitoBanner() {
    const banner = $("#incognito-banner");
    if (!banner) return;
    // Hvis dismissert i denne sesjonen, ikke vis igjen
    try {
      if (sessionStorage.getItem(INCOGNITO_BANNER_DISMISSED_KEY) === "1") return;
    } catch (e) {}
    banner.hidden = false;
  }

  $("#incognito-banner-dismiss").addEventListener("click", () => {
    try { sessionStorage.setItem(INCOGNITO_BANNER_DISMISSED_KEY, "1"); } catch (e) {}
    const banner = $("#incognito-banner");
    if (banner) banner.hidden = true;
  });

  detectAndWarnIncognito();

  // Lås-knapp: tømmer StaticCrypt-sesjon og laster siden på nytt.
  // På Pages / encrypted dist: dashbordet krever passord på nytt.
  // På npm run dev: bare en reload, ingen lås (men knapp gir samme effekt).
  $("#lock-now").addEventListener("click", () => {
    if (!confirm("Lås Content Brain? Du må skrive passordet på nytt for å åpne (gjelder kryptert versjon).")) return;
    try {
      Object.keys(sessionStorage).forEach(k => {
        if (k.toLowerCase().includes("staticrypt")) sessionStorage.removeItem(k);
      });
      Object.keys(localStorage).forEach(k => {
        if (k.toLowerCase().includes("staticrypt")) localStorage.removeItem(k);
      });
    } catch (e) {}
    location.reload();
  });

  // ----------------------------- public interface for Ghostwriter -----------------------------

  /**
   * Eksponerer en tynn intern API mot Ghostwriter-modulen.
   * Holder data-modellen ren — Ghostwriter rører aldri state direkte.
   */
  window.ContentBrain = {
    getState() {
      return state;
    },

    addPost(partial) {
      const post = {
        id: newId(),
        status: "draft",
        pillar: null,
        title: "",
        body: "",
        source: "",
        notes: "",
        capturedAt: new Date().toISOString(),
        publishedAt: null,
        scheduledFor: null,
        linkedinUrl: "",
        ...partial,
      };
      upsertPost(post);
      // Re-render Pipeline hvis den er aktiv tab
      if ($(".panel.active")?.id === "pipeline") renderPipeline();
      return post.id;
    },

    /**
     * Oppdater eksisterende post (delvis) — brukes av Ghostwriter for å
     * holde auto-Draft i Pipeline synkronisert med pågående samtale.
     */
    updatePost(id, partial) {
      const existing = state.posts.find(p => p.id === id);
      if (!existing) return false;
      Object.assign(existing, partial);
      save();
      if ($(".panel.active")?.id === "pipeline") renderPipeline();
      return true;
    },

    /**
     * Sjekk om en post finnes. Brukes av Ghostwriter for å unngå
     * stale autoDraftPostId etter at brukeren har slettet en post.
     */
    hasPost(id) {
      return state.posts.some(p => p.id === id);
    },

    saveVoiceProfile(profile) {
      state.voiceProfile = profile;
      save();
    },

    activateTab,

    /**
     * Brukes av "→ Ghostwriter"-knapp på pipeline-kort.
     */
    sendToGhostwriter(postId) {
      const post = getPost(postId);
      if (!post) return;
      activateTab("ghostwriter");
      // Vente til ghostwriter har initialisert
      requestAnimationFrame(() => {
        window.Ghostwriter?.loadFromPipeline?.(post);
      });
    },
  };

  // ----------------------------- bootstrap -----------------------------

  // Set rotation anchor select
  $("#rotation-anchor").value = String(state.meta?.rotationAnchor || 1);

  // First paint
  activateTab("capture");

})();
