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
   * Konkret anker-kontekst om Michel — gir LLM-en faktisk livsbilde å
   * trekke ankere fra istedenfor å paraphrase artikler. Holdes som konstant
   * og er kjernen i hvorfor forslagene blir personlige istedenfor generiske.
   */
  const MICHEL_CONTEXT = `WHO MICHEL IS — concrete anchors he can write from (use these in your suggestions, don't paraphrase the article):

- Director of Digital Development & SW Engineering at Laerdal Medical, Stavanger. Laerdal makes CPR manikins, AEDs, simulation software for resuscitation training. Direct competitors in resuscitation: ZOLL, Stryker, Philips, Medtronic. Customers: hospitals, nursing schools, ambulance services, defense.
- PhD from École Polytechnique. Multilingual: Norwegian, French, Arabic, English.
- Lagleder (team manager) for the J2020 girls' hockey team at Sørmarka Arena in Stavanger. His daughter plays. Strong recurring angle: girls in sport, structure, hope, ownership over their own work.
- Board roles: National Health & Life Science Export (Norwegian medtech export council), and the UiS MSc Advisory Board (University of Stavanger).
- Still codes daily despite being Director. Recently built "Content Brain" — a local-first dashboard (HTML/JS, localStorage, GitHub Pages + StaticCrypt) to run his own LinkedIn pipeline. Uses Gemini/Claude/Ollama via a Ghostwriter module. Real, ongoing project he can reference.
- Norwegian med-tech reality: MDR (EU Medical Device Regulation), FDA clearances, ISO 13485 quality standards, small-country export economics. Norway punches above its weight in medtech but has to know US/Asia players cold.
- Lives in Stavanger, Norway's west coast. Travels for work to Laerdal partners in US and Asia.`;

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
    // Defensive: description/banlist/rules kan være enten array (DEFAULT_VOICE)
    // eller string (etter at brukeren har redigert i textarea), avhengig av
    // hvor Voice Profile-objektet kommer fra.
    const toArray = v => Array.isArray(v) ? v
      : (typeof v === "string" && v.trim()) ? v.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
      : [];
    const banlist = toArray(voiceProfile?.banlist).slice(0, 30);
    const rules = toArray(voiceProfile?.rules).slice(0, 20);
    const desc = Array.isArray(voiceProfile?.description)
      ? voiceProfile.description.join(" ")
      : String(voiceProfile?.description || "").trim();

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

    return `You are an editorial scout for Michel Eid. He publishes one LinkedIn post per week following a four-pillar rotation. Your job is to read a newsletter and pick 2-3 articles that would make the strongest posts for HIM specifically — not for a generic tech leader.

${MICHEL_CONTEXT}

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
Read the newsletter and pick 2-3 articles that would make the strongest LinkedIn posts for Michel. Skip articles that are sponsored, off-topic, or generic. It's OK to return fewer than 3 if quality is low — but always return at least 1 if anything works.

DIVERSITY RULE — IMPORTANT:
Aim to surface articles across DIFFERENT pillars when possible. If three strong candidates all map to Pillar 1, only keep the top 1 and look for next-best fits in Pillar 2, 3, or 4. This protects Michel's four-pillar rotation. Single-pillar suggestions are only acceptable if the newsletter genuinely contains nothing else workable for him.

ANCHOR MOMENT QUALITY — THIS IS WHERE MOST SUGGESTIONS FAIL:

Do NOT paraphrase the article. Do NOT write "this article addresses..." or "Gallup research shows...". Those are descriptions, not anchors.

Find a SPECIFIC moment Michel could open the post with, drawn from his actual life (see WHO MICHEL IS above):
  - Pillar 1: a moment from work at Laerdal — a 1:1, a team tension, an observation across the SW engineering org. Strategic and observational. NEVER "as a leader, I think...".
  - Pillar 2: a specific moment at Sørmarka Arena — what a J2020 player did or said. Norwegian phrases from the scene land harder than translated paraphrase. Warm and present-tense.
  - Pillar 3: a concrete technical moment from his own building — a bug he hit at 22:00 in Content Brain, a tool decision, a coding session that surprised him. Name the tool, the choice, the moment.
  - Pillar 4: a specific signal he picked up — a regulatory shift (MDR, FDA), a competitor move (ZOLL/Stryker/Philips/Medtronic), an export-policy detail. Name actors, name tensions.

GOOD ANCHOR (Pillar 4, from a "study competitors" article):
"The first time I sat down with a competitor's AED — not as a demo, as an actual user — I noticed three things they had fixed that we hadn't. Sinofsky's point that competitors aren't static hits harder when you've felt the gap yourself."

GOOD ANCHOR (Pillar 1 + 2 bridge, from a "hope as leadership" article):
"My J2020 girls at Sørmarka Arena need exactly the three things Gallup measures in adult employees — clear goals, multiple paths forward, ownership over their own work. Hope isn't softness. It's structure."

GOOD ANCHOR (Pillar 3, from an "AI productivity" article):
"Ten phases of Content Brain in three weeks with Claude and Gemini. Not 'AI did it all' — the real shift was that I changed how I work after 22:00. Productivity gains come from rewiring, not from the technology itself."

BAD ANCHOR (avoid these shapes — they are summaries, not anchors):
- "This article argues that studying competitors is important."
- "Gallup research consistently points to hope as the top psychological need."
- "The instinct is often to remove constraints..."
- "As a leader, I believe that..."

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
    MICHEL_CONTEXT,
  };

  if (typeof window !== "undefined") {
    window.NewsletterInspirer = window.NewsletterInspirer || {};
    window.NewsletterInspirer.prompts = InspirerPrompts;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = InspirerPrompts;
  }
})();
