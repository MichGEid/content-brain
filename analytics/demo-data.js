/* =====================================================================
   Content Brain — analytics/demo-data.js
   Realistisk demo-data for å vise hele analytics-flyten uten å vente
   på LinkedIns dataeksport (kan ta 10 min - 24 t).

   Lager:
     • 16 post-metrics (4 mnd ukentlig × 4 pilarer)
     • 30 connections distribuert over alle 5 kategorier
     • Realistiske impressions/likes/comments-fordelinger basert på
       senior LinkedIn-bruker i medtech-segmentet

   Lagres direkte via AnalyticsStore — samme codepath som ekte import.
   ===================================================================== */

(function () {
  "use strict";

  // ---------- post-templates per pilar ----------

  const POST_TEMPLATES = {
    1: [ // Connective leadership
      { text: "Connective leadership starts with listening — not with strategy. After 18 months leading a cross-functional team, this is what I'm still learning.", performance: "high" },
      { text: "The hardest part of being a director isn't the decisions. It's holding space for ambiguity while your team needs clarity.", performance: "high" },
      { text: "Three things I've stopped saying in 1:1s. And what I say instead.", performance: "medium" },
      { text: "Leadership lesson from a hockey rink: the captain who never plays defense ends up alone.", performance: "high" },
    ],
    2: [ // Familie & hockey
      { text: "My daughter scored her first goal in J2020 this weekend. The smile on her face — and the way she immediately turned to look for her teammates.", performance: "very-high" },
      { text: "Coaching girls' hockey has taught me more about feedback than any management course.", performance: "high" },
      { text: "On the drive home from practice, she said: 'Pappa, I think I want to be a captain someday.'", performance: "very-high" },
      { text: "Saturday morning rinks. Cold hands. Sleep-deprived parents. This is where the next generation learns to lose well.", performance: "medium" },
    ],
    3: [ // Bygger & lærer
      { text: "I'm a Director who still codes. Spent two hours debugging a regex this morning. Here's why I refuse to stop.", performance: "very-high" },
      { text: "Built a small tool this weekend that solved a problem I'd been complaining about for months. The cost was a Saturday.", performance: "high" },
      { text: "The senior engineers I respect most can still explain the basics simply. Without exception.", performance: "medium" },
      { text: "Refactored a 600-line function down to 80 lines today. The dopamine hit hasn't changed since I was 22.", performance: "low" },
    ],
    4: [ // Krysspollinering
      { text: "Norway exports salmon, oil, and — increasingly — health technology. The third one is the most fragile.", performance: "high" },
      { text: "Three things European medtech does better than US medtech. And one thing we do worse.", performance: "high" },
      { text: "MDR was supposed to harmonize. Six years in, the conversations I have with peers across Europe suggest the opposite.", performance: "medium" },
      { text: "Watched a startup pitch their AI-for-emergency-medicine demo today. Brilliant. Also unregulatable in its current form.", performance: "medium" },
    ],
  };

  // Performance buckets (impressions, engagement-rate-target)
  const PERF = {
    "very-high": { impr: [5000, 9000], rate: [0.08, 0.12] },
    "high":      { impr: [2500, 5000], rate: [0.05, 0.08] },
    "medium":    { impr: [1200, 2500], rate: [0.025, 0.05] },
    "low":       { impr: [400, 1200],  rate: [0.01, 0.025] },
  };

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function randInt(min, max) {
    return Math.round(rand(min, max));
  }
  function pickRange(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function generatePostMetrics() {
    // 16 ukentlige innlegg, 4-pilar-rotasjon, går bakover fra 2 dager siden
    const metrics = [];
    const now = Date.now();
    const startBack = 16 * 7; // dager bakover

    for (let i = 0; i < 16; i++) {
      const pillar = ((i % 4) + 1);
      const tmpl = pickRange(POST_TEMPLATES[pillar]);
      const perf = PERF[tmpl.performance];
      const impressions = randInt(perf.impr[0], perf.impr[1]);
      const rate = rand(perf.rate[0], perf.rate[1]);
      const engagements = Math.round(impressions * rate);
      // Splitt engagements i likes/comments/shares (likes ~75%, comments ~20%, shares ~5%)
      const likes    = Math.round(engagements * 0.75);
      const comments = Math.round(engagements * 0.20);
      const shares   = Math.max(0, engagements - likes - comments);

      // Dato: starter for 16 uker siden, en post per uke, tirsdag 09:00
      const daysBack = startBack - i * 7;
      const d = new Date(now - daysBack * 86400000);
      d.setHours(9 + Math.floor(rand(-2, 3)), Math.floor(rand(0, 60)), 0, 0);

      metrics.push({
        date: d.toISOString(),
        url: `https://lnkd.in/demo${i + 1}`,
        content: tmpl.text,
        contentFingerprint: window.AnalyticsParser.fingerprint(tmpl.text),
        impressions,
        likes,
        comments,
        shares,
        engagements,
        engagementRate: impressions > 0 ? engagements / impressions : 0,
        // Pilar tagges direkte i demo-data, så Pipeline-link ikke er nødvendig
        _demoPillar: pillar,
      });
    }
    return metrics;
  }

  // ---------- demo connections ----------

  const DEMO_CONNECTIONS = [
    // peers (Director+, medtech)
    { name: "Erik Hansen",        headline: "VP Engineering",            company: "Medtronic" },
    { name: "Kristine Olsen",     headline: "Director of Digital Health", company: "Philips Healthcare" },
    { name: "Magnus Berg",        headline: "CTO",                        company: "Norwegian Health Tech" },
    { name: "Linnea Karlsson",    headline: "Head of Product",            company: "GE Healthcare" },
    { name: "Pierre Dubois",      headline: "Chief Innovation Officer",   company: "Stryker" },
    { name: "Sara Lindqvist",     headline: "Director, Regulatory Affairs", company: "Abbott" },
    { name: "Tobias Andersen",    headline: "VP Software",                company: "Baxter" },

    // recruiters (hodejegere, talent acquisition)
    { name: "Henrik Solberg",     headline: "Senior Talent Acquisition Partner", company: "Stanton Chase" },
    { name: "Maria Costa",        headline: "Executive Search Consultant",       company: "Heidrick & Struggles" },
    { name: "Tom Olsen",          headline: "Headhunter — Tech Leadership",      company: "Bonum Search" },
    { name: "Yusuf Demir",        headline: "Recruiter",                         company: "Egon Zehnder" },
    { name: "Jonas Eide",         headline: "Talent Partner",                    company: "Mercuri Urval" },
    { name: "Anna Nilsson",       headline: "HR Business Partner",               company: "Visma" },
    { name: "Ravi Patel",         headline: "Talent Acquisition Lead",           company: "Equinor" },
    { name: "Mikkel Larsen",      headline: "Search Consultant",                 company: "Korn Ferry" },

    // board (investors, board members, advisors)
    { name: "Anna Berg",          headline: "Investor",                   company: "Independent" },
    { name: "Lars Petter Hansen", headline: "Managing Partner",           company: "Northzone" },
    { name: "Camilla Stoltenberg", headline: "Board Member",              company: "Helse Sør-Øst" },
    { name: "Erling Bjørklund",   headline: "Advisory Board Member",      company: "Various" },
    { name: "Sofia Karlsson",     headline: "General Partner",            company: "Inventure" },

    // prospects (healthcare, hospitals, EMS)
    { name: "Kari Nordmann",      headline: "Director of IT",             company: "Stavanger Universitetssjukehus" },
    { name: "Per Johansen",       headline: "Medical Director",           company: "Oslo Universitetssykehus" },
    { name: "Astrid Holm",        headline: "Chief Nursing Officer",      company: "St. Olavs Hospital" },
    { name: "Bjørn Sørensen",     headline: "Paramedic Manager",          company: "Helse Bergen" },
    { name: "Inger Lise Dahl",    headline: "CMIO",                       company: "Akershus Universitetssykehus" },
    { name: "Marcus Lindberg",    headline: "Simulation Center Director", company: "Karolinska Institutet" },

    // other (skal falle gjennom heuristikkene)
    { name: "Karoline Vik",       headline: "Photographer",               company: "Freelance" },
    { name: "Jens Holm",          headline: "Lawyer",                     company: "Schjødt" },
    { name: "Mona Bakke",         headline: "Marketing Consultant",       company: "Independent" },
    { name: "Daniel Schmidt",     headline: "Translator",                 company: "Self-employed" },
  ];

  function generateConnections() {
    // Distribuer connectedAt over de siste 18 månedene, vekt nyere
    const out = [];
    const now = Date.now();
    DEMO_CONNECTIONS.forEach((c, i) => {
      // Vekt: nyere connections er mer sannsynlige
      const monthsBack = Math.floor(Math.pow(Math.random(), 1.5) * 18);
      const d = new Date(now - monthsBack * 30 * 86400000);
      d.setHours(10, 0, 0, 0);
      out.push({
        firstName: c.name.split(" ")[0],
        lastName:  c.name.split(" ").slice(1).join(" "),
        name: c.name,
        headline: c.headline,
        company: c.company,
        connectedAt: d.toISOString(),
      });
    });
    return out;
  }

  // ---------- loader ----------

  function loadDemoData(state) {
    const metrics = generatePostMetrics();
    const conns = generateConnections();
    const { mergePostMetrics, mergeConnections, recordImport } = window.AnalyticsStore;
    const a = mergePostMetrics(state, metrics);
    const b = mergeConnections(state, conns);
    recordImport(state, { format: "demo", count: metrics.length + conns.length, filename: "[demo-data]" });
    return {
      addedPosts: a.added,
      updatedPosts: a.updated,
      addedConnections: b.added,
      updatedConnections: b.updated,
    };
  }

  // ---------- Pipeline-seed for demo (kobler metrics direkte) ----------

  function seedDemoPipelinePosts() {
    // Sjelden brukt: hvis brukeren vil ha Pipeline-poster som matcher
    // demo-metricsene, kan vi auto-opprette dem her. Default = false; vi
    // setter heller _demoPillar slik at chart-rendringen kan plukke den
    // opp uten link.
    return null;
  }

  const AnalyticsDemo = {
    loadDemoData,
    generatePostMetrics,
    generateConnections,
    seedDemoPipelinePosts,
  };

  if (typeof window !== "undefined") window.AnalyticsDemo = AnalyticsDemo;
  if (typeof module !== "undefined" && module.exports) module.exports = AnalyticsDemo;
})();
