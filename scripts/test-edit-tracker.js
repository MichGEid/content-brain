#!/usr/bin/env node
/* =====================================================================
   test-edit-tracker.js — verifiser n-gram diff og banlist-forslag.

   Bruk:
     node scripts/test-edit-tracker.js

   Tester:
     - findRemovedPhrases finner faktisk strøkne fraser
     - findRemovedPhrases ignorerer stop-words-bare-grams
     - isSubstantialEdit skiller skikkelige edits fra typo-fiks
     - getBanlistSuggestions respekterer ignored og alreadyBanned
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

// ----------------------------- sandbox -----------------------------

let lsStore = {};
const sandbox = {
  window: {},
  console,
  localStorage: {
    getItem: k => lsStore[k] || null,
    setItem: (k, v) => { lsStore[k] = v; },
    removeItem: k => { delete lsStore[k]; },
  },
};
sandbox.window.window = sandbox.window;
sandbox.window.Ghostwriter = {};
vm.createContext(sandbox);

const code = fs.readFileSync(path.join(ROOT, "ghostwriter/edit-tracker.js"), "utf8");
vm.runInContext(code, sandbox, { filename: "edit-tracker.js" });
const tracker = sandbox.window.Ghostwriter.editTracker;

// ----------------------------- test helpers -----------------------------

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
function reset() {
  lsStore = {};
}

// ----------------------------- tests -----------------------------

console.log("=== findRemovedPhrases ===");

test("finner ord-grupper som strykes", () => {
  const generated = "In today's fast-paced environments we must unlock potential and drive change.";
  const edited = "We must adapt and grow.";
  const removed = tracker.findRemovedPhrases(generated, edited);
  // Skal finne fraser knyttet til "fast-paced", "unlock potential"
  const text = removed.join(" | ").toLowerCase();
  assert(text.includes("fast-paced") || text.includes("fast paced"), `forventet 'fast-paced' i removed, fikk: ${removed.slice(0, 5).join(", ")}`);
  assert(text.includes("unlock"), `forventet 'unlock' i removed, fikk: ${removed.slice(0, 5).join(", ")}`);
});

test("finner ikke fraser som er bevart i edited", () => {
  const generated = "The team is working hard on the new feature.";
  const edited = "The team is working hard on the new feature.";
  const removed = tracker.findRemovedPhrases(generated, edited);
  assert(removed.length === 0, `forventet 0 fjernede, fikk ${removed.length}: ${removed.join(", ")}`);
});

test("filtrerer bort stoppord-bare-grams", () => {
  const generated = "I think that the way we work matters more than we realize.";
  const edited = "We work in ways that matter.";
  const removed = tracker.findRemovedPhrases(generated, edited);
  const onlyStops = removed.filter(p => /^(the|a|an|and|or|of|to|in|on|at|for|with|is|that)(\s+(the|a|an|and|or|of|to|in|on|at|for|with|is|that))*$/i.test(p));
  assert(onlyStops.length === 0, `forventet ingen stoppord-bare-grams, fikk ${onlyStops.length}: ${onlyStops.join(", ")}`);
});

console.log("");
console.log("=== isSubstantialEdit ===");

test("identisk tekst er IKKE substantial", () => {
  const a = "Same text here.";
  const b = "Same text here.";
  assert(!tracker.isSubstantialEdit(a, b), "forventet ikke substantial");
});

test("liten typo-fiks er IKKE substantial", () => {
  const a = "The quick brown fox jumps over the lazy dog.";
  const b = "The quick brown fox jumps over the lazy dog!";   // bare punktum → !
  // Egentlig kan dette gi 0 ord-diff. Test at < 5% threshold respekteres.
  const result = tracker.isSubstantialEdit(a, b);
  assert(!result, `forventet ikke substantial for typo, fikk substantial=${result}`);
});

test("stor omskrivning ER substantial", () => {
  const a = "In today's fast-paced environments, leaders must unlock potential and drive meaningful change.";
  const b = "Sideways conversations matter.";
  assert(tracker.isSubstantialEdit(a, b), "forventet substantial for stor omskrivning");
});

console.log("");
console.log("=== recordEdit + getBanlistSuggestions ===");

test("etter 3 forekomster av samme frase, dukker den opp i forslag", () => {
  reset();
  const generated = "We unlock potential through innovation.";
  const edited = "We grow through innovation.";

  for (let i = 0; i < 3; i++) {
    tracker.recordEdit({ generated, edited, pillar: 1, model: "test", postId: `p${i}` });
  }

  const suggestions = tracker.getBanlistSuggestions({ minOccurrences: 3 });
  const phrases = suggestions.map(s => s.phrase.toLowerCase());
  assert(
    phrases.some(p => p.includes("unlock potential") || p.includes("unlock")),
    `forventet 'unlock potential' (eller variant) i forslag etter 3 edits, fikk: ${suggestions.slice(0, 5).map(s => s.phrase).join(" | ")}`
  );
});

test("alreadyBanned ekskluderer overlappende fraser", () => {
  reset();
  const generated = "We unlock potential here.";
  const edited = "We work here.";
  for (let i = 0; i < 3; i++) {
    tracker.recordEdit({ generated, edited, pillar: 1, model: "test", postId: `p${i}` });
  }
  const suggestions = tracker.getBanlistSuggestions({ minOccurrences: 3, alreadyBanned: ["unlock potential"] });
  const stillContainsUnlock = suggestions.some(s => s.phrase.toLowerCase().includes("unlock potential"));
  assert(!stillContainsUnlock, `'unlock potential' burde være filtrert ut av alreadyBanned, fikk: ${suggestions.map(s => s.phrase).join(", ")}`);
});

test("ignorePhrase fjerner forslaget permanent", () => {
  reset();
  const generated = "Let's drive meaningful change together.";
  const edited = "Let's grow together.";
  for (let i = 0; i < 3; i++) {
    tracker.recordEdit({ generated, edited, pillar: 1, model: "test", postId: `p${i}` });
  }
  // Hent forslag
  const before = tracker.getBanlistSuggestions({ minOccurrences: 3 });
  assert(before.length > 0, "forventet minst ett forslag før ignore");

  // Ignorer det første
  tracker.ignorePhrase(before[0].phrase);

  // Sjekk at den ikke kommer tilbake
  const after = tracker.getBanlistSuggestions({ minOccurrences: 3 });
  assert(
    !after.some(s => s.phrase === before[0].phrase),
    `${before[0].phrase} burde være fjernet etter ignorePhrase, fikk: ${after.map(s => s.phrase).join(", ")}`
  );
});

console.log("");
console.log("=== getStats ===");

test("teller edits riktig", () => {
  reset();
  for (let i = 0; i < 5; i++) {
    tracker.recordEdit({
      generated: `Generated text ${i} with unlocks potential and meaningful changes.`,
      edited: `Edited ${i}.`,
      pillar: 1,
      model: "test",
      postId: `p${i}`,
    });
  }
  const stats = tracker.getStats();
  assert(stats.totalEdits === 5, `forventet 5 edits, fikk ${stats.totalEdits}`);
  assert(stats.totalPhrasesTracked > 0, `forventet > 0 fraser sporet, fikk ${stats.totalPhrasesTracked}`);
});

console.log("");
console.log("=== getLengthCalibration ===");

test("kalibrering reflekterer at brukeren kutter", () => {
  reset();
  // Lang generert, kort edit. Bruker faktisk forskjellige ord så
  // isSubstantialEdit registrerer det som en ekte edit.
  const longWords = ["alpha","beta","gamma","delta","epsilon","zeta","eta","theta","iota","kappa","lambda","mu","nu","xi","omicron","pi","rho","sigma","tau","upsilon","phi","chi","psi","omega","alfred","bertha","cuthbert","delphine","ebenezer","fiona","george","heidi","ivan","julia","klaus","linda","marvin","nora","oscar","petra","quentin","raissa","stuart","tilda","ulrich","vera","wilbur","xenia","yusuf","zara"];
  for (let i = 0; i < 3; i++) {
    const gen = longWords.join(" ");                 // 50 ord
    const ed  = longWords.slice(0, 20).join(" ");    // 20 ord
    tracker.recordEdit({ generated: gen, edited: ed, pillar: 1, model: "test", postId: `p${i}` });
  }
  const cal = tracker.getLengthCalibration();
  assert(cal !== null, "forventet kalibrering, fikk null");
  assert(cal.avgDelta < -20, `forventet kraftig negativ delta, fikk ${cal.avgDelta}`);
  assert(cal.recommendation.includes("kortere"), `forventet 'kortere'-anbefaling, fikk: ${cal.recommendation}`);
});

console.log("");
console.log("=== reset ===");

test("reset tømmer all data", () => {
  for (let i = 0; i < 3; i++) {
    tracker.recordEdit({ generated: "lots of text here", edited: "less", pillar: 1, model: "test", postId: `p${i}` });
  }
  tracker.reset();
  const stats = tracker.getStats();
  assert(stats.totalEdits === 0, `etter reset forventet 0 edits, fikk ${stats.totalEdits}`);
  assert(tracker.getBanlistSuggestions({ minOccurrences: 1 }).length === 0, "forventet 0 forslag etter reset");
});

// ----------------------------- summary -----------------------------

console.log("");
console.log("=".repeat(40));
console.log(`Resultat: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
