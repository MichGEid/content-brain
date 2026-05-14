/* =====================================================================
   Content Brain — analytics/csv-parser.js
   Robust CSV-parser for LinkedIns data-eksport.

   LinkedIn lar deg eksportere alle dine data via Settings → Data privacy
   → Get a copy of your data. Vi støtter tre filtyper:
     • Shares.csv / Content.csv         → dine egne innlegg + metrics
     • Reactions.csv                    → hvem som har likt hva
     • Comments.csv                     → kommentarer (Date,URL,Message)
     • Connections.csv                  → nettverkets vekst over tid
   Kolonnenavn varierer mellom eksporter (norsk/engelsk LinkedIn) og over
   tid — derfor matcher vi case-insensitivt og på flere kandidater.
   ===================================================================== */

(function () {
  "use strict";

  // ---------- low-level CSV ----------
  // RFC 4180-aktig parser: håndterer "quoted fields", "" → ", embedded
  // commas og newlines. Vi skipper UTF-8 BOM.

  function parseCsv(text) {
    if (typeof text !== "string") return [];
    // Strip UTF-8 BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }

      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ""; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') {
        row.push(field); rows.push(row);
        row = []; field = ""; i++; continue;
      }
      field += c; i++;
    }
    // flush last field/row
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

    // Drop trailing all-empty rows
    while (rows.length && rows[rows.length - 1].every(v => v === "")) rows.pop();
    if (!rows.length) return [];

    const headers = rows[0].map(h => String(h || "").trim());
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = (rows[r][c] ?? "").trim();
      }
      out.push(obj);
    }
    return out;
  }

  // ---------- header normalisering ----------

  function findColumn(row, candidates) {
    if (!row) return null;
    const keys = Object.keys(row);
    const lowered = keys.map(k => k.toLowerCase());
    for (const cand of candidates) {
      const idx = lowered.indexOf(cand.toLowerCase());
      if (idx !== -1) return keys[idx];
    }
    return null;
  }

  // ---------- format-deteksjon ----------

  function detectFormat(rows, filename = "") {
    const sample = rows && rows[0] ? rows[0] : null;
    const fname = (filename || "").toLowerCase();

    // Filename er det sterkeste signalet
    if (/shares?\.csv$|^content\b/.test(fname)) return "posts";
    if (/comments?\.csv$/.test(fname))          return "comments";
    if (/reactions?\.csv$|likes?\.csv$/.test(fname)) return "reactions";
    if (/connections?\.csv$/.test(fname))       return "connections";
    if (/followers?\.csv$/.test(fname))         return "followers";

    if (!sample) return "unknown";

    // Heuristikker på kolonnenavn
    const has = (cands) => !!findColumn(sample, cands);

    if (has(["ShareCommentary", "Commentary", "Share Commentary"])) return "posts";
    if (has(["First Name", "Last Name", "Email Address"]))           return "connections";
    if (has(["Reaction Type"]) || (has(["Type"]) && has(["Link"])))  return "reactions";
    if (has(["Message"]) && has(["Link"]))                            return "comments";
    if (has(["Impressions", "Engagements"]) && has(["Post URL", "Permalink"])) return "posts";

    return "unknown";
  }

  // ---------- parsing per format ----------

  function toIsoDate(s) {
    if (!s) return null;
    // LinkedIn varierer: "2024-08-13 14:23:11 UTC", "08/13/2024", ISO med Z, etc.
    const trimmed = String(s).trim();
    if (!trimmed) return null;

    // ISO med eller uten klokkeslett
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const d = new Date(trimmed.replace(" ", "T"));
      if (!isNaN(d)) return d.toISOString();
    }

    // US: MM/DD/YYYY
    const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (usMatch) {
      const [_, mm, dd, yyyy] = usMatch;
      const d = new Date(`${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}T12:00:00Z`);
      if (!isNaN(d)) return d.toISOString();
    }

    // EU: DD.MM.YYYY
    const euMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (euMatch) {
      const [_, dd, mm, yyyy] = euMatch;
      const d = new Date(`${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}T12:00:00Z`);
      if (!isNaN(d)) return d.toISOString();
    }

    // Fallback: la JS prøve
    const d = new Date(trimmed);
    return isNaN(d) ? null : d.toISOString();
  }

  function toNumber(s) {
    if (s == null) return 0;
    const n = Number(String(s).replace(/[^\d.-]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function parsePosts(rows) {
    if (!rows.length) return [];
    const sample = rows[0];
    const colDate     = findColumn(sample, ["Date", "Created Date", "Post Date", "Published"]);
    const colContent  = findColumn(sample, ["ShareCommentary", "Commentary", "Share Commentary", "Content", "Post"]);
    const colUrl      = findColumn(sample, ["ShareLink", "Post URL", "Permalink", "URL", "Link"]);
    const colImpr     = findColumn(sample, ["Impressions", "Views"]);
    const colLikes    = findColumn(sample, ["Likes", "Reactions"]);
    const colComments = findColumn(sample, ["Comments"]);
    const colShares   = findColumn(sample, ["Shares", "Reshares"]);
    const colEngage   = findColumn(sample, ["Engagements", "Engagement"]);

    return rows.map(r => {
      const content = (colContent ? r[colContent] : "") || "";
      const date    = colDate ? toIsoDate(r[colDate]) : null;
      const url     = colUrl ? r[colUrl] : "";
      const impressions = colImpr     ? toNumber(r[colImpr])     : 0;
      const likes       = colLikes    ? toNumber(r[colLikes])    : 0;
      const comments    = colComments ? toNumber(r[colComments]) : 0;
      const shares      = colShares   ? toNumber(r[colShares])   : 0;
      const engagements = colEngage   ? toNumber(r[colEngage])   :
                          (likes + comments + shares);
      return {
        date,
        url,
        content,
        contentFingerprint: fingerprint(content),
        impressions,
        likes,
        comments,
        shares,
        engagements,
        engagementRate: impressions > 0 ? engagements / impressions : 0,
      };
    }).filter(p => p.date || p.content);
  }

  function parseReactions(rows) {
    if (!rows.length) return [];
    const sample = rows[0];
    const colDate = findColumn(sample, ["Date"]);
    const colType = findColumn(sample, ["Type", "Reaction Type"]);
    const colLink = findColumn(sample, ["Link", "Post Link", "URL"]);

    return rows.map(r => ({
      date: colDate ? toIsoDate(r[colDate]) : null,
      reactionType: colType ? r[colType] : "LIKE",
      postUrl: colLink ? r[colLink] : "",
      // Reactions.csv inneholder IKKE navn — kun din egen reaksjons-historikk
      // ut. Engagers per innlegg får vi via Comments + manuell oppfølging.
      kind: "reaction-by-me",
    })).filter(r => r.date);
  }

  function parseComments(rows) {
    if (!rows.length) return [];
    const sample = rows[0];
    const colDate    = findColumn(sample, ["Date"]);
    const colLink    = findColumn(sample, ["Link", "Post Link"]);
    const colMessage = findColumn(sample, ["Message", "Comment"]);

    return rows.map(r => ({
      date: colDate ? toIsoDate(r[colDate]) : null,
      postUrl: colLink ? r[colLink] : "",
      message: colMessage ? r[colMessage] : "",
      kind: "comment-by-me",
    })).filter(r => r.date);
  }

  function parseConnections(rows) {
    if (!rows.length) return [];
    const sample = rows[0];
    const colFirst    = findColumn(sample, ["First Name"]);
    const colLast     = findColumn(sample, ["Last Name"]);
    const colHeadline = findColumn(sample, ["Position", "Headline", "Title"]);
    const colCompany  = findColumn(sample, ["Company"]);
    const colDate     = findColumn(sample, ["Connected On", "Connected", "Date"]);

    return rows.map(r => ({
      firstName: colFirst ? r[colFirst] : "",
      lastName:  colLast  ? r[colLast]  : "",
      name: [(colFirst ? r[colFirst] : ""), (colLast ? r[colLast] : "")].filter(Boolean).join(" ").trim(),
      headline: colHeadline ? r[colHeadline] : "",
      company:  colCompany  ? r[colCompany]  : "",
      connectedAt: colDate ? toIsoDate(r[colDate]) : null,
    })).filter(c => c.name);
  }

  // ---------- fingerprint for joining mot Pipeline ----------

  function fingerprint(text) {
    if (!text) return "";
    // Lowercase, fjern URL-er, kollaps whitespace, første 120 tegn
    const cleaned = String(text)
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[#@][\w-]+/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.slice(0, 120);
  }

  function fingerprintScore(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    // Token overlap (Jaccard-ish)
    const ta = new Set(a.split(" ").filter(x => x.length > 2));
    const tb = new Set(b.split(" ").filter(x => x.length > 2));
    if (!ta.size || !tb.size) return 0;
    let inter = 0;
    ta.forEach(t => { if (tb.has(t)) inter++; });
    return inter / Math.min(ta.size, tb.size);
  }

  // ---------- top-level parse(file) ----------

  function parseFile(text, filename = "") {
    const rows = parseCsv(text);
    const format = detectFormat(rows, filename);
    let records = [];
    switch (format) {
      case "posts":       records = parsePosts(rows); break;
      case "reactions":   records = parseReactions(rows); break;
      case "comments":    records = parseComments(rows); break;
      case "connections": records = parseConnections(rows); break;
      default:            records = [];
    }
    return { format, rowCount: rows.length, records };
  }

  // ---------- export ----------

  const AnalyticsParser = {
    parseCsv,
    detectFormat,
    parsePosts,
    parseReactions,
    parseComments,
    parseConnections,
    parseFile,
    fingerprint,
    fingerprintScore,
    findColumn,
    toIsoDate,
    toNumber,
  };

  if (typeof window !== "undefined") window.AnalyticsParser = AnalyticsParser;
  if (typeof module !== "undefined" && module.exports) module.exports = AnalyticsParser;
})();
