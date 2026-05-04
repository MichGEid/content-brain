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

  function upsertPost(post) {
    const i = state.posts.findIndex(p => p.id === post.id);
    if (i >= 0) state.posts[i] = post;
    else state.posts.push(post);
    save();
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

  function renderPipeline() {
    const lanes = ["idea", "draft", "ready"];
    lanes.forEach(status => {
      const items = state.posts.filter(p => {
        if (p.status !== status) return false;
        if (pipelinePillar !== "all" && String(p.pillar) !== pipelinePillar) return false;
        if (pipelineSearch) {
          const hay = (p.title + " " + p.body + " " + (p.notes || "")).toLowerCase();
          if (!hay.includes(pipelineSearch)) return false;
        }
        return true;
      }).sort((a, b) => (b.capturedAt || "").localeCompare(a.capturedAt || ""));

      const lane = $("#lane-" + status);
      $("#count-" + status).textContent = items.length;
      lane.innerHTML = items.length
        ? items.map(renderCard).join("")
        : `<li class="empty">Tom</li>`;
      bindCardClicks(lane);
    });
  }

  function renderCard(p) {
    const meta = [];
    if (p.publishedAt)  meta.push(`Publisert ${fmtDate(p.publishedAt)}`);
    if (p.scheduledFor) meta.push(`Planlagt ${fmtDate(p.scheduledFor)}`);
    if (p.source)       meta.push(`<span title="${escapeHtml(p.source)}">kilde</span>`);
    if (p.linkedinUrl)  meta.push(`<a href="${escapeHtml(p.linkedinUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">LinkedIn ↗</a>`);

    // "→ Ghostwriter" tilgjengelig på alle ikke-publiserte kort
    const ghostwriterBtn = p.status !== "published"
      ? `<button class="linkbtn" data-action="ghostwriter" data-id="${p.id}" onclick="event.stopPropagation()">→ Ghostwriter</button>`
      : "";

    return `
      <li class="card" data-id="${p.id}">
        <div class="card-head">
          ${pillarBadge(p.pillar)}
          <span class="card-title">${escapeHtml(p.title || "(uten tittel)")}</span>
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
  }

  // ----------------------------- CALENDAR -----------------------------

  $("#rotation-anchor").addEventListener("change", (e) => {
    state.meta.rotationAnchor = Number(e.target.value);
    state.meta.rotationAnchorWeek = isoWeekStart(new Date());
    save();
    renderCalendar();
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

  $("#edit-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("#edit-id").value;
    const p = getPost(id) || { id, capturedAt: new Date().toISOString() };
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
    if (p.scheduledFor && p.status !== "published" && p.status !== "scheduled") p.status = "scheduled";

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
      if (!incoming.posts || !Array.isArray(incoming.posts)) throw new Error("Mangler posts[]");
      if (!confirm(`Importér ${incoming.posts.length} innlegg? Dette overskriver nåværende state.`)) return;
      state = incoming;
      save();
      rerenderActive();
    } catch (err) {
      alert("Kunne ikke importere: " + err.message);
    } finally {
      e.target.value = "";
    }
  });

  $("#reset-all").addEventListener("click", () => {
    if (!confirm("Nullstill all data og last seed-data på nytt?")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    save();
    rerenderActive();
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
  $("#backup-now").addEventListener("click", () => {
    // Inkluder all relevant localStorage i backupen, ikke bare contentBrain.v1.
    // Dette dekker Voice Profile, edit-tracker-data, ghostwriter-UI-state,
    // og evnt. ghostwriter.draft (pågående samtale).
    const backup = {
      version: "v0.7-backup",
      exportedAt: new Date().toISOString(),
      contentBrain: state,
      // Snapshot av relevante ghostwriter-keys
      ghostwriter: {},
    };
    try {
      ["ghostwriter.editLearning", "ghostwriter.ui", "ghostwriter.draft"].forEach(k => {
        const v = localStorage.getItem(k);
        if (v) backup.ghostwriter[k] = JSON.parse(v);
      });
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
  });
  refreshBackupButton();

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
