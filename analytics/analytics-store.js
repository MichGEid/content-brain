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
       engagerTags:   { "<lowercase name>": "peer"|"recruiter"|"board"|"prospect"|"other" },
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

  // ---------- sync Pipeline-published posts → tom metric-rad ----------

  /**
   * Idempotent: scanner state.posts og legger til en tom metrics-rad for
   * hver published post med dato og LinkedIn-URL som ikke allerede er
   * representert. Lar Michel slippe LinkedIn-CSV-eksport når han bare
   * vil legge inn metrics for ett nytt innlegg.
   *
   * - Match-prioritet: URL → date+fingerprint
   * - Eksisterende rader oppdateres ikke (CSV-import er sannhetskilden
   *   for ekte tall). Bare missing linkedPostId backfilles.
   * - Returnerer { added, skipped } for testbarhet/logging.
   */
  function syncPublishedPostsToMetrics(state, getContentBrainState, parser) {
    if (!getContentBrainState || !parser || typeof parser.fingerprint !== "function") {
      return { added: 0, skipped: 0 };
    }
    const cb = getContentBrainState();
    if (!cb || !Array.isArray(cb.posts)) return { added: 0, skipped: 0 };

    let added = 0, skipped = 0;

    // Indekser eksisterende metrics for kjapp oppslag
    const byUrl = new Map();
    const byDateFp = new Map();
    for (const m of state.postMetrics) {
      if (m.url) byUrl.set(m.url, m);
      if (m.date && m.contentFingerprint) {
        byDateFp.set(m.date + "|" + m.contentFingerprint, m);
      }
    }

    for (const p of cb.posts) {
      if (p.status !== "published") { skipped++; continue; }
      if (!p.publishedAt || !p.linkedinUrl) { skipped++; continue; }

      const date = String(p.publishedAt).slice(0, 10);
      const text = ((p.title || "") + " " + (p.body || "")).trim();
      const fp = parser.fingerprint(text);

      // Allerede tilstede via URL? Bare backfill linkedPostId.
      if (byUrl.has(p.linkedinUrl)) {
        const existing = byUrl.get(p.linkedinUrl);
        if (!existing.linkedPostId) existing.linkedPostId = p.id;
        skipped++;
        continue;
      }
      // Match via date+fingerprint? Backfill linkedPostId + URL.
      const key = date + "|" + fp;
      if (byDateFp.has(key)) {
        const existing = byDateFp.get(key);
        if (!existing.linkedPostId) existing.linkedPostId = p.id;
        if (!existing.url) existing.url = p.linkedinUrl;
        skipped++;
        continue;
      }

      // Ny rad — populer alt vi vet, sett engagement til 0
      const content = (p.body || p.title || "").trim().slice(0, 280);
      const entry = {
        id: "a_" + Math.random().toString(36).slice(2, 10),
        date,
        content,
        url: p.linkedinUrl,
        contentFingerprint: fp,
        impressions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        engagements: 0,
        engagementRate: 0,
        linkedPostId: p.id,
      };
      state.postMetrics.push(entry);
      byUrl.set(p.linkedinUrl, entry);
      byDateFp.set(key, entry);
      added++;
    }

    return { added, skipped };
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
    syncPublishedPostsToMetrics,
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
