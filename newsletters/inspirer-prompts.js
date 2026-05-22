/* =====================================================================
   Content Brain — newsletters/inspirer-prompts.js
   Bygger system- og user-prompts for "📥 Inspirasjon"-modulen. Brukes av
   inspirer.js til å spørre en LLM om å foreslå 2-3 artikler fra et
   nyhetsbrev som passer Michels 4-pilar-rotasjon og stemme.

   Output fra LLM: en JSON-array med suggestion-objekter (skjema nedenfor).
   Parser-helper ekstraherer JSON robust selv om modellen wrapper det i
   markdown-fence eller annen tekst.
   ===================================================================== */

(function () {
  "use strict";

  /**
   * JSON-skjema som LLM-en blir bedt om å følge. Holdes som konstant og
   * speiles i system-prompten + brukes av parser-validering.
   */
  const SUGGESTION_SCHEMA_DESCRIPTION = `[
  {
    "pillar": 1 | 2 | 3 | 4,
    "title": "working title (English, punchy, no clickbait, max 80 chars)",
    "anchor": "anchor moment in Michel's voice: a concrete scene, observation, or technical detail he could open with. 2-4 sentences. Already in his style — not generic 'as a leader I think...'. End with a hint at the underlying angle, don't spell out the conclusion.",
    "sourceUrl": "the article URL exactly as it appeared in the newsletter",
    "sourceTitle": "the article's own title (for reference)",
    "fitScore": 1-10 (10 = perfect fit for Michel's voice and current rotation),
    "reasoning": "one sentence: why this article fits this pillar for Michel specifically"
  }
]`;

  /**
   * Bygg system-prompten. Bruker Voice Profile (banlist, regler, beskrivelse)
   * og PILLAR_INFO fra ghostwriter/prompts.js for å holde stemme-kalibreringen
   * konsistent med Ghostwriter sin egen draft-generering.
   *
   * @param {Object} opts
   * @param {Object} opts.voiceProfile - VoiceProfile-objektet (banlist, rules, description, examplesByPillar)
   * @param {Object} opts.pillarInfo - PILLAR_INFO fra ghostwriter.prompts
   * @param {Array<{pillar:number,publishedAt:string}>} [opts.recentPublished] - 8 siste publiserte posts for rotasjons-hint
   * @returns {string}
   */
  function buildSystemPrompt({ voiceProfile, pillarInfo, recentPublished }) {
    const banlist = (voiceProfile?.banlist || []).slice(0, 30);
    const rules = (voiceProfile?.rules || []).slice(0, 20);
    const desc = (voiceProfile?.description || []).join(" ");

    const pillarsBlock = [1, 2, 3, 4].map(n => {
      const info = pillarInfo[n];
      if (!info) return "";
      return `Pillar ${n} — ${info.label}\n  Tone: ${info.tone}`;
    }).join("\n\n");

    const recentBlock = (recentPublished && recentPublished.length)
      ? `\nRECENT PUBLISHED ROTATION (last ${recentPublished.length} posts, newest first):\n` +
        recentPublished.map(p => `  - Pillar ${p.pillar || "?"} (${p.publishedAt || "?"})`).join("\n") +
        `\n\nUse this to gently favor pillars that are underrepresented in the recent rotation when scoring fit. Don't force balance — quality of fit comes first.`
      : "";

    return `You are an editorial scout for Michel Eid, Director of Digital Development & SW Engineering at Laerdal Medical (Stavanger, Norway). PhD from École Polytechnique. Board roles in National Health & Life Science Export and UiS MSc Advisory Board. Publishes one LinkedIn post per week following a four-pillar rotation.

PILLARS:

${pillarsBlock}

VOICE PROFILE (Michel's own description of how he writes):
${desc || "(no description provided)"}

PHRASES TO AVOID (his banlist — never use any of these in titles or anchors):
${banlist.length ? banlist.map(p => `  - "${p}"`).join("\n") : "  (none)"}

WRITING RULES:
${rules.length ? rules.map((r, i) => `  ${i + 1}. ${r}`).join("\n") : "  (none)"}
${recentBlock}

YOUR TASK:
Read the newsletter content provided in the user message and pick 2-3 articles that would make the strongest LinkedIn posts for Michel given his pillars, voice, and the recent rotation. Skip articles that are sponsored, off-topic, or generic. It's OK to return fewer than 3 if quality is low — but always return at least 1 if anything in the newsletter could work.

For each article you pick:
- Choose the BEST pillar fit (1, 2, 3, or 4)
- Write a working post title in English, punchy, no clickbait
- Write an anchor moment in Michel's voice — a concrete scene, observation, or technical detail he could open with. Stay in his style. If Pillar 2, anchor in family/hockey. If Pillar 3, anchor in something concrete from his own building. If Pillar 4, name actors and tensions. If Pillar 1, lean strategic and observational. Never write generic "as a leader, I think..." openings.
- Score fit 1-10 (10 = perfect fit for his voice AND current rotation)
- Justify in one sentence

OUTPUT FORMAT:
Return ONLY a JSON array. No prose before or after. No markdown code fence. Just the raw JSON. Use this shape:

${SUGGESTION_SCHEMA_DESCRIPTION}

If nothing in the newsletter fits, return [].`;
  }

  /**
   * Bygg user-prompten — den varierer basert på om vi har en URL (Gemini
   * url_context kan hente den) eller fri tekst (fallback for Claude/Ollama).
   *
   * @param {Object} opts
   * @param {string} [opts.url] - Newsletter-URL (foretrukket for Gemini)
   * @param {string} [opts.text] - Newsletter-tekst (Claude/Ollama)
   * @returns {string}
   */
  function buildUserPrompt({ url, text }) {
    const cleanText = (text || "").trim();
    const cleanUrl = (url || "").trim();

    if (cleanUrl && !cleanText) {
      return `Newsletter URL: ${cleanUrl}\n\nFetch this URL, read the article list, and return the JSON array as instructed.`;
    }
    if (cleanText && !cleanUrl) {
      return `Newsletter content (pasted by user):\n\n${cleanText}\n\nReturn the JSON array as instructed.`;
    }
    if (cleanText && cleanUrl) {
      return `Newsletter URL: ${cleanUrl}\nPasted content also provided below — use whichever is richer:\n\n${cleanText}\n\nReturn the JSON array as instructed.`;
    }
    throw new Error("buildUserPrompt: minst én av { url, text } må være satt");
  }

  /**
   * Robust JSON-parser for LLM-respons. Modellen kan returnere:
   *   - ren JSON
   *   - JSON wrapped i ```json … ```
   *   - JSON med prose før/etter (selv om vi ba om "no prose")
   *
   * Vi finner det første `[…]`-blokken som parser uten feil og returnerer
   * den. Returnerer { ok: true, suggestions: [...] } eller
   * { ok: false, error: "…", raw: rawText }.
   */
  function parseResponse(rawText) {
    if (!rawText || typeof rawText !== "string") {
      return { ok: false, error: "Tom respons fra modellen", raw: rawText };
    }

    // Trinn 1: prøv hele teksten først (i tilfelle modellen var snill)
    const tryParse = s => {
      try {
        const v = JSON.parse(s);
        if (Array.isArray(v)) return v;
      } catch (_) {}
      return null;
    };

    const direct = tryParse(rawText.trim());
    if (direct) return validateAndNormalize(direct);

    // Trinn 2: strip ```json fence hvis det finnes
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      const fenced = tryParse(fenceMatch[1].trim());
      if (fenced) return validateAndNormalize(fenced);
    }

    // Trinn 3: finn første [...] som parser. Naiv men effektiv —
    // gå utenfra og inn, prøv hver lukkende ] mot første åpnende [.
    const firstBracket = rawText.indexOf("[");
    if (firstBracket >= 0) {
      // Prøv successively kortere kandidater (brute-force, lite N)
      for (let end = rawText.lastIndexOf("]"); end > firstBracket; end--) {
        if (rawText[end] !== "]") continue;
        const candidate = rawText.slice(firstBracket, end + 1);
        const parsed = tryParse(candidate);
        if (parsed) return validateAndNormalize(parsed);
      }
    }

    return { ok: false, error: "Kunne ikke finne gyldig JSON-array i respons", raw: rawText };
  }

  /**
   * Filtrer ut suggestions som mangler kritiske felt eller har ugyldige
   * verdier. Normaliser typer (pillar som tall, fitScore innenfor 1-10).
   */
  function validateAndNormalize(arr) {
    const cleaned = [];
    for (const s of arr) {
      if (!s || typeof s !== "object") continue;
      const pillar = Number(s.pillar);
      if (![1, 2, 3, 4].includes(pillar)) continue;
      const title = String(s.title || "").trim();
      const anchor = String(s.anchor || "").trim();
      const sourceUrl = String(s.sourceUrl || "").trim();
      if (!title || !anchor) continue;
      cleaned.push({
        pillar,
        title: title.slice(0, 200),
        anchor: anchor.slice(0, 2000),
        sourceUrl,
        sourceTitle: String(s.sourceTitle || "").trim().slice(0, 200),
        fitScore: Math.max(1, Math.min(10, Number(s.fitScore) || 5)),
        reasoning: String(s.reasoning || "").trim().slice(0, 500),
      });
    }
    return { ok: true, suggestions: cleaned };
  }

  // ----------------------------- export -----------------------------

  const InspirerPrompts = {
    buildSystemPrompt,
    buildUserPrompt,
    parseResponse,
    validateAndNormalize,
    SUGGESTION_SCHEMA_DESCRIPTION,
  };

  if (typeof window !== "undefined") {
    window.NewsletterInspirer = window.NewsletterInspirer || {};
    window.NewsletterInspirer.prompts = InspirerPrompts;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = InspirerPrompts;
  }
})();
