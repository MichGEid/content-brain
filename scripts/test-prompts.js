#!/usr/bin/env node
/* =====================================================================
   test-prompts.js — kjør prompt-byggeren uten browser eller Ollama.

   Bruk:
     node scripts/test-prompts.js                    # default scenario
     node scripts/test-prompts.js --pillar 2         # bytte pilar
     node scripts/test-prompts.js --length short     # bytte lengde
     node scripts/test-prompts.js --json             # JSON-output (for diff)

   Hva du får:
     - Hele system-prompten som ville sendt til modellen
     - Hele user-prompten
     - Liste over valgte few-shot eksempler
     - Estimater for token-bruk

   Bra for å iterere på prompts.js uten Ollama-roundtrip.
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ----------------------------- args -----------------------------

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : fallback;
};

const MODE = arg("--mode", "standard"); // "standard" | "article-reaction"
const PILLAR = +arg("--pillar", "1");
const LENGTH = arg("--length", "standard");
const TONE_RAW = arg("--tone", null);   // 0-100 eller "default" for å bruke pilar-default
const JSON_OUTPUT = args.includes("--json");
const ANCHOR = arg("--anchor",
  "En kollega kom innom i dag og spurte indirekte om en deadline jeg eier. Vi snakket sideways i 5 minutter. Hun fikk det hun trengte uten å spørre direkte, og jeg lærte mer om hva som faktisk plager teamet hennes enn jeg ville fått i et formelt møte."
);
const IDEA = arg("--idea", "Sideways conversations matter more than people think.");

// Article-reaction defaults
const ARTICLE_TEXT = arg("--article-text",
  "Norway's medtech sector has long been dominated by a few large incumbents. But over the past 18 months, a wave of smaller startups — many spun out of university research — has begun to reshape the regulatory conversation. Where incumbents have historically lobbied for stability, the newcomers are pushing for clearer pathways to clinical validation, particularly for digital therapeutics. The Norwegian Directorate of Health has so far been receptive, hosting workshops and signaling openness to faster-track schemes."
);
const ARTICLE_URL = arg("--article-url", "https://example.com/article");
const ARTICLE_ANGLE = arg("--article-angle",
  "The shift from incumbent-dominated regulation to startup-driven clarity is exactly what Norwegian health export needs. But it requires the incumbents to participate, not just object."
);

// ----------------------------- load modules in a fake browser context -----------------------------

const ROOT = path.resolve(__dirname, "..");

const fakeWindow = {};
const fakeDocument = { querySelector: () => null, querySelectorAll: () => [] };
const fakeLocation = { hostname: "localhost", protocol: "http:" };
const sandbox = {
  window: fakeWindow,
  document: fakeDocument,
  location: fakeLocation,
  console,
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  fetch: () => Promise.reject(new Error("fetch ikke tilgjengelig i test-harness")),
};
sandbox.window.window = sandbox.window;

vm.createContext(sandbox);

function loadInto(file) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  vm.runInContext(code, sandbox, { filename: file });
}

loadInto("seed.js");
// seed.js setter window.SEED_POSTS = SEED_POSTS; selv på siste linje.

loadInto("ghostwriter/api.js");
loadInto("ghostwriter/prompts.js");

const { buildSystemPrompt, buildUserPrompt, buildArticleReactionUserPrompt, selectExamples, LENGTH_PRESETS, PILLAR_INFO, TONE_AXES, DEFAULT_VOICE } = sandbox.window.Ghostwriter.prompts;

// ----------------------------- run -----------------------------

const posts = sandbox.window.SEED_POSTS || [];
if (posts.length === 0) {
  console.error("[test-prompts] FAIL: ingen seed-posts funnet. Sjekk at seed.js setter window.SEED_POSTS.");
  process.exit(1);
}

const voiceProfile = DEFAULT_VOICE; // ingen brukerprofil — bare defaults

const examples = selectExamples({ posts, pillar: PILLAR, voiceProfile, max: 3 });

// Tone-verdi: --tone 30, eller --tone default (bruk pilar-default), eller ingen (ingen tone-instruks)
let toneValue;
if (TONE_RAW === "default") {
  toneValue = TONE_AXES?.[PILLAR]?.defaultValue;
} else if (TONE_RAW !== null) {
  toneValue = +TONE_RAW;
}

const systemPrompt = buildSystemPrompt({
  voiceProfile,
  pillar: PILLAR,
  examples,
  lengthKey: LENGTH,
  toneValue,
});

const userPrompt = MODE === "article-reaction"
  ? buildArticleReactionUserPrompt({
      articleText: ARTICLE_TEXT,
      articleUrl: ARTICLE_URL,
      angle: ARTICLE_ANGLE,
      pillar: PILLAR,
      lengthKey: LENGTH,
    })
  : buildUserPrompt({
      anchor: ANCHOR,
      idea: IDEA,
      pillar: PILLAR,
      lengthKey: LENGTH,
    });

// Veldig grov token-estimat: ord × 1.3 (for engelsk + sannsynlig stykning)
const wordCount = s => (s || "").trim().split(/\s+/).filter(Boolean).length;
const tokenEstimate = s => Math.round(wordCount(s) * 1.3);

const result = {
  config: {
    mode: MODE,
    pillar: PILLAR,
    pillarLabel: PILLAR_INFO[PILLAR]?.label,
    lengthKey: LENGTH,
    lengthRange: LENGTH_PRESETS[LENGTH]?.wordRange,
  },
  examples: examples.map(e => ({
    title: e.title,
    pillar: e.pillar,
    bodyPreview: e.body.slice(0, 80) + "…",
    bodyWords: wordCount(e.body),
  })),
  systemPrompt: {
    text: systemPrompt,
    chars: systemPrompt.length,
    words: wordCount(systemPrompt),
    estTokens: tokenEstimate(systemPrompt),
  },
  userPrompt: {
    text: userPrompt,
    chars: userPrompt.length,
    words: wordCount(userPrompt),
    estTokens: tokenEstimate(userPrompt),
  },
  totalEstTokens: tokenEstimate(systemPrompt) + tokenEstimate(userPrompt),
};

// ----------------------------- output -----------------------------

if (JSON_OUTPUT) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log("===== CONFIG =====");
console.log(`Modus:    ${result.config.mode}`);
console.log(`Pilar:    ${result.config.pillar} (${result.config.pillarLabel})`);
console.log(`Lengde:   ${result.config.lengthKey} (${result.config.lengthRange})`);
if (MODE === "article-reaction") {
  console.log(`Article:  ${ARTICLE_TEXT.slice(0, 80)}…`);
  console.log(`URL:      ${ARTICLE_URL}`);
  console.log(`Angle:    ${ARTICLE_ANGLE.slice(0, 80)}…`);
} else {
  console.log(`Anker:    ${ANCHOR.slice(0, 80)}…`);
  console.log(`Idé:      ${IDEA}`);
}
console.log("");

console.log("===== EKSEMPLER (few-shot) =====");
result.examples.forEach((e, i) => {
  console.log(`  ${i + 1}. [P${e.pillar}] ${e.title} (${e.bodyWords} ord)`);
});
console.log("");

console.log("===== SYSTEM PROMPT =====");
console.log(result.systemPrompt.text);
console.log("");
console.log(`(${result.systemPrompt.chars} tegn · ${result.systemPrompt.words} ord · ~${result.systemPrompt.estTokens} tokens)`);
console.log("");

console.log("===== USER PROMPT =====");
console.log(result.userPrompt.text);
console.log("");
console.log(`(${result.userPrompt.chars} tegn · ${result.userPrompt.words} ord · ~${result.userPrompt.estTokens} tokens)`);
console.log("");

console.log("===== TOTALT =====");
console.log(`~${result.totalEstTokens} tokens i input. Du fikk ~6-8s response på qwen2.5:7b sist.`);
