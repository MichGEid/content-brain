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
  assert.ok(s.includes("JSON array"));
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

test("inkluderer GOOD og BAD anchor-eksempler", () => {
  const s = prompts.buildSystemPrompt({
    voiceProfile: fixtureVoiceProfile(),
    pillarInfo: fixturePillarInfo(),
  });
  assert.ok(s.includes("GOOD ANCHOR"));
  assert.ok(s.includes("BAD ANCHOR"));
  // Konkrete fra-eksempler skal være med
  assert.ok(s.includes("Sørmarka"));
  assert.ok(s.includes("competitor's AED"));
});

test("MICHEL_CONTEXT eksporteres som konstant for gjenbruk", () => {
  assert.ok(typeof prompts.MICHEL_CONTEXT === "string");
  assert.ok(prompts.MICHEL_CONTEXT.includes("Laerdal"));
  assert.ok(prompts.MICHEL_CONTEXT.includes("J2020"));
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

test("ren JSON-array parser direkte", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "T", anchor: "A", sourceUrl: "u", fitScore: 7 }
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.suggestions.length, 1);
  assert.strictEqual(r.suggestions[0].pillar, 1);
  assert.strictEqual(r.suggestions[0].fitScore, 7);
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

test("normaliserer alle textfelt med trim", () => {
  const raw = JSON.stringify([
    { pillar: 1, title: "  T  ", anchor: "  A  ", sourceUrl: "  u  ", reasoning: " r " },
  ]);
  const r = prompts.parseResponse(raw);
  assert.strictEqual(r.suggestions[0].title, "T");
  assert.strictEqual(r.suggestions[0].anchor, "A");
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

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
