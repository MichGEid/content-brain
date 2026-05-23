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
   * @param {Array<string>} [opts.recentAnchors] - Anker-tekster fra siste 8 Inspirasjon-tilføyelser; gir LLM eksklusjons-liste så samme scene ikke kommer to ganger
   * @returns {string}
   */
  function buildSystemPrompt({ voiceProfile, pillarInfo, recentPublished, recentAnchors }) {
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

    // Anker-eksklusjon: tekster fra Pipeline-poster som ble lagt til via
    // Inspirasjon nylig. Forhindrer at samme scene kommer to ganger på rad.
    const cleanedAnchors = Array.isArray(recentAnchors)
      ? recentAnchors
          .map(a => String(a || "").trim())
          .filter(a => a.length > 20)
          .slice(0, 8)
      : [];
    const recentAnchorsBlock = cleanedAnchors.length
      ? `\nRECENTLY USED ANCHORS (do not reproduce these scenes — Michel has already used them in recent posts or Pipeline items):\n` +
        cleanedAnchors.map((a, i) => `  ${i + 1}. ${a.length > 240 ? a.slice(0, 237) + "…" : a}`).join("\n") +
        `\n\nIf an article in this newsletter naturally maps to one of the scenes above, find a DIFFERENT moment from MICHEL'S CONTEXT or the MOMENT ARCHETYPES menu. Repeating a scene immediately makes the post feel canned.`
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
${recentAnchorsBlock}

YOUR TASK:
Read the newsletter and pick 2-3 articles that would make the strongest LinkedIn posts for Michel. Skip articles that are sponsored, off-topic, or generic. It's OK to return fewer than 3 if quality is low — but always return at least 1 if anything works.

DIVERSITY RULE — IMPORTANT:
Aim to surface articles across DIFFERENT pillars when possible. If three strong candidates all map to Pillar 1, only keep the top 1 and look for next-best fits in Pillar 2, 3, or 4. This protects Michel's four-pillar rotation. Single-pillar suggestions are only acceptable if the newsletter genuinely contains nothing else workable for him.

ANCHOR MOMENT QUALITY — THIS IS WHERE MOST SUGGESTIONS FAIL:

The anchor is the FIRST 2-4 sentences of a LinkedIn post Michel could publish. It opens with a specific moment from HIS life and lands on a sharp observation. The reader does not need to be told how the moment connects to the article — the URL handles that.

MOMENT ARCHETYPES — pick from this menu (don't reuse the exact same ones every time):

  Pillar 1 (Connective leadership) — moments at Laerdal:
    • A 1:1 where a team member surfaced a tension you hadn't seen
    • A budget meeting that exposed a structural problem in the org
    • An onboarding conversation that showed what your culture rewards
    • A board-level discussion at Laerdal where you saw a pattern
    • A post-mortem after a project where the failure mode was organizational
    • The moment you decided to stop doing something the team expected you to do

  Pillar 2 (Familie & hockey) — moments at Sørmarka Arena or at home:
    • Before a game: the locker room, what a J2020 player said
    • After a goal — or after a loss — what changed
    • A parent's question on the bench
    • Saturday morning rituals, daughter's hockey bag, the drive to the arena
    • A specific Norwegian phrase one of the girls used
    • Watching a teammate help someone she had just been competing against

  Pillar 3 (Bygger & lærer) — moments in Michel's own building:
    • A bug at 22:00 in Content Brain (or some other project he can name)
    • Switching providers (Ollama → Gemini → Claude) and what it revealed
    • A refactor that broke a test he didn't know existed
    • A choice between two libraries / two architectures
    • The first time a deploy worked end-to-end
    • Reading his own old code and realizing what he'd learned
    • Pair-coding with an LLM and the moment it stopped feeling like magic

  Pillar 4 (Krysspollinering) — moments at the edges of his domains:
    • An MDR or FDA clause that surprised him
    • A competitor (ZOLL/Stryker/Philips/Medtronic) doing something he had to study
    • A conversation with a Norwegian medtech founder
    • An ISO 13485 audit detail that reveals industry maturity
    • A regulatory signal from Brussels or Washington that affects exporters
    • A board discussion at National Health & Life Science Export
    • Crossing wires between two industries that don't usually meet

CRITICAL ANCHOR RULES — these are the most common failure modes, do NOT make them:

1. DO NOT end the anchor with a sentence that ties back to the article. No "This article shows that…", no "This echoes the point about…", no "This translates directly to…", no "The article's point about… resonates with…". The reader has the URL. End on Michel's own observation, full stop.

2. DO NOT write summaries of the article. "Gallup research consistently points to…" is the article talking, not Michel. Find what Michel saw.

3. DO NOT rely on the same three over-used moments. The following anchors have been suggested in prior runs and now feel canned. AVOID them unless absolutely no other archetype fits the article:
   • "The first time I sat down with a competitor's AED — not as a demo, as an actual user…"
   • "My J2020 girls at Sørmarka Arena need exactly the three things Gallup measures…"
   • "Ten phases of Content Brain in three weeks with Claude and Gemini… after 22:00…"

   When you reach for one of these instinctively, STOP and pick a different moment from the MOMENT ARCHETYPES menu. Same pillar, different scene. Examples that would freshen things up:
   • Pillar 4 (competition): an ISO 13485 audit detail, a CE-mark conversation, a partner meeting in the US, an OEM negotiation, a hospital tender response — NOT another AED demo.
   • Pillar 1 (leadership): a budget meeting, an onboarding conversation, a post-mortem, a strategy off-site, a board prep session — NOT another Gallup-Sørmarka bridge.
   • Pillar 3 (building): a refactor that broke a test, a library decision, a deploy failure, a code review of his own old code, pair-coding with an LLM — NOT another 22:00 Content Brain session.

4. NO positive anchor template is provided in this prompt — that is deliberate. You must generate the anchor from MICHEL'S CONTEXT and the MOMENT ARCHETYPES menu, not by copying a model anchor. Start every anchor with a SPECIFIC moment that names a concrete place, person, or action.

BAD ANCHOR (avoid these shapes — they are summaries, not anchors):
  • "This article argues that studying competitors is important."
  • "Gallup research consistently points to hope as the top psychological need."
  • "The instinct is often to remove constraints..."
  • "As a leader, I believe that..."
  • Anything ending in "This article shows…", "This echoes…", or "This translates to…".

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

  /**
   * Bygg én kombinert prompt for paste i claude.ai / ChatGPT / Gemini chat
   * (manuell modus). Chat-UI-er har vanligvis ikke separat system-input,
   * så vi flettes system + user til en enkelt melding med tydelig
   * skille.
   *
   * @param {Object} opts - Samme felt som buildSystemPrompt + url/text fra buildUserPrompt
   * @returns {string}
   */
  function buildCombinedPrompt(opts) {
    const system = buildSystemPrompt(opts);
    const userPart = buildUserPrompt({
      url: opts && opts.url,
      text: opts && opts.text,
    });
    return `${system}\n\n---\n\nUSER INPUT:\n\n${userPart}`;
  }

  // ----------------------------- export -----------------------------

  const InspirerPrompts = {
    buildSystemPrompt,
    buildUserPrompt,
    buildCombinedPrompt,
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
