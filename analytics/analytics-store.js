/* =====================================================================
   Content Brain — analytics/analytics-store.js
   Persistert state for LinkedIn-analytics. Lever helt separat fra
   contentBrain.v1 slik at backup/restore-flowen i app.js ikke trenger
   å vite om analytics for å virke (men backup-funksjonen utvider for
   å inkludere oss).

   Schema (lagret i localStorage["contentBrain.analytics"]):
     {
       postMetrics:   [{ id, date, content, url, contentFingerprint,
                          impressions, likes, comments, shares,
                          engagements, engagementRate, linkedPostId }],
       connections:   [{ name, headline, company, connectedAt }],
       engagerTags:   { "<lowercase name>": "peer"|"recruit"|"board"|"prospect"|"other" },
       imports:       [{ at, format, count, filename }],
       lastImportAt:  isoString
     }
   ===================================================================== */

(function () {
  "use strict";

  const STORAGE_KEY = "contentBrain.analytics";

  function emptyState() {
    return {
      postMetrics: [],
      connections: [],
      engagerTags: {},
      imports: [],
      lastImportAt: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Defensive fill-in
        return Object.assign(emptyState(), parsed);
      }
    } catch (e) {
      console.warn("[analytics-store] kunne ikke parse, faller tilbake til tom state", e);
    }
    return emptyState();
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn("[analytics-store] kunne ikke lagre", e);
      return false;
    }
  }

  // ---------- merging av nye records ----------

  function postKey(p) {
    // URL er sterkeste identifikator; fallback til date+fingerprint
    if (p.url) return "u:" + p.url;
    return "d:" + (p.date || "") + "|" + (p.contentFingerprint || "");
  }

  function connectionKey(c) {
    return (c.name || "").toLowerCase().trim();
  }

  function mergePostMetrics(state, incoming) {
    const byKey = new Map(state.postMetrics.map(p => [postKey(p), p]));
    let added = 0, updated = 0;
    for (const m of incoming) {
      const k = postKey(m);
      const existing = byKey.get(k);
      if (existing) {
        // Behold linkedPostId hvis allerede satt
        Object.assign(existing, m, {
          linkedPostId: existing.linkedPostId || m.linkedPostId || null,
        });
        updated++;
      } else {
        m.id = m.id || ("a_" + Math.random().toString(36).slice(2, 10));
        m.linkedPostId = m.linkedPostId || null;
        state.postMetrics.push(m);
        byKey.set(k, m);
        added++;
      }
    }
    return { added, updated };
  }

  function mergeConnections(state, incoming) {
    const byKey = new Map(state.connections.map(c => [connectionKey(c), c]));
    let added = 0, updated = 0;
    for (const c of incoming) {
      const k = connectionKey(c);
      if (!k) continue;
      const existing = byKey.get(k);
      if (existing) {
        Object.assign(existing, c);
        updated++;
      } else {
        state.connections.push(c);
        byKey.set(k, c);
        added++;
      }
    }
    return { added, updated };
  }

  // ---------- join til Pipeline-posts ----------

  function linkToPipeline(state, getContentBrainState, parser) {
    if (!getContentBrainState) return { linked: 0, unlinked: 0 };
    const cb = getContentBrainState();
    if (!cb || !Array.isArray(cb.posts)) return { linked: 0, unlinked: 0 };
    let linked = 0, unlinked = 0;

    // Bygg index av Pipeline-poster med fingerprint
    const candidates = cb.posts.map(p => {
      const text = ((p.title || "") + " " + (p.body || "")).trim();
      return {
        id: p.id,
        publishedAt: p.publishedAt,
        fp: parser.fingerprint(text),
        pillar: p.pillar,
      };
    });

    for (const m of state.postMetrics) {
      if (m.linkedPostId) continue;
      if (!m.contentFingerprint) { unlinked++; continue; }
      let best = null;
      let bestScore = 0;
      for (const c of candidates) {
        const score = parser.fingerprintScore(m.contentFingerprint, c.fp);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best && bestScore >= 0.4) {
        m.linkedPostId = best.id;
        linked++;
      } else {
        unlinked++;
      }
    }
    return { linked, unlinked };
  }

  // ---------- engager tag management ----------

  function setEngagerTag(state, name, category) {
    const k = (name || "").toLowerCase().trim();
    if (!k) return;
    if (!category || category === "auto") {
      delete state.engagerTags[k];
    } else {
      state.engagerTags[k] = category;
    }
  }

  function getEngagerTag(state, name) {
    const k = (name || "").toLowerCase().trim();
    return state.engagerTags[k] || null;
  }

  // ---------- import history ----------

  function recordImport(state, { format, count, filename }) {
    state.imports.push({
      at: new Date().toISOString(),
      format,
      count: count || 0,
      filename: filename || "",
    });
    state.lastImportAt = new Date().toISOString();
    // Cap historikken på siste 50
    if (state.imports.length > 50) {
      state.imports = state.imports.slice(-50);
    }
  }

  // ---------- enrichment: post → pillar-lookup via Pipeline ----------

  function getPillarForMetric(metric, getContentBrainState) {
    if (!metric.linkedPostId || !getContentBrainState) return null;
    const cb = getContentBrainState();
    const p = cb && cb.posts ? cb.posts.find(x => x.id === metric.linkedPostId) : null;
    return p && p.pillar ? p.pillar : null;
  }

  // ---------- reset ----------

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  const AnalyticsStore = {
    STORAGE_KEY,
    emptyState,
    load,
    save,
    mergePostMetrics,
    mergeConnections,
    linkToPipeline,
    setEngagerTag,
    getEngagerTag,
    recordImport,
    getPillarForMetric,
    postKey,
    connectionKey,
    reset,
  };

  if (typeof window !== "undefined") window.AnalyticsStore = AnalyticsStore;
  if (typeof module !== "undefined" && module.exports) module.exports = AnalyticsStore;
})();
