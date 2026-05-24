#!/usr/bin/env node
/* =====================================================================
   Content Brain — test-inspirer.js
   Unit-tester for newsletter-inspirer-prompts.js. Følger samme pattern
   som de andre testfilene: ingen testramme, bare Node + assert.

   Kjør: node scripts/test-inspirer.js
   ===================================================================== */

"use strict";

const assert = require("assert");
const path = require("path");

const prompts = require(path.join(__dirname, "..", "newsletters", "inspirer-prompts.js"));

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`      ${e.message}`);
    failed++;
  }
}

// Helper: realistisk Voice Profile + Pillar Info som speil av prosjektet
function fixtureVoiceProfile() {
  return {
    description: ["thoughtful, precise, short punchy lines", "personal anecdote → broader reflection → a landing that sticks"],
    banlist: ["the lesson here is", "what this teaches us", "at the end of the day", "interestingly"],
    rules: [
      "Never end with 'And that's why I think...'",
      "Norwegian quotes land harder than translated paraphrases",
      "Specific tool names beat generic 'productivity tool'",
    ],
    examplesByPillar: {},
  };
}

function fixturePillarInfo() {
  return {
    1: { label: "Connective leadership", tone: "thoughtful, strategic, observational." },
    2: { label: "Familie & hockey", tone: "warm, personal, present-tense." },
    3: { label: "Bygger & lærer", tone: "practical, concrete, technically grounded." },
    4: { label: "Krysspollinering", tone: "analytical, cross-domain." },
  };
}

console.log("\n— buildSystemPrompt —");

test("inkluderer alle 4 pillars med label og tone", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("Pillar 1"));
  assert.ok(s.includes("Connective leadership"));
  assert.ok(s.includes("Pillar 2"));
  assert.ok(s.includes("Familie & hockey"));
  assert.ok(s.includes("Pillar 3"));
  assert.ok(s.includes("Bygger & lærer"));
  assert.ok(s.includes("Pillar 4"));
  assert.ok(s.includes("Krysspollinering"));
});

test("inkluderer banlist-fraser", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("the lesson here is"));
  assert.ok(s.includes("at the end of the day"));
});

test("inkluderer voice-beskrivelse", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("thoughtful, precise"));
  assert.ok(s.includes("landing that sticks"));
});

test("inkluderer regler", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("Norwegian quotes land harder"));
  assert.ok(s.includes("Specific tool names"));
});

test("håndterer tom voice profile uten å crashe", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: { description: [], banlist: [], rules: [], examplesByPillar: {} },
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("Pillar 1"));
  assert.ok(s.includes("(no description provided)") || s.includes("(none)"));
});

test("inkluderer rotasjons-hint når recentPublished er gitt", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    recentPublished: [
      { pillar: 1, publishedAt: "2026-05-10" },
      { pillar: 3, publishedAt: "2026-05-03" },
    ],
  });
  assert.ok(s.includes("RECENT PUBLISHED ROTATION"));
  assert.ok(s.includes("Pillar 1"));
  assert.ok(s.includes("2026-05-10"));
  assert.ok(s.includes("underrepresented"));
});

test("utelater rotasjons-hint når recentPublished mangler", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(!s.includes("RECENT PUBLISHED ROTATION"));
});

test("håndterer description som STRING (ikke array) — etter at bruker har redigert", () => {
  // Bug fra 2026-05-21: lagret Voice Profile har description som string.
  // Tidligere antok vi alltid array, som krashet med .join is not a function.
  const s = prompts.buildSystemPrompt({
    voiceProfile: {
      description: "thoughtful, precise, short punchy lines",
      banlist: ["the lesson here is"],
      rules: ["Norwegian quotes land harder"],
    },
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("thoughtful, precise"));
  assert.ok(s.includes("the lesson here is"));
});

test("håndterer banlist/rules som STRING (linjeseparert)", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: {
      description: "punchy",
      banlist: "the lesson here is\nat the end of the day",
      rules: "Rule one\nRule two",
    },
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("the lesson here is"));
  assert.ok(s.includes("at the end of the day"));
  assert.ok(s.includes("Rule one"));
  assert.ok(s.includes("Rule two"));
});

test("krever raw JSON i output (ingen markdown fence)", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.toLowerCase().includes("no markdown code fence"));
  assert.ok(s.includes("JSON object"));
  assert.ok(s.includes("rejected"));
});

test("inkluderer Michel-kontekst med Laerdal + konkurrenter + J2020", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("Laerdal"));
  assert.ok(s.includes("ZOLL"));
  assert.ok(s.includes("Stryker"));
  assert.ok(s.includes("J2020"));
  assert.ok(s.includes("Sørmarka"));
  assert.ok(s.includes("Content Brain"));
});

test("inkluderer diversitetsregel for å unngå 3-av-samme-pilar", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.toLowerCase().includes("diversity"));
  // Sjekk at den nevner å begrense seg ved samme pilar
  assert.ok(s.includes("Pillar 1") && s.includes("only keep the top 1"));
});

test("inkluderer ABSOLUTE BAN ON FABRICATED SCENES (v0.14 hallusinasjons-fiks)", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  // Hovedregelen mot hallusinasjon skal være eksplisitt
  assert.ok(s.includes("ABSOLUTE BAN ON FABRICATED"));
  // Sentrale antimønstre skal være listet
  assert.ok(s.includes("Last year I") || s.includes("Last year I…"));
  assert.ok(s.includes("J2020 girls asked me"));
  assert.ok(s.includes("hospital tender"));
  // Sørmarka skal være i MICHEL_CONTEXT og/eller MOMENT ARCHETYPES
  assert.ok(s.includes("Sørmarka"));
});

test("MICHEL_CONTEXT eksporteres som konstant for gjenbruk", () => {
  assert.ok(typeof prompts.MICHEL_CONTEXT === "string");
  assert.ok(prompts.MICHEL_CONTEXT.includes("Laerdal"));
  assert.ok(prompts.MICHEL_CONTEXT.includes("J2020"));
});

test("inkluderer MOMENT ARCHETYPES med varierte moment-typer per pilar", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("MOMENT ARCHETYPES"));
  // Pilar 2: skal ha minst 3 ulike Sørmarka/J2020-moment-typer
  const p2Block = s.split("Pillar 2 (Familie")[1].split("Pillar 3")[0];
  assert.ok(p2Block.includes("locker room") || p2Block.includes("Saturday"));
  assert.ok(p2Block.includes("Norwegian phrase"));
  // Pilar 3: skal ha varierte tech-moment-typer (ikke bare 22:00-bug)
  const p3Block = s.split("Pillar 3 (Bygger")[1].split("Pillar 4")[0];
  assert.ok(p3Block.includes("refactor") || p3Block.includes("library") || p3Block.includes("provider"));
  // Pilar 4: skal nevne MDR/FDA og minst én Laerdal-konkurrent
  const p4Block = s.split("Pillar 4 (Krysspollinering")[1].split("CRITICAL")[0];
  assert.ok(p4Block.includes("MDR") || p4Block.includes("FDA"));
  assert.ok(p4Block.includes("ZOLL") || p4Block.includes("Stryker"));
});

test("inkluderer RECENTLY USED ANCHORS når recentAnchors er gitt", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    recentAnchors: [
      "The first time I sat down with a competitor's AED — not as a demo, as an actual user — I noticed three things they had fixed.",
      "My J2020 girls at Sørmarka Arena need exactly the three things Gallup measures.",
    ],
  });
  assert.ok(s.includes("RECENTLY USED ANCHORS"));
  assert.ok(s.includes("competitor's AED"));
  assert.ok(s.includes("Sørmarka"));
  assert.ok(s.toLowerCase().includes("do not reproduce"));
});

test("utelater RECENTLY USED-blokken når recentAnchors mangler eller er tom", () => {
  const s1 = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(!s1.includes("RECENTLY USED ANCHORS"));
  const s2 = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    recentAnchors: [],
  });
  assert.ok(!s2.includes("RECENTLY USED ANCHORS"));
});

test("filtrerer bort tomme og for korte ankere fra eksklusjons-listen", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    recentAnchors: [
      "",                                                   // tom
      "kort",                                               // for kort (< 20 tegn)
      "Dette er en lang nok anker-tekst til å bli inkludert i eksklusjons-listen.",
    ],
  });
  assert.ok(s.includes("RECENTLY USED ANCHORS"));
  assert.ok(s.includes("lang nok anker-tekst"));
  assert.ok(!s.match(/^\s+1\.\s+kort/m)); // "kort" skal ikke være enumerert
});

test("kapper ankere over 240 tegn med ellipse", () => {
  const longAnchor = "A".repeat(300);
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    recentAnchors: [longAnchor],
  });
  assert.ok(s.includes("…"));
  // Skal ikke inneholde full 300-A-streng
  assert.ok(!s.includes("A".repeat(280)));
});

test("Schema-eksempel beskriver framing+momentSuggestions+landing", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  // Skjemaet skal beskrive de tre nye feltene
  assert.ok(s.includes('"framing"'));
  assert.ok(s.includes('"momentSuggestions"'));
  assert.ok(s.includes('"landing"'));
  // Konkrete instruksjoner skal være med
  assert.ok(s.includes("filler-prompts") || s.includes("filler-suggestions"));
});

test("inkluderer forbud mot tilbakehenvisning til artikkelen i hale-setning", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  // Eksplisitt blokkering av "this article shows / echoes / translates"
  assert.ok(s.includes("This article shows"));
  assert.ok(s.includes("This echoes"));
  assert.ok(s.includes("This translates"));
});

test("blokkliste mot overbrukte ankere er eksplisitt", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  // De tre overbrukte ankerne skal være listet som "AVOID them"
  assert.ok(s.includes("AVOID") || s.includes("avoid"));
  assert.ok(s.includes("competitor's AED"));
  assert.ok(s.includes("J2020"));
  assert.ok(s.includes("Content Brain"));
  // Konkrete fresh-up-alternativer skal være med per pilar
  assert.ok(s.includes("ISO 13485") || s.includes("CE-mark") || s.includes("tender"));
  assert.ok(s.includes("budget meeting") || s.includes("post-mortem") || s.includes("onboarding conversation"));
});

console.log("\n— buildUserPrompt —");

test("med URL: ber modellen hente URL-en", () => {
  const u = prompts.buildUserPrompt({ url: "https://example.com/newsletter/1", text: "" });
  assert.ok(u.includes("https://example.com/newsletter/1"));
  assert.ok(u.toLowerCase().includes("fetch"));
});

test("med tekst: refererer til pasted content", () => {
  const u = prompts.buildUserPrompt({ url: "", text: "Article 1: foo\nArticle 2: bar" });
  assert.ok(u.includes("Article 1: foo"));
  assert.ok(u.toLowerCase().includes("pasted by user"));
});

test("med både URL og tekst: tar med begge", () => {
  const u = prompts.buildUserPrompt({
    url: "https://example.com",
    text: "Article 1: foo",
  });
  assert.ok(u.includes("https://example.com"));
  assert.ok(u.includes("Article 1: foo"));
});

test("kaster feil hvis begge er tomme", () => {
  assert.throws(() => prompts.buildUserPrompt({ url: "", text: "" }));
  assert.throws(() => prompts.buildUserPrompt({}));
});

console.log("\n— parseResponse —");

test("ren JSON-array parser direkte (legacy format)", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "T", anchor: "A", sourceUrl: "u", fitScore: 7 }
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions.length, 1);
  assert.strictEqual(r.suggestions[0].pillar, 1);
  assert.strictEqual(r.suggestions[0].fitScore, 7);
  // Legacy-format gir tom rejected
  assert.deepStrictEqual(r.rejected, []);
});

test("nytt JSON-objekt-format med suggestions + rejected", () => {
  const raw = JSON.stringify({
    suggestions: [
      { pillar: 1, title: "Keep this", anchor: "Anchor here", fitScore: 8 }
    ],
    rejected: [
      { sourceTitle: "AI survey", sourceUrl: "https://x/y", reason: "Pure data, no angle." },
      { sourceTitle: "Best employee → worst manager", reason: "LinkedIn cliché." }
    ]
  });
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions.length, 1);
  assert.strictEqual(r.rejected.length, 2);
  assert.strictEqual(r.rejected[0].sourceTitle, "AI survey");
  assert.strictEqual(r.rejected[0].reason, "Pure data, no angle.");
  assert.strictEqual(r.rejected[1].sourceUrl, "");
});

test("objekt-format med tom rejected er gyldig", () => {
  const raw = JSON.stringify({
    suggestions: [{ pillar: 2, title: "T", anchor: "A", fitScore: 7 }],
    rejected: []
  });
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions.length, 1);
  assert.deepStrictEqual(r.rejected, []);
});

test("objekt-format uten rejected-felt defaulter til tom array", () => {
  const raw = JSON.stringify({
    suggestions: [{ pillar: 2, title: "T", anchor: "A", fitScore: 7 }]
  });
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.rejected, []);
});

test("rejected uten title eller reason filtreres bort", () => {
  const raw = JSON.stringify({
    suggestions: [],
    rejected: [
      { sourceTitle: "", reason: "no title" },
      { sourceTitle: "no reason", reason: "" },
      { sourceTitle: "Valid", reason: "Good reason." }
    ]
  });
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.rejected.length, 1);
  assert.strictEqual(r.rejected[0].sourceTitle, "Valid");
});

test("objekt-format wrapped i markdown fence parser", () => {
  const raw = '```json\n{"suggestions": [{"pillar": 3, "title": "T", "anchor": "A"}], "rejected": []}\n```';
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions[0].pillar, 3);
});

test("objekt-format med prose før/etter parser", () => {
  const raw = `Here you go:\n\n{"suggestions": [{"pillar": 4, "title": "T", "anchor": "A"}], "rejected": [{"sourceTitle": "X", "reason": "Y"}]}\n\nLet me know!`;
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions[0].pillar, 4);
  assert.strictEqual(r.rejected[0].sourceTitle, "X");
});

test("JSON wrapped i markdown fence parser", () => {
  const raw = '```json\n[{"pillar": 2, "title": "T", "anchor": "A", "fitScore": 8}]\n```';
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions[0].pillar, 2);
});

test("JSON med prose før og etter parser", () => {
  const raw = `Sure, here are my picks:\n\n[{"pillar": 3, "title": "T", "anchor": "A", "fitScore": 9}]\n\nHope this helps!`;
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions[0].pillar, 3);
});

test("ugyldig JSON returnerer ok=false", () => {
  const r = prompts.parseResponse("this is not json at all");
  assert.strictEqual(r.ok, false);
  assert.ok(r.error);
});

test("tom respons returnerer ok=false", () => {
  const r = prompts.parseResponse("");
  assert.strictEqual(r.ok, false);
});

test("ugyldig pillar (5) filtreres bort", () => {
  const raw = JSON.stringify([
    { pillar: 5, title: "T", anchor: "A", fitScore: 7 },
    { pillar: 2, title: "OK", anchor: "A", fitScore: 7 },
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions.length, 1);
  assert.strictEqual(r.suggestions[0].pillar, 2);
});

test("manglende title eller anchor filtreres bort", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "", anchor: "A", fitScore: 7 },
    { pillar: 1, title: "T", anchor: "", fitScore: 7 },
    { pillar: 1, title: "OK", anchor: "A", fitScore: 7 },
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions.length, 1);
  assert.strictEqual(r.suggestions[0].title, "OK");
});

test("fitScore < 1 klampes til 1", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "T", anchor: "A", fitScore: -3 },
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions[0].fitScore, 1);
});

test("fitScore > 10 klampes til 10", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "T", anchor: "A", fitScore: 99 },
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions[0].fitScore, 10);
});

test("manglende fitScore defaulter til 5", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "T", anchor: "A" },
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions[0].fitScore, 5);
});

test("string-pillar konverteres til number", () => {
  const raw = JSON.stringify([
    { pillar: "2", title: "T", anchor: "A", fitScore: 7 },
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions[0].pillar, 2);
});

test("normaliserer alle textfelt med trim (legacy anchor blir framing)", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "  T  ", anchor: "  A  ", sourceUrl: "  u  ", reasoning: " r " },
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions[0].title, "T");
  // Legacy anchor mappes til framing
  assert.strictEqual(r.suggestions[0].framing, "A");
  assert.strictEqual(r.suggestions[0].sourceUrl, "u");
  assert.strictEqual(r.suggestions[0].reasoning, "r");
});

test("tom array er gyldig (alle filtrert ut, eller modell sa 'ingenting passer')", () => {
  const r = prompts.parseResponse("[]");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions.length, 0);
});

test("kan ekstrahere JSON-array fra svar med fence + omkringliggende whitespace", () => {
  const raw = `\n\n  Here you go:\n\n\`\`\`\n[{"pillar": 4, "title": "T", "anchor": "A", "fitScore": 8}]\n\`\`\`\n\nLet me know!`;
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions[0].pillar, 4);
});

console.log("\n— MICHEL'S OWN POSTS-blokken —");

function fixtureMichelPosts() {
  return [
    { pillar: 1, status: "published", title: "Hope as structure", body: "Last Tuesday in a 1:1 a senior engineer asked me…", publishedAt: "2026-05-10" },
    { pillar: 4, status: "ready", title: "MDR audit reveal", body: "Three months into the MDR transition…" },
    { pillar: 3, status: "draft", title: "Refactor that broke", body: "I spent twenty minutes chasing a regex…" },
  ];
}

test("michelPosts: blokk inkluderes når posts er gitt", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    michelPosts: fixtureMichelPosts(),
  });
  assert.ok(s.includes("MICHEL'S OWN POSTS"));
  assert.ok(s.includes("Hope as structure"));
  assert.ok(s.includes("MDR audit reveal"));
  assert.ok(s.includes("Refactor that broke"));
  // Status-merking
  assert.ok(s.includes("PUBLISHED"));
  assert.ok(s.includes("READY"));
  assert.ok(s.includes("DRAFT"));
});

test("michelPosts: blokk utelates når posts mangler eller er tom", () => {
  const s1 = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(!s1.includes("MICHEL'S OWN POSTS"));
  const s2 = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    michelPosts: [],
  });
  assert.ok(!s2.includes("MICHEL'S OWN POSTS"));
});

test("michelPosts: cap på 12 poster", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    pillar: ((i % 4) + 1),
    status: "published",
    title: `Post ${i}`,
    body: `Body of post ${i}, sufficiently long.`,
  }));
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    michelPosts: many,
  });
  assert.ok(s.includes("Post 0"));
  assert.ok(s.includes("Post 11"));
  assert.ok(!s.includes("Post 12"));
  assert.ok(!s.includes("Post 29"));
});

test("michelPosts: body trunkeres på 320 tegn med ellipse", () => {
  const long = "x".repeat(500);
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    michelPosts: [{ pillar: 1, status: "published", title: "Long one", body: long }],
  });
  assert.ok(s.includes("…"));
  assert.ok(!s.includes("x".repeat(330))); // skal ikke ha full 500-x-streng
});

test("michelPosts: poster uten title eller body filtreres bort", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    michelPosts: [
      { pillar: 1, status: "published", title: "", body: "no title" },
      { pillar: 1, status: "published", title: "no body", body: "" },
      { pillar: 1, status: "published", title: "OK", body: "valid post body" },
    ],
  });
  assert.ok(s.includes("OK"));
  assert.ok(!s.includes("no title"));
  assert.ok(!s.includes("no body"));
});

test("michelPosts: buildCombinedPrompt forwarder michelPosts", () => {
  const combined = prompts.buildCombinedPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    michelPosts: fixtureMichelPosts(),
    url: "https://example.com",
  });
  assert.ok(combined.includes("MICHEL'S OWN POSTS"));
  assert.ok(combined.includes("Hope as structure"));
});

console.log("\n— v0.14 hallusinasjons-fiks: framing + momentSuggestions + landing —");

test("v0.14: parser nytt format med framing+momentSuggestions+landing", () => {
  const raw = JSON.stringify({
    suggestions: [
      {
        pillar: 4,
        title: "Competitors fix their own weaknesses",
        framing: "Competitor study isn't a one-time exercise. The ones who notice their own gaps before you do are the ones already closing them.",
        momentSuggestions: [
          "A recent competitor product review at Laerdal",
          "An ISO 13485 audit finding",
        ],
        landing: "What you don't see, they're already shipping.",
        sourceUrl: "https://x.com",
        fitScore: 9,
      }
    ],
    rejected: []
  });
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  const s = r.suggestions[0];
  assert.strictEqual(s.framing.startsWith("Competitor study"), true);
  assert.strictEqual(s.momentSuggestions.length, 2);
  assert.strictEqual(s.landing, "What you don't see, they're already shipping.");
});

test("v0.14: legacy anchor mappes til framing, momentSuggestions/landing er tomme", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "T", anchor: "Legacy anchor text here", sourceUrl: "u", fitScore: 7 }
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  const s = r.suggestions[0];
  assert.strictEqual(s.framing, "Legacy anchor text here");
  assert.deepStrictEqual(s.momentSuggestions, []);
  assert.strictEqual(s.landing, "");
});

test("v0.14: suggestion uten framing OG uten anchor filtreres bort", () => {
  const raw = JSON.stringify({
    suggestions: [
      { pillar: 1, title: "Empty", momentSuggestions: ["A moment"] },
      { pillar: 2, title: "Valid", framing: "A framing." }
    ]
  });
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions.length, 1);
  assert.strictEqual(r.suggestions[0].title, "Valid");
});

test("v0.14: momentSuggestions filtreres for tom/lange", () => {
  const raw = JSON.stringify({
    suggestions: [
      {
        pillar: 1, title: "T",
        framing: "A framing.",
        momentSuggestions: ["", "Valid one", "x".repeat(400), "Valid two"],
      }
    ]
  });
  const r = prompts.parseResponse(raw);
  const s = r.suggestions[0];
  assert.strictEqual(s.momentSuggestions.length, 2);
  assert.strictEqual(s.momentSuggestions[0], "Valid one");
  assert.strictEqual(s.momentSuggestions[1], "Valid two");
});

test("v0.14: momentSuggestions cap på 5", () => {
  const raw = JSON.stringify({
    suggestions: [
      {
        pillar: 1, title: "T",
        framing: "A framing.",
        momentSuggestions: ["a", "b", "c", "d", "e", "f", "g"],
      }
    ]
  });
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions[0].momentSuggestions.length, 5);
});

console.log("\n— buildCombinedPrompt (manuell modus) —");

test("buildCombinedPrompt fletter system + user med tydelig skille", () => {
  const combined = prompts.buildCombinedPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    url: "https://example.com/newsletter",
  });
  // Skal inneholde system-deler (pillars + michel-context)
  assert.ok(combined.includes("Pillar 1"));
  assert.ok(combined.includes("Laerdal"));
  // Skal inneholde user-prompten
  assert.ok(combined.includes("https://example.com/newsletter"));
  // Skal ha tydelig skille (---)
  assert.ok(combined.includes("---"));
  assert.ok(combined.includes("USER INPUT"));
});

test("buildCombinedPrompt med både URL og tekst flettes inn", () => {
  const combined = prompts.buildCombinedPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    url: "https://example.com",
    text: "Article 1: Foo",
  });
  assert.ok(combined.includes("https://example.com"));
  assert.ok(combined.includes("Article 1: Foo"));
});

test("buildCombinedPrompt med recentAnchors inkluderer eksklusjons-listen", () => {
  const combined = prompts.buildCombinedPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
    url: "https://x.com",
    recentAnchors: ["Anker fra forrige uke som er lang nok til å bli inkludert."],
  });
  assert.ok(combined.includes("RECENTLY USED ANCHORS"));
  assert.ok(combined.includes("Anker fra forrige uke"));
});

test("buildCombinedPrompt kaster når både URL og tekst er tomme", () => {
  assert.throws(() => prompts.buildCombinedPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  }));
});

console.log("\n— Regenerasjons-prompt (v0.15 ↻ Annet anker) —");

function fixtureSuggestion() {
  return {
    pillar: 4,
    title: "Competitors will fix their own weaknesses",
    framing: "Competitor study isn't a one-time exercise. The ones who notice their own gaps before you do are the ones already closing them.",
    momentSuggestions: ["A recent competitor product review at Laerdal"],
    landing: "Static thinking is the most expensive assumption.",
    sourceUrl: "https://x.com/article",
    sourceTitle: "Learning from competition",
    fitScore: 9,
    reasoning: "Pillar 4 fit",
  };
}

test("buildRegenerationPrompt: inkluderer system + user med pillar og forrige framing", () => {
  const { system, user } = prompts.buildRegenerationPrompt({
    suggestion: fixtureSuggestion(),
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(system.includes("Pillar 4"));
  assert.ok(system.includes("Laerdal"));
  assert.ok(user.includes("Pillar 4"));
  assert.ok(user.includes("Krysspollinering"));
  assert.ok(user.includes("Learning from competition"));
  assert.ok(user.includes("https://x.com/article"));
  assert.ok(user.includes("Competitor study isn't a one-time"));
  assert.ok(user.toLowerCase().includes("alternative") || user.toLowerCase().includes("different"));
});

test("buildRegenerationPrompt: inkluderer previousAngles som exclusion-liste", () => {
  const { user } = prompts.buildRegenerationPrompt({
    suggestion: fixtureSuggestion(),
    previousAngles: [
      { framing: "Old framing one.", momentSuggestions: ["mom1"], landing: "old landing" },
      { framing: "Old framing two.", momentSuggestions: ["mom2"], landing: "old landing 2" },
    ],
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(user.includes("Old framing one"));
  assert.ok(user.includes("Old framing two"));
  assert.ok(user.includes("Attempt 1"));
  assert.ok(user.includes("Attempt 3")); // current + 2 previous
});

test("buildRegenerationPrompt: kaster når suggestion mangler", () => {
  assert.throws(() => prompts.buildRegenerationPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  }));
});

test("parseRegenerationResponse: parser ren JSON-objekt", () => {
  const raw = JSON.stringify({
    pillar: 4,
    title: "Alternative title",
    framing: "A different framing entirely.",
    momentSuggestions: ["A new moment type"],
    landing: "A new landing.",
    fitScore: 8,
  });
  const r = prompts.parseRegenerationResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestion.framing, "A different framing entirely.");
  assert.strictEqual(r.suggestion.title, "Alternative title");
});

test("parseRegenerationResponse: parser JSON wrapped i markdown fence", () => {
  const raw = '```json\n{"pillar": 1, "title": "T", "framing": "F", "momentSuggestions": ["m"], "landing": "L", "fitScore": 7}\n```';
  const r = prompts.parseRegenerationResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestion.framing, "F");
});

test("parseRegenerationResponse: parser JSON med prose før/etter", () => {
  const raw = `Here's an alternative:\n\n{"pillar": 2, "title": "T", "framing": "F", "fitScore": 9}\n\nLet me know.`;
  const r = prompts.parseRegenerationResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestion.pillar, 2);
});

test("parseRegenerationResponse: returnerer ok:false ved ugyldig respons", () => {
  const r = prompts.parseRegenerationResponse("not json at all");
  assert.strictEqual(r.ok, false);
  assert.ok(r.error);
});

test("parseRegenerationResponse: ok:false når kritiske felt mangler", () => {
  const raw = JSON.stringify({ pillar: 1, title: "T" });  // mangler framing
  const r = prompts.parseRegenerationResponse(raw);
  assert.strictEqual(r.ok, false);
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
