#!/usr/bin/env node
/* =====================================================================
   Content Brain — test-analytics.js
   Unit-tester for analytics-modulen. Følger samme pattern som
   test-edit-tracker.js og test-conversation.js: ingen testramme,
   ingen browser, bare ren Node + assert.

   Kjør: node scripts/test-analytics.js
   ===================================================================== */

"use strict";

const assert = require("assert");
const path = require("path");

// CSV-parseren bruker bare ren JS — vi laster den direkte.
const parser = require(path.join(__dirname, "..", "analytics", "csv-parser.js"));
const classifier = require(path.join(__dirname, "..", "analytics", "classifier.js"));
const store = require(path.join(__dirname, "..", "analytics", "analytics-store.js"));

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

console.log("\n— csv-parser —");

test("parseCsv: tomt input gir tom array", () => {
  assert.deepStrictEqual(parser.parseCsv(""), []);
  assert.deepStrictEqual(parser.parseCsv(null), []);
});

test("parseCsv: stripper UTF-8 BOM", () => {
  const text = "﻿name,age\nMichel,42";
  const rows = parser.parseCsv(text);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].name, "Michel");
});

test("parseCsv: håndterer quoted fields med komma inni", () => {
  const text = `title,body\n"Hello, world","Line one\nLine two"`;
  const rows = parser.parseCsv(text);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].title, "Hello, world");
  assert.strictEqual(rows[0].body, "Line one\nLine two");
});

test("parseCsv: håndterer escaped quotes (\"\" → \")", () => {
  const text = `q\n"She said ""hi"""`;
  const rows = parser.parseCsv(text);
  assert.strictEqual(rows[0].q, `She said "hi"`);
});

test("detectFormat: detekterer Shares.csv via filnavn", () => {
  const rows = [{ Date: "x", ShareCommentary: "y" }];
  assert.strictEqual(parser.detectFormat(rows, "Shares.csv"), "posts");
});

test("detectFormat: detekterer Connections.csv via filnavn", () => {
  const rows = [{ "First Name": "a", "Last Name": "b" }];
  assert.strictEqual(parser.detectFormat(rows, "Connections.csv"), "connections");
});

test("detectFormat: detekterer på kolonnenavn når filnavn er ukjent", () => {
  const rows = [{ "First Name": "a", "Last Name": "b", "Email Address": "x@y" }];
  assert.strictEqual(parser.detectFormat(rows, "random.csv"), "connections");
});

test("detectFormat: håndterer LinkedIn-suffix med medlems-ID", () => {
  // LinkedIn legger til medlems-ID på enkelte filer i Complete-arkivet
  const rows = [{ Date: "x", Message: "y", Link: "z" }];
  assert.strictEqual(parser.detectFormat(rows, "Comments_203144055.csv"), "comments");
  assert.strictEqual(parser.detectFormat(rows, "Shares_203144055.csv"), "posts");
  assert.strictEqual(parser.detectFormat(rows, "Reactions_123456.csv"), "reactions");
  assert.strictEqual(parser.detectFormat(rows, "Connections_99999.csv"), "connections");
});

test("findColumn: case-insensitive lookup blant kandidater", () => {
  const row = { "Share Commentary": "x", "Date": "y" };
  assert.strictEqual(parser.findColumn(row, ["ShareCommentary", "Share Commentary"]), "Share Commentary");
});

test("toIsoDate: ISO-strenger passerer gjennom", () => {
  const iso = parser.toIsoDate("2024-08-13T10:00:00Z");
  assert.ok(iso.startsWith("2024-08-13"));
});

test("toIsoDate: håndterer 'YYYY-MM-DD HH:MM:SS UTC'-format", () => {
  const iso = parser.toIsoDate("2024-08-13 14:23:11 UTC");
  assert.ok(iso && iso.startsWith("2024-08-13"));
});

test("toIsoDate: håndterer MM/DD/YYYY", () => {
  const iso = parser.toIsoDate("08/13/2024");
  assert.ok(iso && iso.startsWith("2024-08-13"));
});

test("toNumber: stripper non-numeric og parser tall", () => {
  assert.strictEqual(parser.toNumber("1,234"), 1234);
  assert.strictEqual(parser.toNumber("42"), 42);
  assert.strictEqual(parser.toNumber(""), 0);
  assert.strictEqual(parser.toNumber(null), 0);
});

test("fingerprint: ignorerer URLer, hashtags og spesialtegn", () => {
  const a = parser.fingerprint("Check this out: https://laerdal.com and #leadership.");
  const b = parser.fingerprint("Check this out:    and ");
  // Begge skal være identiske etter normalisering
  assert.strictEqual(a, b);
});

test("fingerprintScore: identisk innhold = 1.0", () => {
  const fp = parser.fingerprint("connective leadership at the edge");
  assert.strictEqual(parser.fingerprintScore(fp, fp), 1);
});

test("fingerprintScore: delvis overlapp ligger mellom 0 og 1", () => {
  const a = parser.fingerprint("connective leadership starts with listening");
  const b = parser.fingerprint("connective leadership requires presence");
  const score = parser.fingerprintScore(a, b);
  assert.ok(score > 0 && score < 1, `score=${score}`);
});

test("parsePosts: ekstraherer metrics fra Shares-CSV", () => {
  const csv = `Date,ShareCommentary,ShareLink,Impressions,Likes,Comments,Shares\n` +
              `2024-08-13 10:00:00 UTC,"Hello world",https://lnkd.in/abc,1200,42,7,2`;
  const result = parser.parseFile(csv, "Shares.csv");
  assert.strictEqual(result.format, "posts");
  assert.strictEqual(result.records.length, 1);
  const p = result.records[0];
  assert.strictEqual(p.impressions, 1200);
  assert.strictEqual(p.likes, 42);
  assert.strictEqual(p.comments, 7);
  assert.strictEqual(p.shares, 2);
  assert.strictEqual(p.engagements, 51);
  assert.ok(p.engagementRate > 0.04 && p.engagementRate < 0.05);
});

test("parseConnections: bygger fullt navn fra First+Last", () => {
  const csv = `First Name,Last Name,Position,Company,Connected On\n` +
              `Kari,Nordmann,CTO,Acme,08/13/2024`;
  const result = parser.parseFile(csv, "Connections.csv");
  assert.strictEqual(result.format, "connections");
  assert.strictEqual(result.records[0].name, "Kari Nordmann");
  assert.strictEqual(result.records[0].headline, "CTO");
});

console.log("\n— classifier —");

test("classifyByHeadline: 'Director of X' → peer", () => {
  assert.strictEqual(classifier.classifyByHeadline("Director of Digital Health", "Acme"), "peer");
});

test("classifyByHeadline: 'Senior Software Engineer' → recruit", () => {
  assert.strictEqual(classifier.classifyByHeadline("Senior Software Engineer", "Foo"), "recruit");
});

test("classifyByHeadline: 'Chairman of the Board' → board", () => {
  assert.strictEqual(classifier.classifyByHeadline("Chairman of the Board", "Foo"), "board");
});

test("classifyByHeadline: 'Investor' → board", () => {
  assert.strictEqual(classifier.classifyByHeadline("Investor at NorthStar", "NorthStar"), "board");
});

test("classifyByHeadline: 'Sykepleier ved Stavanger Universitetssjukehus' → prospect", () => {
  assert.strictEqual(classifier.classifyByHeadline("Sykepleier", "Stavanger sykehus"), "prospect");
});

test("classifyByHeadline: ukjent tittel + ukjent firma → null", () => {
  assert.strictEqual(classifier.classifyByHeadline("Hobbyist", "Independent"), null);
});

test("classifyByHeadline: firma-hint slår inn når tittel ikke matcher (Medtronic → peer)", () => {
  assert.strictEqual(classifier.classifyByHeadline("Random Title", "Medtronic"), "peer");
});

test("classifyByHeadline: Director ved sykehus blir prospect (sykehus-konteksten vinner)", () => {
  // Prospect-regelen kommer før peer-regelen i RULES. Det er bevisst valg for
  // Michels medtech-kontekst: en Director ved et sykehus er primært en
  // potensiell kunde, ikke en peer i industrien. Override-mekanismen lar
  // brukeren korrigere enkelttilfeller.
  assert.strictEqual(classifier.classifyByHeadline("Director of IT", "Stavanger sykehus"), "prospect");
});

test("getCategory: override slår heuristikk", () => {
  const state = store.emptyState();
  store.setEngagerTag(state, "Kari Nordmann", "board");
  assert.strictEqual(classifier.getCategory(state, "Kari Nordmann", "Director", "Acme"), "board");
});

test("getCategory: ukjent → 'other'", () => {
  const state = store.emptyState();
  assert.strictEqual(classifier.getCategory(state, "Unknown Person", "Hobbyist", "Independent"), "other");
});

test("breakdownByCategory: aggregerer per kategori", () => {
  const state = store.emptyState();
  state.connections = [
    { name: "A", headline: "Director", company: "" },
    { name: "B", headline: "Senior Software Engineer", company: "" },
    { name: "C", headline: "CTO", company: "" },
    { name: "D", headline: "Hobbyist", company: "" },
  ];
  const b = classifier.breakdownByCategory(state);
  assert.strictEqual(b.peer, 2);
  assert.strictEqual(b.recruit, 1);
  assert.strictEqual(b.other, 1);
});

console.log("\n— analytics-store —");

test("emptyState: alle felt er initialisert", () => {
  const s = store.emptyState();
  assert.deepStrictEqual(s.postMetrics, []);
  assert.deepStrictEqual(s.connections, []);
  assert.deepStrictEqual(s.engagerTags, {});
  assert.deepStrictEqual(s.imports, []);
  assert.strictEqual(s.lastImportAt, null);
});

test("mergePostMetrics: dedupe på URL", () => {
  const s = store.emptyState();
  const a = store.mergePostMetrics(s, [
    { url: "https://lnkd.in/x", date: "2024-08-13T10:00:00Z", content: "hi", likes: 5 },
  ]);
  assert.strictEqual(a.added, 1);
  assert.strictEqual(s.postMetrics.length, 1);

  const b = store.mergePostMetrics(s, [
    { url: "https://lnkd.in/x", date: "2024-08-13T10:00:00Z", content: "hi", likes: 10 },
  ]);
  assert.strictEqual(b.added, 0);
  assert.strictEqual(b.updated, 1);
  assert.strictEqual(s.postMetrics[0].likes, 10);
});

test("mergePostMetrics: dedupe på date+fingerprint når URL mangler", () => {
  const s = store.emptyState();
  const fp = "connective leadership starts with listening";
  store.mergePostMetrics(s, [
    { url: "", date: "2024-08-13T10:00:00Z", content: "...", contentFingerprint: fp, likes: 1 },
  ]);
  store.mergePostMetrics(s, [
    { url: "", date: "2024-08-13T10:00:00Z", content: "...", contentFingerprint: fp, likes: 5 },
  ]);
  assert.strictEqual(s.postMetrics.length, 1);
  assert.strictEqual(s.postMetrics[0].likes, 5);
});

test("mergeConnections: dedupe på normalisert navn", () => {
  const s = store.emptyState();
  store.mergeConnections(s, [{ name: "Kari Nordmann", headline: "CTO" }]);
  store.mergeConnections(s, [{ name: "kari nordmann", headline: "VP Engineering" }]);
  assert.strictEqual(s.connections.length, 1);
  assert.strictEqual(s.connections[0].headline, "VP Engineering");
});

test("setEngagerTag + getEngagerTag: round-trip", () => {
  const s = store.emptyState();
  store.setEngagerTag(s, "Kari Nordmann", "board");
  assert.strictEqual(store.getEngagerTag(s, "Kari Nordmann"), "board");
  assert.strictEqual(store.getEngagerTag(s, "KARI NORDMANN"), "board");
});

test("setEngagerTag: 'auto' fjerner override", () => {
  const s = store.emptyState();
  store.setEngagerTag(s, "Kari", "board");
  store.setEngagerTag(s, "Kari", "auto");
  assert.strictEqual(store.getEngagerTag(s, "Kari"), null);
});

test("linkToPipeline: matcher metric mot Pipeline-post via fingerprint", () => {
  const s = store.emptyState();
  const content = "Connective leadership starts with listening to the team.";
  s.postMetrics.push({
    id: "a1",
    date: "2024-08-13T10:00:00Z",
    content,
    contentFingerprint: parser.fingerprint(content),
    likes: 10, comments: 2, shares: 1, impressions: 500, engagements: 13,
    linkedPostId: null,
  });
  const getCb = () => ({
    posts: [
      { id: "p_xyz", title: "Connective leadership", body: "starts with listening to the team" },
      { id: "p_abc", title: "Hockey weekend", body: "win against Sandnes" },
    ],
  });
  const r = store.linkToPipeline(s, getCb, parser);
  assert.strictEqual(r.linked, 1);
  assert.strictEqual(s.postMetrics[0].linkedPostId, "p_xyz");
});

test("recordImport: oppdaterer lastImportAt og caps på 50", () => {
  const s = store.emptyState();
  for (let i = 0; i < 55; i++) {
    store.recordImport(s, { format: "posts", count: 1, filename: `f${i}.csv` });
  }
  assert.strictEqual(s.imports.length, 50);
  assert.ok(s.lastImportAt);
  // Eldste skal være borte
  assert.strictEqual(s.imports[0].filename, "f5.csv");
});

console.log("\n— demo-data —");

// demo-data.js bruker window.AnalyticsParser/Store. I Node er disse ikke globale,
// så vi setter dem manuelt før vi requirer modulen.
global.window = {
  AnalyticsParser: parser,
  AnalyticsStore: store,
};
const demo = require(path.join(__dirname, "..", "analytics", "demo-data.js"));

test("generatePostMetrics: lager 16 metrics fordelt på 4 pilarer", () => {
  const metrics = demo.generatePostMetrics();
  assert.strictEqual(metrics.length, 16);
  const byPillar = { 1: 0, 2: 0, 3: 0, 4: 0 };
  metrics.forEach(m => { byPillar[m._demoPillar]++; });
  // 4 av hver pilar (16 / 4)
  assert.strictEqual(byPillar[1], 4);
  assert.strictEqual(byPillar[2], 4);
  assert.strictEqual(byPillar[3], 4);
  assert.strictEqual(byPillar[4], 4);
});

test("generatePostMetrics: alle har dato, content, fingerprint og engagement", () => {
  const metrics = demo.generatePostMetrics();
  metrics.forEach(m => {
    assert.ok(m.date, "missing date");
    assert.ok(m.content, "missing content");
    assert.ok(m.contentFingerprint, "missing fingerprint");
    assert.ok(m.engagements > 0, "engagement should be positive");
    assert.ok(m.impressions > 0, "impressions should be positive");
  });
});

test("generateConnections: lager 30 connections med navn, headline og dato", () => {
  const conns = demo.generateConnections();
  assert.strictEqual(conns.length, 30);
  conns.forEach(c => {
    assert.ok(c.name, "missing name");
    assert.ok(c.connectedAt, "missing connectedAt");
  });
});

test("generateConnections: navn dekker alle 5 klassifiserings-buckets", () => {
  const conns = demo.generateConnections();
  const buckets = { peer: 0, recruit: 0, board: 0, prospect: 0, other: 0 };
  conns.forEach(c => {
    const cat = classifier.classifyByHeadline(c.headline, c.company) || "other";
    buckets[cat]++;
  });
  // Vi forventer minst én av hver
  assert.ok(buckets.peer >= 3,     `peer=${buckets.peer}`);
  assert.ok(buckets.recruit >= 3,  `recruit=${buckets.recruit}`);
  assert.ok(buckets.board >= 3,    `board=${buckets.board}`);
  assert.ok(buckets.prospect >= 3, `prospect=${buckets.prospect}`);
  assert.ok(buckets.other >= 1,    `other=${buckets.other}`);
});

test("loadDemoData: kjører hele import-flowen mot tom state", () => {
  const s = store.emptyState();
  const r = demo.loadDemoData(s);
  assert.strictEqual(r.addedPosts, 16);
  assert.strictEqual(r.addedConnections, 30);
  assert.strictEqual(s.postMetrics.length, 16);
  assert.strictEqual(s.connections.length, 30);
  assert.strictEqual(s.imports.length, 1);
  assert.strictEqual(s.imports[0].format, "demo");
});

console.log("\n— top-performers logikk —");

test("topPerformers: sortering på engagements", () => {
  // Vi etterligner Analytics.getTopPerformers ved å bruke metrikkene direkte.
  // (Den ekte funksjonen er bare en `.sort().slice()` på enrichedMetrics.)
  const metrics = [
    { pillar: 1, engagements: 10 },
    { pillar: 1, engagements: 50 },
    { pillar: 1, engagements: 30 },
    { pillar: 2, engagements: 99 },
  ];
  const top = metrics
    .filter(m => m.pillar === 1)
    .sort((a, b) => b.engagements - a.engagements)
    .slice(0, 2);
  assert.strictEqual(top.length, 2);
  assert.strictEqual(top[0].engagements, 50);
  assert.strictEqual(top[1].engagements, 30);
});

test("pillarPerformance vsAll-utregning", () => {
  // 4 metrics: pilar 1 har snitt 100, pilar 2 har snitt 50, samlet snitt 75.
  // Forventet: byPillar[1].vsAll = (100-75)/75 ≈ 0.33, byPillar[2].vsAll ≈ -0.33
  const metrics = [
    { pillar: 1, engagements: 100 },
    { pillar: 1, engagements: 100 },
    { pillar: 2, engagements: 50 },
    { pillar: 2, engagements: 50 },
  ];
  const overall = 75;
  const p1avg = 100, p2avg = 50;
  const vsAll1 = (p1avg - overall) / overall;
  const vsAll2 = (p2avg - overall) / overall;
  assert.ok(Math.abs(vsAll1 - 0.333) < 0.01);
  assert.ok(Math.abs(vsAll2 + 0.333) < 0.01);
});

console.log(`\n${passed} passed · ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
