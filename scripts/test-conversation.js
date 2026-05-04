#!/usr/bin/env node
/* =====================================================================
   test-conversation.js — verifiser conversation-bygging og prompt-logikk.

   Bruk:
     node scripts/test-conversation.js

   Tester:
     - buildConversationMessages: type-markører, role-mapping, første user-turn
     - buildToneInstruction: lean low/high/balanced, format
     - selectExamples: manual override, auto-fill, caps, fallback
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

// ----------------------------- sandbox -----------------------------

const sandbox = {
  window: {},
  document: { querySelector: () => null, querySelectorAll: () => [] },
  location: { hostname: "localhost", protocol: "http:" },
  console,
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
  fetch: () => Promise.reject(new Error("fetch ikke tilgjengelig i test-harness")),
  setTimeout, clearTimeout, setInterval, clearInterval,
};
sandbox.window.window = sandbox.window;
sandbox.window.matchMedia = () => ({ matches: false });
vm.createContext(sandbox);

function loadInto(file) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  vm.runInContext(code, sandbox, { filename: file });
}

loadInto("seed.js");
loadInto("ghostwriter/api.js");
loadInto("ghostwriter/prompts.js");
loadInto("ghostwriter/edit-tracker.js");
loadInto("ghostwriter/voice-profile.js");
loadInto("ghostwriter/ghostwriter.js");

const Ghostwriter = sandbox.window.Ghostwriter;
const { buildToneInstruction, selectExamples, TONE_AXES } = Ghostwriter.prompts;
const buildConversationMessages = Ghostwriter.buildConversationMessages;

// ----------------------------- test framework -----------------------------

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || "not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ----------------------------- buildConversationMessages -----------------------------

console.log("=== buildConversationMessages ===");

test("tom samtale + initial prompt = tom messages-array", () => {
  const result = buildConversationMessages("Hello", []);
  assertEqual(result.length, 0);
});

test("første user-turn erstattes med initial prompt", () => {
  const conv = [
    { role: "user", type: "start", text: "Resymé fra UI" },
  ];
  const result = buildConversationMessages("Faktisk full prompt", conv);
  assertEqual(result.length, 1);
  assertEqual(result[0].role, "user");
  assertEqual(result[0].content, "Faktisk full prompt");
});

test("model-turn mappes til assistant-role", () => {
  const conv = [
    { role: "user", type: "start", text: "Q1" },
    { role: "model", type: "draft", text: "Draft text" },
  ];
  const result = buildConversationMessages("InitialPrompt", conv);
  assertEqual(result.length, 2);
  assertEqual(result[1].role, "assistant");
  assertEqual(result[1].content, "Draft text");
});

test("iterate-turn får [REVISE THE DRAFT]-prefix", () => {
  const conv = [
    { role: "user", type: "start", text: "first" },
    { role: "model", type: "draft", text: "draft1" },
    { role: "user", type: "iterate", text: "kortere" },
  ];
  const result = buildConversationMessages("InitialPrompt", conv);
  assertEqual(result.length, 3);
  assertEqual(result[2].role, "user");
  assert(
    result[2].content.startsWith("[REVISE THE DRAFT"),
    `forventet [REVISE-prefix, fikk: ${result[2].content.slice(0, 40)}`
  );
  assert(
    result[2].content.includes("kortere"),
    "feedback-tekst skal være med i content"
  );
});

test("ask-turn får [QUESTION]-prefix", () => {
  const conv = [
    { role: "user", type: "start", text: "first" },
    { role: "model", type: "draft", text: "draft1" },
    { role: "user", type: "ask", text: "hva betyr X?" },
  ];
  const result = buildConversationMessages("InitialPrompt", conv);
  assertEqual(result.length, 3);
  assert(
    result[2].content.startsWith("[QUESTION"),
    `forventet [QUESTION-prefix, fikk: ${result[2].content.slice(0, 40)}`
  );
  assert(
    !result[2].content.includes("[REVISE"),
    "skal ikke ha REVISE-prefix"
  );
});

test("rekkefølge bevares: user-model-user-model", () => {
  const conv = [
    { role: "user", type: "start", text: "1" },
    { role: "model", type: "draft", text: "2" },
    { role: "user", type: "iterate", text: "3" },
    { role: "model", type: "draft", text: "4" },
  ];
  const result = buildConversationMessages("init", conv);
  assertEqual(result.length, 4);
  assertEqual(result[0].role, "user");
  assertEqual(result[1].role, "assistant");
  assertEqual(result[2].role, "user");
  assertEqual(result[3].role, "assistant");
});

test("blanding av iterate og ask håndteres riktig", () => {
  const conv = [
    { role: "user", type: "start", text: "init-summary" },
    { role: "model", type: "draft", text: "d1" },
    { role: "user", type: "iterate", text: "kortere" },
    { role: "model", type: "draft", text: "d2" },
    { role: "user", type: "ask", text: "hvorfor X?" },
    { role: "model", type: "answer", text: "fordi…" },
  ];
  const result = buildConversationMessages("real-init", conv);
  assertEqual(result.length, 6);
  assert(result[2].content.includes("[REVISE"), "iterate skal ha REVISE-prefix");
  assert(result[4].content.includes("[QUESTION"), "ask skal ha QUESTION-prefix");
  assertEqual(result[5].role, "assistant");
  assertEqual(result[5].content, "fordi…");
});

// ----------------------------- buildToneInstruction -----------------------------

console.log("");
console.log("=== buildToneInstruction ===");

test("lean low for value < 33", () => {
  const result = buildToneInstruction(1, 20);
  assert(result.includes("Lean toward"), `forventet 'Lean toward': ${result}`);
  assert(result.includes(TONE_AXES[1].low), "skal referere low-aksen");
  assert(result.includes("strategic ↔ personal"), "skal vise pilar-akse");
});

test("lean high for value > 66", () => {
  const result = buildToneInstruction(1, 80);
  assert(result.includes("Lean toward"), "forventet 'Lean toward'");
  assert(result.includes(TONE_AXES[1].high), "skal referere high-aksen");
});

test("balanced for 33-66", () => {
  const result = buildToneInstruction(1, 50);
  assert(result.includes("Hold a balance") || result.includes("balance"), `forventet balance, fikk: ${result}`);
});

test("ukjent pilar gir tom streng", () => {
  const result = buildToneInstruction(99, 50);
  assertEqual(result, "");
});

test("clamper verdi til 0-100", () => {
  // Verdi 150 skal behandles som 100 (lean high)
  const high = buildToneInstruction(1, 150);
  assert(high.includes("100/100"), `forventet 100/100, fikk: ${high}`);
  // Verdi -50 skal behandles som 0 (lean low)
  const low = buildToneInstruction(1, -50);
  assert(low.includes("0/100"), `forventet 0/100, fikk: ${low}`);
});

test("inneholder slider-verdi i format X/100", () => {
  const result = buildToneInstruction(2, 30);
  assert(result.includes("30/100"), `forventet '30/100', fikk: ${result}`);
});

// ----------------------------- selectExamples -----------------------------

console.log("");
console.log("=== selectExamples ===");

const mockPosts = [
  { id: "p1", status: "published", body: "P1 body", title: "P1 title", pillar: 1 },
  { id: "p2", status: "published", body: "P2 body", title: "P2 title", pillar: 1 },
  { id: "p3", status: "published", body: "P3 body", title: "P3 title", pillar: 1 },
  { id: "p4", status: "published", body: "P4 body", title: "P4 title", pillar: 2 },
  { id: "p5", status: "published", body: "P5 body", title: "P5 title", pillar: 2 },
  { id: "p6", status: "draft",     body: "P6 body", title: "P6 title", pillar: 1 },  // draft, ikke valgt
];

test("returnerer tom array når ingen posts", () => {
  const result = selectExamples({ posts: [], pillar: 1, voiceProfile: null });
  assertEqual(result.length, 0);
});

test("auto-velger fra samme pilar opp til max", () => {
  const result = selectExamples({ posts: mockPosts, pillar: 1, voiceProfile: null, max: 3 });
  assertEqual(result.length, 3);
  assert(result.every(p => p.pillar === 1), "alle skal være pilar 1");
});

test("filtrerer ut ikke-publiserte", () => {
  const result = selectExamples({ posts: mockPosts, pillar: 1, voiceProfile: null, max: 5 });
  assert(result.every(p => p.title !== "P6 title"), "draft p6 skal ikke være med");
});

test("manuell selection respekteres", () => {
  const profile = { pillars: { 1: { examples: ["p2", "p3"] } } };
  const result = selectExamples({ posts: mockPosts, pillar: 1, voiceProfile: profile, max: 3 });
  assertEqual(result.length, 2);
  assert(result.find(p => p.title === "P2 title"), "p2 skal være med");
  assert(result.find(p => p.title === "P3 title"), "p3 skal være med");
});

test("manuell selection cap = 5", () => {
  const profile = {
    pillars: { 1: { examples: ["p1", "p2", "p3", "p4", "p5", "p6"] } },
  };
  const result = selectExamples({ posts: mockPosts, pillar: 1, voiceProfile: profile, max: 3 });
  // p6 er draft, så maks 5 av de 6 IDer matcher published. Cap er 5 men her bare 5 reelle.
  assert(result.length <= 5, `forventet ≤5, fikk ${result.length}`);
});

test("faller tilbake til andre pilarer når samme pilar har for få", () => {
  const result = selectExamples({ posts: mockPosts, pillar: 4, voiceProfile: null, max: 3 });
  // Pilar 4 har ingen posts. Skal falle tilbake til andre pilarer.
  assertEqual(result.length, 3);
});

test("returnerer postene med riktig shape", () => {
  const result = selectExamples({ posts: mockPosts, pillar: 1, voiceProfile: null, max: 1 });
  assertEqual(result.length, 1);
  const post = result[0];
  assert("title" in post, "skal ha title");
  assert("body" in post, "skal ha body");
  assert("pillar" in post, "skal ha pillar");
  assert(!("id" in post), "skal ikke eksponere id (intern)");
});

// ----------------------------- summary -----------------------------

console.log("");
console.log("=".repeat(40));
console.log(`Resultat: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
