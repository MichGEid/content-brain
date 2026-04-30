#!/usr/bin/env node
/* =====================================================================
   Content Brain — build.js
   Inliner style.css + seed.js + app.js i index.html, og krypterer
   resultatet med StaticCrypt til ./dist/index.html.

   Bruk:
     node scripts/build.js                       # bruker $STATICRYPT_PASSWORD
     node scripts/build.js --password "secret"   # eksplisitt passord
     node scripts/build.js --bundle-only         # bare bundle, ikke krypter

   Hvorfor inline?
     StaticCrypt krypterer kun HTML-body. Hvis vi lar app.js / seed.js
     ligge som eksterne <script src="...">, kan hvem som helst hente
     dem direkte fra GitHub Pages. Vi inliner alt først, så blir hele
     bundlen kryptert.
   ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// ----------------------------- args -----------------------------

const args = process.argv.slice(2);
const bundleOnly = args.includes("--bundle-only");

let password = process.env.STATICRYPT_PASSWORD || "";
const pwIdx = args.indexOf("--password");
if (pwIdx !== -1 && args[pwIdx + 1]) password = args[pwIdx + 1];

// ----------------------------- paths -----------------------------

const ROOT = path.resolve(__dirname, "..");
const SRC_HTML = path.join(ROOT, "index.html");
const SRC_CSS = path.join(ROOT, "style.css");
const SRC_SEED = path.join(ROOT, "seed.js");
const SRC_APP = path.join(ROOT, "app.js");

const DIST = path.join(ROOT, "dist");
const BUNDLED_HTML = path.join(DIST, "index.html");

// ----------------------------- helpers -----------------------------

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function escapeForScript(js) {
  // Beskytt mot at en </script> i strenger bryter <script>-blokken vår.
  return js.replace(/<\/script>/gi, "<\\/script>");
}

// ----------------------------- bundle step -----------------------------

console.log("[build] Reading source files…");
let html = read(SRC_HTML);
const css = read(SRC_CSS);
const seedJs = read(SRC_SEED);
const appJs = read(SRC_APP);

// VIKTIG: bruker callback-formen av .replace() slik at `$`-tegn i kildekoden
// (f.eks. `$$`) ikke tolkes som spesielle replace-mønstre.

// 1) <link rel="stylesheet" href="style.css"> → <style>…</style>
const styleBlock = `<style>\n${css}\n</style>`;
html = html.replace(/<link[^>]+href=["']style\.css["'][^>]*>/i, () => styleBlock);

// 2) <script src="seed.js"></script> + <script src="app.js"></script>
//    → inline begge i samme rekkefølge.
const scriptBlock =
  `<script>\n${escapeForScript(seedJs)}\n</script>\n` +
  `<script>\n${escapeForScript(appJs)}\n</script>`;
html = html.replace(
  /<script\s+src=["']seed\.js["']><\/script>\s*<script\s+src=["']app\.js["']><\/script>/i,
  () => scriptBlock
);

// Sanity-check: ingen eksterne references skal være igjen.
if (/src=["'](seed|app)\.js["']/i.test(html) || /href=["']style\.css["']/i.test(html)) {
  console.error("[build] FAIL: ekstern referanse fortsatt i bundle. Sjekk regex.");
  process.exit(1);
}

ensureDir(DIST);
fs.writeFileSync(BUNDLED_HTML, html, "utf8");
console.log(`[build] Bundled → ${path.relative(ROOT, BUNDLED_HTML)} (${html.length} bytes)`);

if (bundleOnly) {
  console.log("[build] --bundle-only satt. Hopper over kryptering.");
  process.exit(0);
}

// ----------------------------- encrypt step -----------------------------

if (!password) {
  console.error(
    "[build] FAIL: ingen passord. Sett $STATICRYPT_PASSWORD eller bruk --password \"...\""
  );
  process.exit(1);
}

console.log("[build] Encrypting with StaticCrypt…");

// staticrypt skriver til ./encrypted/<navn>.html som default.
// Vi peker direkte på dist/index.html, og bruker -d dist for å
// overskrive in place.
const result = spawnSync(
  "npx",
  [
    "--yes",
    "staticrypt",
    BUNDLED_HTML,
    "-p", password,
    "-d", DIST,
    "--template-title", "Content Brain — låst",
    "--template-instructions", "Skriv passordet for å åpne dashbordet.",
    "--template-button", "Lås opp",
    "--template-color-primary", "#0f172a",
    "--template-color-secondary", "#1e293b",
  ],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error(`[build] FAIL: staticrypt exited with ${result.status}`);
  process.exit(result.status || 1);
}

// Sanity check — staticrypt returnerer 0 selv når brukeren avbryter med 'n'.
// Verifiser at klartekst-markører faktisk er borte fra resultat-filen.
const finalContent = fs.readFileSync(BUNDLED_HTML, "utf8");
if (finalContent.includes("SEED_POSTS") || finalContent.includes("STORAGE_KEY")) {
  console.error("[build] FAIL: dist/index.html er IKKE kryptert (klartekst funnet).");
  console.error("        Sannsynligvis avbrøt du staticrypt med 'n' fordi passordet var for kort.");
  console.error("        Velg et passord på 14+ tegn og prøv igjen.");
  process.exit(1);
}

console.log("[build] Done. dist/index.html er nå kryptert.");
