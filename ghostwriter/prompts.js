/* =====================================================================
   Ghostwriter — prompts.js
   Bygger system-prompt og user-prompt fra Voice Profile + Compose-input.

   Validert mot Llama 3.1 8B 2026-04-30:
     - Few-shot eksempler er nøkkelen til at modellen treffer Michels stemme
     - Strenge regler hindrer hallusinerte sitater og oppdiktede anekdoter
     - Bannlistede fraser må listes eksplisitt — vag instruks ignoreres
   ===================================================================== */

(() => {
  "use strict";

  // ----------------------------- pillar metadata -----------------------------

  const PILLAR_INFO = {
    1: {
      label: "Connective leadership",
      tone: "thoughtful, strategic, observational. Reflects on leadership patterns and dynamics. Often analyzes tensions between domains, ownership, and signal-reading. Lands on a quiet observation, not a call to action.",
      template: {
        structureGuidance: "STRUCTURE FOR THIS PILLAR: anchor (1-2 short paragraphs setting the scene or tension) → analysis of the underlying pattern or trade-off (1-2 paragraphs that name the dynamic) → quiet landing that points behind the observation rather than restating it.",
        avoidTransitions: ["The lesson here is", "What this teaches us", "The takeaway is"],
        preferOpenings: ["Start with the observation itself", "Two short sentences setting up tension", "A specific moment, no preamble"],
      },
    },
    2: {
      label: "Familie & hockey",
      tone: "warm, personal, present-tense. Anchored in a specific moment with a child or family setting. The lesson emerges from the moment — never imposed on it. Norwegian phrases from the actual scene land especially well here.",
      template: {
        structureGuidance: "STRUCTURE FOR THIS PILLAR: scene (concrete time, place, child's action or quote) → what happened next (the small turn, the surprising response) → the lesson, but only if it grows naturally out of the scene. Never write 'And the lesson here is...'. Let the reader feel the lesson.",
        avoidTransitions: ["The lesson here is", "What this taught me", "And that's when I realized"],
        preferOpenings: ["Direct quote from the scene (Norwegian if it was Norwegian)", "Time + place anchor: 'Saturday morning. [Setting].'", "The child's action, no setup"],
      },
    },
    3: {
      label: "Bygger & lærer",
      tone: "practical, concrete, technically grounded. A Director who still codes. Shows the work — what was tried, what broke, what was learned. Specific tools, specific decisions. Avoids generic 'learning is important' framing.",
      template: {
        structureGuidance: "STRUCTURE FOR THIS PILLAR: problem (specific, technical) → attempt (what was tried, with concrete details — tool names, configurations, choices) → what broke or surprised → lesson grounded in the specifics. The lesson should be useful to another engineer, not abstract advice.",
        avoidTransitions: ["Learning is important", "Always be learning", "The takeaway"],
        preferOpenings: ["Drop straight into the technical situation", "Name the specific tool/system/problem", "A concrete observation from the work"],
      },
    },
    4: {
      label: "Krysspollinering",
      tone: "analytical, cross-domain. Connects regulation, industry dynamics, commercialization, Norwegian health export. Names specific actors and tensions. Treats the reader as a peer who can follow nuance.",
      template: {
        structureGuidance: "STRUCTURE FOR THIS PILLAR: observation in domain A (specific actor, regulation, or trend) → analog or connection to domain B → the spenningspunkt or opportunity that becomes visible only when both are held in mind. Reader is a peer — don't over-explain context they likely have.",
        avoidTransitions: ["Interestingly", "It's worth noting", "What this all means is"],
        preferOpenings: ["Name the specific signal in domain A", "Pose the cross-domain comparison upfront", "A regulatory or industry detail, no setup"],
      },
    },
  };

  // ----------------------------- tone slider -----------------------------

  /**
   * Per-pilar tone-akser. Default-verdiene er Michels valg fra 2026-05-01:
   * P1: strategisk med personlig piff (30 mot personlig)
   * P2: oppmuntrende, varm, inspirerende (20 mot realistisk)
   * P3: detaljert (20 mot konseptuelt)
   * P4: globalt med fokus på Norge (70 mot globalt)
   *
   * Slider-verdi 0-100. Lavere verdi = nærmere "low"-aksen, høyere = nærmere "high"-aksen.
   */
  const TONE_AXES = {
    1: {
      low: "strategic, abstract, pattern-focused",
      high: "personal, anecdotal, first-person",
      defaultValue: 30,
      description: "strategic ↔ personal",
    },
    2: {
      low: "warm, encouraging, inspirational",
      high: "realistic, grounded, no-nonsense",
      defaultValue: 20,
      description: "encouraging ↔ realistic",
    },
    3: {
      low: "detailed, concrete, technical specifics",
      high: "conceptual, principle-level, abstract",
      defaultValue: 20,
      description: "detailed ↔ conceptual",
    },
    4: {
      low: "Norway-focused, named Norwegian actors and policy",
      high: "globally framed, broad industry trends",
      defaultValue: 70,
      description: "Norway-focused ↔ globally framed",
    },
  };

  /**
   * Generer en tone-instruks som legges til system-prompten.
   * @param {number} pillar
   * @param {number} value 0-100
   */
  function buildToneInstruction(pillar, value) {
    const axis = TONE_AXES[pillar];
    if (!axis) return "";
    const v = Math.max(0, Math.min(100, value));
    let lean;
    if (v < 33) {
      lean = `Lean toward "${axis.low}". Stay clearly on that side of the spectrum without going to the extreme.`;
    } else if (v > 66) {
      lean = `Lean toward "${axis.high}". Stay clearly on that side of the spectrum without going to the extreme.`;
    } else {
      lean = `Hold a balance between "${axis.low}" and "${axis.high}". Neither side should dominate.`;
    }
    return `TONE FOR THIS DRAFT (slider value ${v}/100, axis: ${axis.description}): ${lean}`;
  }

  // ----------------------------- length presets -----------------------------

  const LENGTH_PRESETS = {
    short:    { label: "Kort (80-120 ord)",     wordRange: "80-120 words",  numPredict: 350 },
    standard: { label: "Standard (150-250 ord)", wordRange: "150-250 words", numPredict: 700 },
    long:     { label: "Lang (300-400 ord)",     wordRange: "300-400 words", numPredict: 1200 },
  };

  // ----------------------------- default voice profile -----------------------------

  const DEFAULT_VOICE = {
    description: [
      "thoughtful, precise, short punchy lines",
      "sometimes single-line paragraphs",
      "structure: anchor moment / personal observation → broader reflection → a landing that stays with the reader",
      "English primary; Norwegian quotes from a real scene land especially hard, but never invent them",
      "never end with a question or a hedged 'if you've ever…' to the reader — observations that let the reader land for themselves",
    ].join("; "),
    bannedPhrases: [
      // Generic LinkedIn AI-slop
      "unlock potential", "unlock new ideas",
      "drive meaningful change",
      "navigate the corridors",
      "foster comprehension", "foster a deeper understanding",
      "game-changer",
      "leverage synergies",
      // Time/world clichés (catch all paraphrases)
      "fast-paced",
      "in today's",
      "in this ever-changing",
      "in our modern",
      // Closing/transition clichés
      "one X at a time (as a closing line)",
      "at the end of the day",
      "let's break it down",
      "in conclusion",
      "in essence",
      "to wrap up",
      "the foundation upon which",
      // Hedged or generic relationship/learning phrases
      "real connections happen",
      "shared understanding",
      "active listening",
      "deeper understanding of",
      "build trust and relationships",
      // Reader-hedging openings
      "if you've ever",
      "have you ever",
      "we've all been there",
    ],
    rules: [
      "Never invent Norwegian quotes, sayings, or proverbs. If no Norwegian phrase is verified in the user's input, write entirely in English.",
      "Never invent personal anecdotes, places, colleagues, names, or events. Use only details present in the user's input.",
      "Never speak on behalf of the user's employer or any organization. Do not write claims like 'Laerdal values X', 'We at [company] prioritize Y', or 'Our team believes Z' unless those exact words appear in the user's input. The post is the user's own observation, not corporate communication.",
      "Avoid mechanical triple constructions ('X, Y, and Z'). One triple per post is acceptable; more than that reads as a list, not a thought.",
      "Match the rhythm of the examples: short lines, paragraph breaks for emphasis, occasional one-sentence paragraphs.",
      "Never end with a question to the reader. Never use hedged openings like 'If you've ever…' or 'Have you ever…'. End with an observation that lets the reader land for themselves.",
      "Do not pad with summarizing transitions ('In essence', 'In conclusion', 'To wrap up').",
      "The LANDING must be the very last line of the post. After the landing, do not continue with elaboration, paraphrase, or another paragraph. The post ends when the landing lands.",
    ],
  };

  // ----------------------------- system prompt builder -----------------------------

  /**
   * @param {Object} args
   * @param {Object} args.voiceProfile - { description, bannedPhrases, rules }
   * @param {number} args.pillar - 1..4
   * @param {Array<{title:string, body:string, pillar:number}>} args.examples - few-shot
   * @param {string} args.lengthKey - "short" | "standard" | "long"
   */
  function buildSystemPrompt({ voiceProfile, pillar, examples, lengthKey, toneValue }) {
    const v = { ...DEFAULT_VOICE, ...(voiceProfile || {}) };
    const pillarInfo = PILLAR_INFO[pillar] || PILLAR_INFO[1];
    const lengthInfo = LENGTH_PRESETS[lengthKey] || LENGTH_PRESETS.standard;

    const parts = [];

    parts.push(
      "You write LinkedIn posts in the voice of Michel Eid, " +
      "Director of Digital Development & SW Engineering at Laerdal Medical. " +
      "PhD from École Polytechnique. Based in Stavanger, Norway. " +
      "Norwegian, French, Arabic, English. Member of National Health & Life Science Export board, " +
      "MSc Advisory Board UiS."
    );

    parts.push("");
    parts.push(`PILLAR: ${pillar} — ${pillarInfo.label}`);
    parts.push(`TONE FOR THIS PILLAR: ${pillarInfo.tone}`);

    // Pilar-template (myk guidance, ikke hard regel) — Phase 2
    if (pillarInfo.template) {
      const t = pillarInfo.template;
      parts.push("");
      parts.push(t.structureGuidance);
      if (t.preferOpenings && t.preferOpenings.length) {
        parts.push(`PREFERRED OPENINGS for this pillar: ${t.preferOpenings.map(o => `"${o}"`).join("; ")}.`);
      }
      if (t.avoidTransitions && t.avoidTransitions.length) {
        parts.push(`TRANSITIONS TO AVOID for this pillar: ${t.avoidTransitions.map(a => `"${a}"`).join("; ")}.`);
      }
    }

    // Tone slider — Phase 3
    if (typeof toneValue === "number") {
      const toneInstruction = buildToneInstruction(pillar, toneValue);
      if (toneInstruction) {
        parts.push("");
        parts.push(toneInstruction);
      }
    }

    parts.push("");
    parts.push(`VOICE: ${v.description}`);
    parts.push(`LENGTH: ${lengthInfo.wordRange}.`);

    if (examples && examples.length > 0) {
      parts.push("");
      parts.push(`EXAMPLES OF THIS VOICE (${examples.length} published post${examples.length === 1 ? "" : "s"}):`);
      examples.forEach((ex, i) => {
        parts.push("");
        parts.push(`--- EXAMPLE ${i + 1} (Pillar ${ex.pillar}, "${ex.title}") ---`);
        parts.push(ex.body.trim());
        parts.push(`--- END EXAMPLE ${i + 1} ---`);
      });
    }

    parts.push("");
    parts.push("STRICT RULES:");
    v.rules.forEach((r, i) => parts.push(`${i + 1}. ${r}`));

    if (v.bannedPhrases && v.bannedPhrases.length > 0) {
      parts.push("");
      parts.push("BANNED PHRASES (and any close variant — do not use even paraphrased):");
      v.bannedPhrases.forEach(p => parts.push(`- "${p}"`));
    }

    parts.push("");
    parts.push("OUTPUT FORMAT: Plain text only. No preamble, no headers, no markdown. Just the post body.");

    return parts.join("\n");
  }

  // ----------------------------- user prompt builder -----------------------------

  /**
   * @param {Object} args
   * @param {string} args.anchor - the concrete moment, observation, or tension
   * @param {string} args.idea - optional broader theme/lesson the user wants to land
   * @param {number} args.pillar - 1..4
   * @param {string} args.lengthKey - "short" | "standard" | "long"
   */
  function buildUserPrompt({ anchor, idea, pillar, lengthKey }) {
    const lengthInfo = LENGTH_PRESETS[lengthKey] || LENGTH_PRESETS.standard;
    const pillarInfo = PILLAR_INFO[pillar] || PILLAR_INFO[1];

    const parts = [];
    parts.push(`Write a LinkedIn post for Pillar ${pillar} (${pillarInfo.label}).`);
    parts.push("");
    parts.push("ANCHOR (the concrete moment, observation, or tension to build the post around):");
    parts.push(anchor.trim());

    if (idea && idea.trim()) {
      parts.push("");
      parts.push("BROADER REFLECTION TO LAND ON:");
      parts.push(idea.trim());
    }

    parts.push("");
    parts.push("STRUCTURE: anchor → broader reflection → landing.");
    parts.push("");
    parts.push("- The ANCHOR is the launchpad, not the whole post. Open with it (1-2 short paragraphs).");
    parts.push("- The BROADER REFLECTION is a middle section (1-2 paragraphs) that extends the observation: what pattern does this moment reveal? Why does it matter beyond this single instance? Stay grounded in the dynamics already visible in the anchor — never introduce new people, places, organizations, claims, or facts that aren't in the anchor.");
    parts.push("- The LANDING is a short, observational closing line (one or two sentences). The user's reflection field, if provided, is what the post should land on.");
    parts.push("");
    parts.push(`Target length: ${lengthInfo.wordRange}. If your draft is shorter than this, the middle reflection is too thin — expand it without padding or inventing.`);
    parts.push("Use only the details provided in the ANCHOR. Do not invent additional facts, names, places, organizations, or quotes.");

    return parts.join("\n");
  }

  // ----------------------------- article reaction -----------------------------

  /**
   * Article reaction-modus: brukeren limer inn en artikkel-tekst og
   * sin egen vinkel. Modellen genererer en kort reaksjon i Michels
   * stemme — ikke et sammendrag, en kommentar.
   *
   * Egne regler i tillegg til de vanlige:
   * - Ikke summer artikkelen (1-2 setninger referanse er nok)
   * - Ikke dikt opp sitater fra forfatteren
   * - Ikke nevn navn/orgs som ikke står i den limte teksten
   *
   * @param {Object} args
   * @param {string} args.articleText - artikkel-teksten Michel limte inn
   * @param {string} args.articleUrl - referanse-URL (kan være tom)
   * @param {string} args.angle - Michels egen vinkel: "hva fanget deg?"
   * @param {number} args.pillar - 1..4
   * @param {string} args.lengthKey - "short" | "standard" | "long"
   */
  function buildArticleReactionUserPrompt({ articleText, articleUrl, angle, pillar, lengthKey }) {
    const lengthInfo = LENGTH_PRESETS[lengthKey] || LENGTH_PRESETS.short;
    const pillarInfo = PILLAR_INFO[pillar] || PILLAR_INFO[1];
    const hasText = articleText && articleText.trim();
    const hasUrl = articleUrl && articleUrl.trim();

    const parts = [];
    parts.push(`Write a LinkedIn reaction post for Pillar ${pillar} (${pillarInfo.label}).`);
    parts.push("");

    if (hasText) {
      // Tradisjonell modus: brukeren har limt inn artikkel-teksten
      parts.push("ARTICLE (pasted text, treat as the only source of truth about what the article says):");
      parts.push("---");
      parts.push(articleText.trim().slice(0, 4000));   // beskytt kontekstvindu
      parts.push("---");
      if (hasUrl) {
        parts.push(`(Source URL for reference only, do not embed in the post: ${articleUrl.trim()})`);
      }
    } else if (hasUrl) {
      // URL-only modus: krever url_context-tool på Gemini.
      // Modellen henter URL-en og bruker innholdet som artikkel-tekst.
      parts.push("ARTICLE URL — read this article and use its content as the only source of truth:");
      parts.push(articleUrl.trim());
      parts.push("");
      parts.push("Do NOT embed this URL in the post output. Read the article, then write the reaction.");
    } else {
      // Skal ikke nås — UI valideres før vi kommer hit
      parts.push("(No article text or URL provided.)");
    }

    parts.push("");
    parts.push("MY ANGLE (this is what should drive the post — not a summary of the article):");
    parts.push(angle.trim() || "(no specific angle — pick the most interesting thread for this pillar)");
    parts.push("");
    parts.push("REACTION-MODE RULES:");
    parts.push("1. Reference the article in 1-2 short sentences max. Do not summarize it.");
    parts.push("2. Pivot quickly to the angle and Michel's perspective.");
    parts.push("3. Do not invent quotes, names, organizations, or facts that aren't in the article (whether pasted or fetched).");
    parts.push("4. Do not put words in the article author's mouth — paraphrase only what the article actually says.");
    parts.push("5. Land on Michel's observation about the broader pattern, not a generic takeaway.");
    parts.push("");
    parts.push(`Length: ${lengthInfo.wordRange}. Reactions are typically shorter than original posts.`);

    return parts.join("\n");
  }

  // ----------------------------- regenerate-with-instruction -----------------------------

  /**
   * Bygger en ny user-prompt som ber modellen omarbeide forrige utkast
   * basert på en kort instruks (f.eks. "kortere", "mer personlig").
   */
  function buildRegeneratePrompt({ previousDraft, instruction, pillar, lengthKey }) {
    const lengthInfo = LENGTH_PRESETS[lengthKey] || LENGTH_PRESETS.standard;
    return [
      "Here is the previous draft:",
      "",
      "---",
      previousDraft.trim(),
      "---",
      "",
      `Revise it according to this instruction: ${instruction.trim()}`,
      "",
      `Keep the length around ${lengthInfo.wordRange}. Maintain the voice. Do not invent new facts.`,
    ].join("\n");
  }

  // ----------------------------- example selection -----------------------------

  /**
   * Velg publiserte innlegg som few-shot eksempler:
   * - Hvis brukeren har valgt manuelt i Voice Profile → bruk de (cap 5 for ikke å overlaste prompten)
   * - Ellers → auto-velg fra samme pilar, fall tilbake til andre pilarer (cap 'max', default 3)
   *
   * MANUAL_CAP = 5: Mer enn det blir for mye few-shot for små modeller. 8B/7B-modeller
   * har vanskelig for å holde fokus med 6+ eksempler i system prompt.
   */
  const MANUAL_CAP = 5;

  function selectExamples({ posts, pillar, voiceProfile, max = 3 }) {
    const published = posts.filter(p => p.status === "published" && p.body);

    const manualIds = voiceProfile?.pillars?.[pillar]?.examples || [];
    const manual = manualIds
      .map(id => published.find(p => p.id === id))
      .filter(Boolean);

    let selected;
    if (manual.length > 0) {
      // Brukeren har eksplisitte valg → respekter dem (opp til MANUAL_CAP)
      selected = manual.slice(0, MANUAL_CAP);
    } else {
      // Ingen valg → auto-velg fra samme pilar, fall tilbake til andre
      const samePillar = published.filter(p => p.pillar === pillar);
      const otherPillars = published.filter(p => p.pillar !== pillar);
      selected = [...samePillar, ...otherPillars].slice(0, max);
    }

    return selected.map(p => ({
      title: p.title || "(untitled)",
      body: p.body,
      pillar: p.pillar,
    }));
  }

  // ----------------------------- export -----------------------------

  window.Ghostwriter = window.Ghostwriter || {};
  window.Ghostwriter.prompts = {
    PILLAR_INFO,
    LENGTH_PRESETS,
    DEFAULT_VOICE,
    TONE_AXES,
    buildSystemPrompt,
    buildUserPrompt,
    buildRegeneratePrompt,
    buildArticleReactionUserPrompt,
    buildToneInstruction,
    selectExamples,
  };
})();
