/* =====================================================================
   Content Brain — analytics/insights.js
   Regelbasert insights-motor som genererer korte observasjoner basert
   på analytics-dataen. Ingen LLM, ingen API-kall — bare statistikk
   over postMetrics + connections + classification.

   Hver insight har:
     • key       (stabil ID for persistert dismiss)
     • tone      ("tip" | "warn" | "good")
     • icon      (emoji)
     • title     (kort, < 80 tegn)
     • detail    (en setning, < 200 tegn)
     • action    (optional: { label, kind, payload } — UI kan rendre knapp)
   ===================================================================== */

(function () {
  "use strict";

  const PILLARS = {
    1: "Connective leadership",
    2: "Familie & hockey",
    3: "Bygger & lærer",
    4: "Krysspollinering",
  };

  // ---------- helpers ----------

  function daysSince(iso) {
    if (!iso) return Infinity;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function avgMetric(arr, key = "engagements") {
    if (!arr.length) return 0;
    return arr.reduce((s, m) => s + (m[key] || 0), 0) / arr.length;
  }

  function pct(n) {
    return Math.round(n * 100);
  }

  // ---------- regler ----------

  function ruleSilentPillar(ctx) {
    // Hvilken pilar har vært stille lengst?
    const out = [];
    [1, 2, 3, 4].forEach(p => {
      const inPillar = ctx.metricsWithPillar.filter(m => m.pillar === p);
      if (!inPillar.length) {
        out.push({
          key: `silent-pillar-${p}-never`,
          tone: "tip",
          icon: "💡",
          title: `Pilar ${p} (${PILLARS[p]}) har ingen poster i analytics-historikken`,
          detail: `Enten har du aldri postet i denne pilaren, eller så er ingen koblet til Pipeline. Vurder å lage en post for å fylle rotasjonen.`,
        });
        return;
      }
      const latest = inPillar
        .map(m => m.date)
        .filter(Boolean)
        .sort()
        .pop();
      const days = daysSince(latest);
      if (days > 28) {
        out.push({
          key: `silent-pillar-${p}-${Math.floor(days / 30)}mo`,
          tone: days > 60 ? "warn" : "tip",
          icon: days > 60 ? "⚠️" : "💡",
          title: `Pilar ${p} har vært stille i ${days} dager`,
          detail: `Siste post i ${PILLARS[p]} var ${new Date(latest).toLocaleDateString("nb-NO")}. 4-pilar-rotasjonen krever én post hver fjerde uke.`,
        });
      }
    });
    return out;
  }

  function ruleBestPillar(ctx) {
    // Hvilken pilar har best engagement-snitt siste 90 dager?
    const cutoff = Date.now() - 90 * 86400000;
    const recent = ctx.metricsWithPillar.filter(m =>
      m.date && new Date(m.date).getTime() >= cutoff && (m.engagements || 0) > 0
    );
    if (recent.length < 4) return [];

    const overallAvg = avgMetric(recent);
    if (overallAvg < 1) return [];

    const perPillar = [1, 2, 3, 4].map(p => {
      const arr = recent.filter(m => m.pillar === p);
      return { pillar: p, count: arr.length, avg: avgMetric(arr) };
    }).filter(x => x.count >= 2);

    if (perPillar.length === 0) return [];

    const best = perPillar.slice().sort((a, b) => b.avg - a.avg)[0];
    const vsAll = (best.avg - overallAvg) / overallAvg;
    if (vsAll < 0.25) return [];

    return [{
      key: `best-pillar-${best.pillar}`,
      tone: "good",
      icon: "📈",
      title: `Pilar ${best.pillar} (${PILLARS[best.pillar]}) trender ${pct(vsAll)}% over snitt`,
      detail: `${best.count} innlegg siste 90 dager, snitt ${Math.round(best.avg)} engasjement. Disse vinklingene treffer — vurder hyppigere poster i denne pilaren.`,
    }];
  }

  function ruleUnderperformingPillar(ctx) {
    const cutoff = Date.now() - 90 * 86400000;
    const recent = ctx.metricsWithPillar.filter(m =>
      m.date && new Date(m.date).getTime() >= cutoff && (m.engagements || 0) > 0
    );
    if (recent.length < 4) return [];

    const overallAvg = avgMetric(recent);
    if (overallAvg < 1) return [];

    const perPillar = [1, 2, 3, 4].map(p => {
      const arr = recent.filter(m => m.pillar === p);
      return { pillar: p, count: arr.length, avg: avgMetric(arr) };
    }).filter(x => x.count >= 2);

    const worst = perPillar.slice().sort((a, b) => a.avg - b.avg)[0];
    if (!worst) return [];
    const vsAll = (worst.avg - overallAvg) / overallAvg;
    if (vsAll > -0.25) return [];

    return [{
      key: `weak-pillar-${worst.pillar}`,
      tone: "warn",
      icon: "📉",
      title: `Pilar ${worst.pillar} (${PILLARS[worst.pillar]}) ligger ${pct(Math.abs(vsAll))}% under snitt`,
      detail: `${worst.count} innlegg siste 90 dager, snitt ${Math.round(worst.avg)} engasjement. Tenk om vinklingen kan oppdateres — eller skipp denne i rotasjonen til ideen sitter.`,
    }];
  }

  function rulePostingCadence(ctx) {
    if (!ctx.allMetrics.length) return [];
    const dates = ctx.allMetrics.map(m => m.date).filter(Boolean).sort();
    if (!dates.length) return [];
    const latest = dates[dates.length - 1];
    const days = daysSince(latest);
    if (days > 14) {
      return [{
        key: `cadence-${Math.floor(days / 7)}w`,
        tone: days > 28 ? "warn" : "tip",
        icon: days > 28 ? "⚠️" : "⏰",
        title: `${days} dager siden siste publiserte innlegg`,
        detail: `Målet er ett innlegg per uke. Sjekk Pipeline for klare drafts du kan publisere.`,
      }];
    }
    return [];
  }

  function ruleBestPostingTime(ctx) {
    // Krever minst 8 innlegg med metrics
    const withMetrics = ctx.allMetrics.filter(m => m.date && (m.engagements || 0) > 0);
    if (withMetrics.length < 8) return [];

    // Aggreger snitt per ukedag×time-bøtte (kun timer 6-22 for nyttige treff)
    const buckets = {};
    withMetrics.forEach(m => {
      const d = new Date(m.date);
      const dow = (d.getDay() + 6) % 7; // Mandag = 0
      const hour = d.getHours();
      if (hour < 6 || hour > 22) return;
      const key = `${dow}-${hour}`;
      if (!buckets[key]) buckets[key] = { sum: 0, count: 0, dow, hour };
      buckets[key].sum += m.engagements;
      buckets[key].count++;
    });
    const candidates = Object.values(buckets).filter(b => b.count >= 2);
    if (!candidates.length) return [];
    candidates.forEach(c => c.avg = c.sum / c.count);
    const best = candidates.sort((a, b) => b.avg - a.avg)[0];

    const days = ["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"];
    return [{
      key: `best-time-${best.dow}-${best.hour}`,
      tone: "good",
      icon: "⏱️",
      title: `Beste posting-tid: ${days[best.dow]} kl ${best.hour}:00`,
      detail: `Snitt ${Math.round(best.avg)} engasjement (${best.count} innlegg). Vurder å planlegge nye poster rundt dette tidsvinduet.`,
    }];
  }

  function ruleNetworkMix(ctx) {
    if (!ctx.classifier || !ctx.state.connections.length) return [];
    const breakdown = ctx.classifier.breakdownByCategory(ctx.state);
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    if (!total) return [];

    const out = [];
    const recruiterPct = breakdown.recruiter / total;
    if (recruiterPct >= 0.05) {
      out.push({
        key: `network-recruiter-${Math.round(recruiterPct * 100)}`,
        tone: "good",
        icon: "🎯",
        title: `${Math.round(recruiterPct * 100)}% av nettverket er hodejegere/rekrutterere`,
        detail: `${breakdown.recruiter} av ${total} connections. God synlighet mot fremtidige arbeidsgivere/styreposisjoner — der målgruppen er.`,
      });
    }

    const peerPct = breakdown.peer / total;
    if (peerPct >= 0.15) {
      out.push({
        key: `network-peer-${Math.round(peerPct * 100)}`,
        tone: "good",
        icon: "🤝",
        title: `${Math.round(peerPct * 100)}% av nettverket er peers (Director+)`,
        detail: `${breakdown.peer} av ${total} connections er senior leadership. Solid bransje-rekkevidde.`,
      });
    }

    if (breakdown.board >= 5) {
      out.push({
        key: `network-board-${Math.floor(breakdown.board / 5)}`,
        tone: "good",
        icon: "🏛️",
        title: `${breakdown.board} styremedlemmer / investorer i nettverket`,
        detail: `Relevant for fremtidige styreposisjoner. Vurder pilar 1 (Connective leadership) innhold som treffer denne gruppen.`,
      });
    }

    return out;
  }

  function ruleEngagementTrend(ctx) {
    // Sammenlign siste 30 dager mot foregående 30 dager
    const now = Date.now();
    const last30 = ctx.allMetrics.filter(m =>
      m.date && new Date(m.date).getTime() >= now - 30 * 86400000 && (m.engagements || 0) > 0
    );
    const prev30 = ctx.allMetrics.filter(m => {
      if (!m.date || (m.engagements || 0) === 0) return false;
      const t = new Date(m.date).getTime();
      return t >= now - 60 * 86400000 && t < now - 30 * 86400000;
    });
    if (last30.length < 2 || prev30.length < 2) return [];
    const a1 = avgMetric(last30);
    const a0 = avgMetric(prev30);
    if (a0 === 0) return [];
    const diff = (a1 - a0) / a0;
    if (Math.abs(diff) < 0.20) return [];
    const direction = diff > 0 ? "økt" : "falt";
    const tone = diff > 0 ? "good" : "warn";
    const icon = diff > 0 ? "📈" : "📉";
    return [{
      key: `trend-30d-${diff > 0 ? "up" : "down"}-${Math.floor(Math.abs(diff) * 10)}`,
      tone,
      icon,
      title: `Snitt-engasjement har ${direction} ${pct(Math.abs(diff))}% siste 30 dager`,
      detail: `${last30.length} innlegg siste måneden (snitt ${Math.round(a1)}) vs ${prev30.length} foregående (snitt ${Math.round(a0)}). ${diff > 0 ? "Hva er du som funker — fortsett." : "Sjekk hvilke pilarer som drar ned — vinkling-spørsmål?"}`,
    }];
  }

  function ruleMetricsCoverage(ctx) {
    const total = ctx.allMetrics.length;
    if (total === 0) return [];
    const withMetrics = ctx.allMetrics.filter(m => (m.impressions || m.likes || m.comments || m.shares) > 0).length;
    const ratio = withMetrics / total;
    if (ratio >= 0.7) return [];
    if (ratio < 0.05 && total > 5) {
      return [{
        key: `metrics-empty`,
        tone: "tip",
        icon: "✏️",
        title: `${total} innlegg importert, men ingen har metrikker enda`,
        detail: `LinkedIns standard eksport mangler per-post metrics. Gå til "✏️ Metrikker"-tab og tast inn for topp-10 innlegg — da skal charts og pilar-snitt fylles ut.`,
      }];
    }
    if (ratio < 0.5) {
      return [{
        key: `metrics-partial-${Math.floor(ratio * 10)}`,
        tone: "tip",
        icon: "✏️",
        title: `Bare ${withMetrics} av ${total} innlegg har metrikker`,
        detail: `Jo flere metrikker du fyller inn, jo mer presise blir charts og pilar-anbefalinger. Mål: minst 15-20 av de viktigste.`,
      }];
    }
    return [];
  }

  // ---------- generate ----------

  function generate({ state, getCb, parser, classifier }) {
    if (!state) return [];
    const cbState = getCb ? getCb() : null;
    const allMetrics = state.postMetrics.map(m => {
      let pillar = null;
      if (m.linkedPostId && cbState && cbState.posts) {
        const p = cbState.posts.find(x => x.id === m.linkedPostId);
        if (p && p.pillar) pillar = p.pillar;
      }
      if (!pillar && m._demoPillar) pillar = m._demoPillar;
      return { ...m, pillar };
    });
    const metricsWithPillar = allMetrics.filter(m => m.pillar);

    const ctx = { state, allMetrics, metricsWithPillar, parser, classifier };
    const rules = [
      ruleMetricsCoverage,
      rulePostingCadence,
      ruleSilentPillar,
      ruleBestPillar,
      ruleUnderperformingPillar,
      ruleBestPostingTime,
      ruleEngagementTrend,
      ruleNetworkMix,
    ];
    let insights = [];
    rules.forEach(r => { insights = insights.concat(r(ctx)); });
    return insights;
  }

  const AnalyticsInsights = {
    generate,
    PILLARS,
  };

  if (typeof window !== "undefined") window.AnalyticsInsights = AnalyticsInsights;
  if (typeof module !== "undefined" && module.exports) module.exports = AnalyticsInsights;
})();
