/* =====================================================================
   Content Brain — analytics/classifier.js
   Heuristisk klassifisering av engagers basert på tittel + firma.

   Fire kategorier som speiler Michels målgruppe:
     • peer       — andre Director/CXO/Head of, helst i medtech/healthtech
     • recruit    — IC-ingeniører, lead engineers, tech leads
     • board      — styremedlemmer, investorer, advisors
     • prospect   — kunder, helseregioner, sykehus, distributører
     • other      — fallback når ingenting matcher

   Filosofi: enkel regex-stack, ingen ML. Bommer den, kan brukeren
   override-e via UI og override-en lagres permanent.
   ===================================================================== */

(function () {
  "use strict";

  const RULES = [
    // BOARD — sjekkes først, sterkeste signaler
    { cat: "board", pattern: /\b(board\s*member|chairman|chairwoman|chair of the board|styreleder|styremedlem)\b/i },
    { cat: "board", pattern: /\b(general partner|managing partner|venture partner|investor|business angel)\b/i },
    { cat: "board", pattern: /\b(advisor|advisory board|rådgiver|advisory)\b/i },

    // PROSPECT — kunder og helsesystemer
    { cat: "prospect", pattern: /\b(helse\s*foretak|sykehus|hospital|helseregion|kommune\s*overlege|simulation\s*center|simuleringssenter)\b/i },
    { cat: "prospect", pattern: /\b(EMS|paramedic|ambulanse|akuttmottak|emergency department|nursing|sykepleier)\b/i },
    { cat: "prospect", pattern: /\b(distributor|reseller|partner manager|procurement|innkjøper)\b/i },
    { cat: "prospect", pattern: /\b(medical director|chief medical|chief nursing|cmio|cmo)\b/i },

    // PEER — senior leadership i tech/medtech
    { cat: "peer", pattern: /\b(director|head of|vp |vice president|svp|evp|chief|cto|ceo|cio|cpo|coo|cfo|chro|cso|cmo)\b/i },
    { cat: "peer", pattern: /\b(partner|managing director|fag\s*ansvarlig|fagansvarlig|fagleder|teknologi\s*direktør|teknologidirektør)\b/i },
    { cat: "peer", pattern: /\b(founder|co-founder|gründer|grunder)\b/i },

    // RECRUIT — IC-engineers, leads
    { cat: "recruit", pattern: /\b(senior\s+(software|engineer|developer)|staff engineer|principal engineer|lead engineer|tech\s*lead|teknisk\s*leder)\b/i },
    { cat: "recruit", pattern: /\b(software (engineer|developer)|backend|frontend|fullstack|full\s*stack|devops|sre|platform engineer|data engineer|ml engineer|ai engineer|machine learning engineer)\b/i },
    { cat: "recruit", pattern: /\b(engineering manager|director of engineering)\b/i },
    { cat: "recruit", pattern: /\b(utvikler|systemutvikler|programmerer|løsningsarkitekt|solution architect|software architect)\b/i },
  ];

  // Selskaper / domener som biaser mot prospect (helse) eller peer (medtech-økosystem)
  const COMPANY_HINTS = [
    { cat: "prospect", pattern: /\b(sykehus|helse[a-z\s]*foretak|hospital|nhs|kaiser|cleveland clinic|mayo clinic|johns hopkins|akuttklinikk)\b/i },
    { cat: "peer",     pattern: /\b(medtronic|philips|ge healthcare|abbott|stryker|baxter|smith\s*&\s*nephew|edwards|teleflex|laerdal)\b/i },
    { cat: "peer",     pattern: /\b(microsoft|google|meta|amazon|apple|oracle|ibm|sap|salesforce|nvidia|openai|anthropic)\b/i },
  ];

  function normalize(s) {
    return String(s || "").toLowerCase().trim();
  }

  /**
   * Heuristisk klassifisering basert kun på tittel + firma.
   * Returner null hvis ingen regel matcher.
   */
  function classifyByHeadline(headline, company = "") {
    const h = String(headline || "");
    const c = String(company || "");
    const combined = `${h} ${c}`;

    // Sjekk tittel-regler i rekkefølge
    for (const rule of RULES) {
      if (rule.pattern.test(combined)) return rule.cat;
    }

    // Sjekk firma-hint som siste resort
    for (const rule of COMPANY_HINTS) {
      if (rule.pattern.test(c)) return rule.cat;
    }

    return null;
  }

  /**
   * Henter kategori for en gitt person. Override > heuristikk > "other".
   * `store` er state-objektet fra analytics-store, `parser` er ikke nødvendig her.
   */
  function getCategory(store, name, headline = "", company = "") {
    const override = store.engagerTags[normalize(name)];
    if (override) return override;
    const heuristic = classifyByHeadline(headline, company);
    return heuristic || "other";
  }

  /**
   * Returnerer en samlet liste av engagers (fra connections + post-spesifikke)
   * med klassifisering, sortert etter en gitt scorer.
   *
   * Foreløpig støtter LinkedIn-eksporten kun din egen connection-liste pluss
   * dine egne reactions/comments. Engagement PR INNLEGG fra andre må man
   * scrape eller bruke et tredjepartsverktøy for å få. Derfor jobber vi
   * her på connection-nivå inntil videre.
   */
  function categorizeConnections(state) {
    const out = state.connections.map(c => ({
      name: c.name,
      headline: c.headline,
      company: c.company,
      connectedAt: c.connectedAt,
      category: getCategory(state, c.name, c.headline, c.company),
    }));
    return out;
  }

  /**
   * Aggregerer breakdown per kategori.
   */
  function breakdownByCategory(state) {
    const counts = { peer: 0, recruit: 0, board: 0, prospect: 0, other: 0 };
    for (const c of state.connections) {
      const cat = getCategory(state, c.name, c.headline, c.company);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }

  const AnalyticsClassifier = {
    classifyByHeadline,
    getCategory,
    categorizeConnections,
    breakdownByCategory,
    RULES,
    COMPANY_HINTS,
  };

  if (typeof window !== "undefined") window.AnalyticsClassifier = AnalyticsClassifier;
  if (typeof module !== "undefined" && module.exports) module.exports = AnalyticsClassifier;
})();
