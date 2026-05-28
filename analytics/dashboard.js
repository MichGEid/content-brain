/* =====================================================================
   Content Brain — analytics/dashboard.js
   Vanilla SVG-charts. Bevisst valg: ingen CDN-avhengighet, ingen
   ekstra bundle-størrelse, full kontroll over stilen. Vi har behov
   for fire chart-typer:
     • bar       — engasjement per innlegg
     • line      — trend over tid
     • pillarBar — engasjement per pilar
     • heatmap   — ukedag × time (CSS-grid)
   ===================================================================== */

(function () {
  "use strict";

  // ---------- utils ----------

  function el(tag, attrs = {}, children = []) {
    const ns = "http://www.w3.org/2000/svg";
    const e = document.createElementNS(ns, tag);
    for (const k in attrs) {
      if (attrs[k] == null) continue;
      e.setAttribute(k, attrs[k]);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtNum(n) {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("nb-NO", { day: "2-digit", month: "short" });
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ---------- bar: engagement per post (top N) ----------

  function renderEngagementBar(container, metrics, opts = {}) {
    const node = typeof container === "string" ? document.querySelector(container) : container;
    if (!node) return;
    clear(node);

    const topN = opts.topN || 10;
    const metric = opts.metric || "engagements"; // engagements|impressions|likes|comments
    const sorted = metrics.slice()
      .filter(m => m[metric] != null)
      .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
      .slice(0, topN);

    if (!sorted.length) {
      node.innerHTML = '<div class="analytics-empty">Ingen data å vise enda. Importér Shares.csv først.</div>';
      return;
    }

    const W = 700, H = Math.max(220, sorted.length * 36 + 40);
    const padL = 240, padR = 60, padT = 16, padB = 16;
    const max = Math.max(1, ...sorted.map(m => m[metric] || 0));
    const barH = (H - padT - padB) / sorted.length - 8;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "analytics-svg" });

    sorted.forEach((m, i) => {
      const y = padT + i * ((H - padT - padB) / sorted.length);
      const v = m[metric] || 0;
      const w = ((W - padL - padR) * v) / max;
      const label = truncate(m.content || m.url || "(uten tekst)", 38);
      const dateLabel = m.date ? fmtDate(m.date) : "";

      // Klikkbar gruppe for hele raden
      const group = el("g", { class: "analytics-bar-group", "data-id": m.id || "" });

      // Usynlig "treff-rektangel" som dekker hele raden — gjør hele radien klikkbar
      group.appendChild(el("rect", {
        x: 0, y: y - 4, width: W, height: barH + 8, fill: "transparent", class: "analytics-bar-hit",
      }));

      group.appendChild(el("text", {
        x: padL - 12, y: y + barH / 2 + 4, "text-anchor": "end",
        class: "analytics-axis-label",
      }, label));

      if (dateLabel) {
        group.appendChild(el("text", {
          x: padL - 12, y: y + barH / 2 + 16, "text-anchor": "end",
          class: "analytics-axis-meta",
        }, dateLabel));
      }

      group.appendChild(el("rect", {
        x: padL, y, width: w, height: barH,
        rx: 4, class: `analytics-bar ${pillarClassFor(m)}`,
      }));

      group.appendChild(el("text", {
        x: padL + w + 8, y: y + barH / 2 + 4,
        class: "analytics-axis-label",
      }, fmtNum(v)));

      // Skjul-knapp på slutten — toggle excluded for outlier-håndtering
      // direkte fra Topp innlegg-charten. Sirkel-bakgrunn så den leses som
      // en ekte klikkbar knapp, ikke bare et tegn.
      const skjulX = W - padR + 28;
      const skjulY = y + barH / 2;
      const skjulGroup = el("g", { class: "analytics-bar-skjul", "data-skjul-id": m.id || "" });
      skjulGroup.appendChild(el("circle", {
        cx: skjulX, cy: skjulY, r: 11,
        class: "analytics-bar-skjul-bg",
      }));
      skjulGroup.appendChild(el("text", {
        x: skjulX, y: skjulY + 5,
        "text-anchor": "middle",
        class: "analytics-bar-skjul-x",
      }, "×"));
      skjulGroup.appendChild(el("title", {}, ["Skjul fra analyse (outlier) — kan reverseres i metrics-tabellen"]));
      group.appendChild(skjulGroup);

      svg.appendChild(group);
    });

    node.appendChild(svg);
  }

  function pillarClassFor(m) {
    if (!m.pillar) return "p-";
    return "p" + m.pillar;
  }

  function truncate(s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  // ---------- line: trend over time ----------

  function renderTrendLine(container, metrics, opts = {}) {
    const node = typeof container === "string" ? document.querySelector(container) : container;
    if (!node) return;
    clear(node);

    const metric = opts.metric || "engagements";
    const data = metrics
      .filter(m => m.date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(m => ({ x: new Date(m.date).getTime(), y: m[metric] || 0, m }));

    if (data.length < 2) {
      node.innerHTML = '<div class="analytics-empty">Trenger minst to datapunkter for trendlinje.</div>';
      return;
    }

    const W = 700, H = 280;
    const padL = 50, padR = 16, padT = 16, padB = 36;
    const xs = data.map(d => d.x), ys = data.map(d => d.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMax = Math.max(1, ...ys);

    const xScale = x => padL + ((x - xMin) / (xMax - xMin || 1)) * (W - padL - padR);
    const yScale = y => H - padB - (y / yMax) * (H - padT - padB);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "analytics-svg" });

    // y-grid (4 linjer)
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i / 4) * (H - padT - padB);
      svg.appendChild(el("line", {
        x1: padL, x2: W - padR, y1: y, y2: y, class: "analytics-grid",
      }));
      const v = Math.round(yMax * (1 - i / 4));
      svg.appendChild(el("text", {
        x: padL - 6, y: y + 4, "text-anchor": "end", class: "analytics-axis-label",
      }, fmtNum(v)));
    }

    // x-akse (4 etiketter)
    for (let i = 0; i <= 4; i++) {
      const x = padL + (i / 4) * (W - padL - padR);
      const t = xMin + (i / 4) * (xMax - xMin);
      svg.appendChild(el("text", {
        x, y: H - padB + 16, "text-anchor": "middle", class: "analytics-axis-label",
      }, fmtDate(new Date(t).toISOString())));
    }

    // line
    const pathD = data.map((d, i) =>
      `${i === 0 ? "M" : "L"} ${xScale(d.x).toFixed(1)} ${yScale(d.y).toFixed(1)}`
    ).join(" ");
    svg.appendChild(el("path", { d: pathD, class: "analytics-line" }));

    // dots — pilarfarget, klikkbare for å åpne post-modal
    data.forEach(d => {
      const dot = el("circle", {
        cx: xScale(d.x), cy: yScale(d.y), r: 4,
        class: `analytics-dot analytics-dot-clickable ${pillarClassFor(d.m)}`,
        "data-metric-id": d.m.id || "",
      });
      // Tooltip via <title>-element
      if (d.m) {
        const titleEl = el("title", {}, [
          `${(d.m.content || d.m.title || "(uten tekst)").slice(0, 80)}\n${d.m[metric] || 0} ${metric}`,
        ]);
        dot.appendChild(titleEl);
      }
      svg.appendChild(dot);
    });

    node.appendChild(svg);

    // Bind klikk på dots → kall analytics post-modal (samme som "Vis detaljer")
    node.querySelectorAll("[data-metric-id]").forEach(dot => {
      dot.addEventListener("click", () => {
        const id = dot.getAttribute("data-metric-id");
        if (id && window.Analytics?._openPostModal) window.Analytics._openPostModal(id);
      });
    });
  }

  // ---------- pillar breakdown ----------

  function renderPillarBars(container, metrics, opts = {}) {
    const node = typeof container === "string" ? document.querySelector(container) : container;
    if (!node) return;
    clear(node);

    const metric = opts.metric || "engagements";
    // Skill mellom poster som har data og poster som ikke har det (0 i alle metrics).
    // Tomme poster skal IKKE drage snittet ned — bare poster med faktisk engagement
    // teller i snitt-beregningen. Tomme vises i drilldown med "mangler tall"-markør.
    const buckets = { 1: [], 2: [], 3: [], 4: [], 0: [] };
    const emptyBuckets = { 1: 0, 2: 0, 3: 0, 4: 0, 0: 0 };
    metrics.forEach(m => {
      const p = m.pillar || 0;
      const val = m[metric] || 0;
      if (val > 0) {
        (buckets[p] || (buckets[p] = [])).push(val);
      } else {
        emptyBuckets[p] = (emptyBuckets[p] || 0) + 1;
      }
    });

    const labels = {
      1: "1 · Leadership",
      2: "2 · Familie & hockey",
      3: "3 · Bygger & lærer",
      4: "4 · Krysspollinering",
      0: "Uten pilar",
    };

    const stats = Object.entries(buckets)
      .filter(([k]) => k !== "0" || buckets["0"].length > 0 || emptyBuckets["0"] > 0)
      .map(([k, arr]) => ({
        pillar: Number(k),
        label: labels[k],
        count: arr.length,
        emptyCount: emptyBuckets[k] || 0,
        avg: arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0,
        total: arr.reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.avg - a.avg);

    if (!stats.length || stats.every(s => s.count === 0)) {
      node.innerHTML = '<div class="analytics-empty">Ingen pilar-tagget innhold matchet enda. Bruk "Link til Pipeline" først.</div>';
      return;
    }

    const max = Math.max(1, ...stats.map(s => s.avg));
    const html = stats.map(s => {
      const countSuffix = s.emptyCount > 0
        ? `<span class="analytics-pillar-count muted small" title="${s.emptyCount} ${s.emptyCount === 1 ? "innlegg uten data" : "innlegg uten data"} — utelatt fra snitt">${s.count} innlegg · ${s.emptyCount} mangler tall</span>`
        : `<span class="analytics-pillar-count muted small">${s.count} innlegg</span>`;
      return `
        <details class="analytics-pillar-row analytics-pillar-row-clickable" data-pillar="${s.pillar}">
          <summary>
            <div class="analytics-pillar-label">
              <span class="dot p${s.pillar || "-"}"></span>
              <span class="analytics-pillar-name">${escapeHtml(s.label)}</span>
              ${countSuffix}
            </div>
            <div class="analytics-pillar-bar">
              <div class="analytics-pillar-fill p${s.pillar || "-"}" style="width:${(s.avg / max) * 100}%"></div>
            </div>
            <div class="analytics-pillar-val">
              <strong>${fmtNum(Math.round(s.avg))}</strong>
              <span class="muted small">snitt ${metric}</span>
            </div>
          </summary>
          <div class="analytics-pillar-drilldown">
            ${renderPillarPostList(metrics.filter(m => (m.pillar || 0) === s.pillar), metric)}
          </div>
        </details>
      `;
    }).join("");
    node.innerHTML = html;

    // Bind klikk på drill-down poster
    node.querySelectorAll("[data-drilldown-id]").forEach(row => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-drilldown-id");
        if (id && window.Analytics?._openPostModal) window.Analytics._openPostModal(id);
      });
    });
  }

  /**
   * Mini-liste over poster bak en pilar — vises som drill-down når brukeren
   * klikker pilar-raden i Per pilar-snitt.
   */
  function renderPillarPostList(metrics, metric) {
    if (!metrics.length) {
      return '<div class="analytics-empty muted small">Ingen innlegg i denne pilaren.</div>';
    }
    const sorted = metrics.slice().sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    return `<ul class="analytics-pillar-drilldown-list">
      ${sorted.map(m => {
        const val = m[metric] || 0;
        const isEmpty = val === 0;
        return `
          <li data-drilldown-id="${escapeHtml(m.id || "")}" class="${isEmpty ? "analytics-drilldown-empty" : ""}">
            <span class="analytics-drilldown-date muted small">${m.date ? fmtDate(m.date) : "—"}</span>
            <span class="analytics-drilldown-content">${escapeHtml(truncate(m.content || m.title || "(uten tekst)", 80))}</span>
            <span class="analytics-drilldown-num">
              ${isEmpty
                ? `<span class="muted small" title="Mangler tall — utelatt fra snitt">⏳ mangler</span>`
                : `<strong>${fmtNum(val)}</strong>`}
            </span>
          </li>
        `;
      }).join("")}
    </ul>`;
  }

  // ---------- heatmap: ukedag × time ----------

  function renderHeatmap(container, metrics) {
    const node = typeof container === "string" ? document.querySelector(container) : container;
    if (!node) return;
    clear(node);

    // Grid: 7 ukedager × 24 timer. Verdi = snitt engagement.
    const grid = Array.from({ length: 7 }, () => Array(24).fill(null));
    const counts = Array.from({ length: 7 }, () => Array(24).fill(0));

    metrics.forEach(m => {
      if (!m.date) return;
      const d = new Date(m.date);
      const dow = (d.getDay() + 6) % 7;     // Mandag = 0
      const hour = d.getHours();
      grid[dow][hour] = (grid[dow][hour] || 0) + (m.engagements || 0);
      counts[dow][hour]++;
    });

    let max = 0;
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 24; j++) {
        if (counts[i][j] > 0) {
          grid[i][j] = grid[i][j] / counts[i][j];
          if (grid[i][j] > max) max = grid[i][j];
        }
      }
    }

    if (max === 0) {
      node.innerHTML = '<div class="analytics-empty">Trenger flere innlegg for å se mønstre i poste-tid.</div>';
      return;
    }

    const days = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
    const html = [];
    html.push('<div class="analytics-heatmap">');
    html.push('<div class="analytics-heatmap-corner"></div>');
    for (let h = 0; h < 24; h++) {
      html.push(`<div class="analytics-heatmap-hourlabel">${h.toString().padStart(2, "0")}</div>`);
    }
    for (let i = 0; i < 7; i++) {
      html.push(`<div class="analytics-heatmap-daylabel">${days[i]}</div>`);
      for (let j = 0; j < 24; j++) {
        const v = grid[i][j];
        const c = counts[i][j];
        const intensity = v ? Math.min(1, v / max) : 0;
        const title = c ? `${days[i]} kl ${j}:00 — snitt ${fmtNum(v)} (${c} innlegg)` : `${days[i]} kl ${j}:00 — ingen data`;
        const style = c ? `background: rgba(59, 130, 246, ${0.1 + intensity * 0.7})` : "";
        html.push(`<div class="analytics-heatmap-cell" title="${escapeHtml(title)}" style="${style}"></div>`);
      }
    }
    html.push("</div>");
    node.innerHTML = html.join("");
  }

  // ---------- top engagers / connections table ----------

  function renderConnectionsTable(container, classified, opts = {}) {
    const node = typeof container === "string" ? document.querySelector(container) : container;
    if (!node) return;

    const filter = opts.filter || null;
    const data = filter ? classified.filter(c => c.category === filter) : classified;
    const sorted = data.slice().sort((a, b) =>
      (b.connectedAt || "").localeCompare(a.connectedAt || "")
    ).slice(0, opts.limit || 50);

    if (!sorted.length) {
      node.innerHTML = '<div class="analytics-empty">Ingen connections importert enda. Last opp Connections.csv.</div>';
      return;
    }

    const rows = sorted.map(c => `
      <tr data-name="${escapeHtml(c.name)}">
        <td>${escapeHtml(c.name)}</td>
        <td class="muted small">${escapeHtml(c.headline || "")}</td>
        <td class="muted small">${escapeHtml(c.company || "")}</td>
        <td>
          <select class="analytics-cat-select" data-name="${escapeHtml(c.name)}">
            ${["peer","recruiter","board","prospect","other"].map(cat =>
              `<option value="${cat}" ${cat === c.category ? "selected" : ""}>${cat}</option>`
            ).join("")}
          </select>
        </td>
      </tr>
    `).join("");
    node.innerHTML = `
      <table class="analytics-table">
        <thead>
          <tr><th>Navn</th><th>Tittel</th><th>Firma</th><th>Kategori</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderCategorySummary(container, breakdown) {
    const node = typeof container === "string" ? document.querySelector(container) : container;
    if (!node) return;
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    if (!total) { node.innerHTML = ""; return; }
    const labels = {
      peer: "Peers (Director+)",
      recruiter: "Hodejegere / rekrutterere",
      board: "Styre / investorer",
      prospect: "Prospects / kunder",
      other: "Andre",
    };
    node.innerHTML = Object.keys(labels).map(k => {
      const v = breakdown[k] || 0;
      const pct = total ? Math.round(v / total * 100) : 0;
      return `
        <div class="analytics-cat-card">
          <div class="analytics-cat-num">${v}</div>
          <div class="analytics-cat-lbl">${labels[k]}</div>
          <div class="analytics-cat-pct muted small">${pct}%</div>
        </div>
      `;
    }).join("");
  }

  // ---------- network growth chart ----------

  function renderNetworkGrowth(container, connections, opts = {}) {
    const node = typeof container === "string" ? document.querySelector(container) : container;
    if (!node) return;
    clear(node);

    const haveDate = connections.filter(c => c.connectedAt);
    if (haveDate.length < 2) {
      node.innerHTML = '<div class="analytics-empty">Trenger flere connections med dato. Last opp Connections.csv eller demo-data.</div>';
      return;
    }

    // Sorter etter connectedAt, beregn kumulativ count per måned
    const sorted = haveDate.slice().sort((a, b) => a.connectedAt.localeCompare(b.connectedAt));
    const byMonth = new Map();
    sorted.forEach(c => {
      const m = c.connectedAt.slice(0, 7); // YYYY-MM
      byMonth.set(m, (byMonth.get(m) || 0) + 1);
    });

    // Bygg series: kumulativ + per-måned
    const months = Array.from(byMonth.keys()).sort();
    let cumulative = 0;
    const data = months.map(m => {
      const monthly = byMonth.get(m);
      cumulative += monthly;
      return { month: m, monthly, cumulative };
    });

    const W = 700, H = 280;
    const padL = 50, padR = 50, padT = 16, padB = 36;
    const yMaxCum = Math.max(1, ...data.map(d => d.cumulative));
    const yMaxMon = Math.max(1, ...data.map(d => d.monthly));

    const xScale = i => padL + (i / Math.max(1, data.length - 1)) * (W - padL - padR);
    const yScaleCum = y => H - padB - (y / yMaxCum) * (H - padT - padB);
    const yScaleMon = y => H - padB - (y / yMaxMon) * (H - padT - padB);

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "analytics-svg" });

    // y-grid (4 linjer) — kumulativ-skala
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i / 4) * (H - padT - padB);
      svg.appendChild(el("line", {
        x1: padL, x2: W - padR, y1: y, y2: y, class: "analytics-grid",
      }));
      const v = Math.round(yMaxCum * (1 - i / 4));
      svg.appendChild(el("text", {
        x: padL - 6, y: y + 4, "text-anchor": "end", class: "analytics-axis-label",
      }, fmtNum(v)));
    }

    // x-akse — viser 4 etiketter
    const step = Math.max(1, Math.floor(data.length / 4));
    for (let i = 0; i < data.length; i += step) {
      svg.appendChild(el("text", {
        x: xScale(i), y: H - padB + 16, "text-anchor": "middle", class: "analytics-axis-label",
      }, data[i].month));
    }

    // Monthly bars (sekundær skala til høyre)
    const barW = Math.max(2, (W - padL - padR) / data.length * 0.6);
    data.forEach((d, i) => {
      const h = (d.monthly / yMaxMon) * (H - padT - padB);
      svg.appendChild(el("rect", {
        x: xScale(i) - barW / 2,
        y: H - padB - h,
        width: barW,
        height: h,
        class: "analytics-bar p4",
        opacity: 0.35,
      }));
    });

    // Cumulative line
    const pathD = data.map((d, i) =>
      `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScaleCum(d.cumulative).toFixed(1)}`
    ).join(" ");
    svg.appendChild(el("path", { d: pathD, class: "analytics-line" }));

    // Dots
    data.forEach((d, i) => {
      svg.appendChild(el("circle", {
        cx: xScale(i), cy: yScaleCum(d.cumulative), r: 3.5,
        class: "analytics-dot p1",
      }));
    });

    // Legend
    const legend = el("g");
    legend.appendChild(el("rect", { x: W - padR - 110, y: padT, width: 110, height: 36, fill: "var(--bg-soft)", stroke: "var(--border)", rx: 4 }));
    legend.appendChild(el("circle", { cx: W - padR - 100, cy: padT + 12, r: 4, class: "analytics-dot p1" }));
    legend.appendChild(el("text", { x: W - padR - 90, y: padT + 16, class: "analytics-axis-label" }, "Kumulativ"));
    legend.appendChild(el("rect", { x: W - padR - 104, y: padT + 22, width: 8, height: 8, class: "analytics-bar p4", opacity: 0.35 }));
    legend.appendChild(el("text", { x: W - padR - 90, y: padT + 30, class: "analytics-axis-label" }, "Per måned"));
    svg.appendChild(legend);

    node.appendChild(svg);
  }

  // ---------- export ----------

  const AnalyticsDashboard = {
    renderEngagementBar,
    renderTrendLine,
    renderPillarBars,
    renderHeatmap,
    renderConnectionsTable,
    renderCategorySummary,
    renderNetworkGrowth,
  };

  if (typeof window !== "undefined") window.AnalyticsDashboard = AnalyticsDashboard;
  if (typeof module !== "undefined" && module.exports) module.exports = AnalyticsDashboard;
})();
