// 32514 — the PIM bridge. Mihai, 13 Oct: the tools awaiting production must
// be independent of each other; a Conditional Access fix could not be
// promoted without publishing PIM-buddy. js/app.js keeps every PIM-buddy
// function and variable between the PIM-BUDDY BLOCK markers, and the rest of
// the app reaches it only through pimBridge, whose defaults are what a build
// without PIM-buddy does. These tests hold app.js to that, so a CA item ports
// to main without dragging Workspace 02 along.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const L = src.split("\n");
const begin = L.findIndex((l) => l.includes(">>> PIM-BUDDY BLOCK BEGIN"));
const end = L.findIndex((l) => l.includes("<<< PIM-BUDDY BLOCK END"));
const isComment = (l) => /^\s*\/\//.test(l);

// What the block declares at the app's own level (two spaces in).
const declared = () => {
  const ids = new Set();
  for (let i = begin; i <= end; i++) {
    const l = L[i];
    let m = l.match(/^  (?:async )?function\s+([A-Za-z_$][\w$]*)/);
    if (m) ids.add(m[1]);
    m = l.match(/^  (?:let|const|var)\s+(.*)/);
    if (m) for (const x of m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=/g)) ids.add(x[1]);
  }
  return ids;
};
const outside = () => L.map((l, i) => ({ l, n: i + 1 })).filter((x, i) => (i < begin || i > end) && !isComment(x.l));

test("the PIM-buddy block is marked once, begin before end", () => {
  assert.ok(begin > 0 && end > begin, `begin ${begin}, end ${end}`);
  assert.strictEqual(L.filter((l) => l.includes(">>> PIM-BUDDY BLOCK BEGIN")).length, 1);
  assert.strictEqual(L.filter((l) => l.includes("<<< PIM-BUDDY BLOCK END")).length, 1);
});

test("nothing outside the block names what the block declares", () => {
  const ids = declared();
  assert.ok(ids.has("pmbReset") && ids.has("prlOn") && ids.has("pimLensPaint"), "the block's own names were found");
  const re = new RegExp(`\\b(${[...ids].map((s) => s.replace(/\$/g, "\\$")).join("|")})\\b`, "g");
  const hits = [];
  for (const { l, n } of outside()) for (const m of l.matchAll(re)) hits.push(`${n}: ${m[1]}`);
  assert.deepStrictEqual(hits, [], `use pimBridge instead:\n${hits.join("\n")}`);
});

test("nothing outside the block uses a PIM-buddy module", () => {
  const re = /\b(Pim[A-Z]\w*|PIM_BASELINE|IntuneRbac)\b/g;
  const hits = [];
  for (const { l, n } of outside()) for (const m of l.matchAll(re)) hits.push(`${n}: ${m[1]}`);
  assert.deepStrictEqual(hits, [], hits.join("\n"));
});

test("the bridge's defaults and what the block fills in name the same calls", () => {
  const keysOf = (body) => [...body.matchAll(/^\s*([a-zA-Z]+):/gm)].map((m) => m[1]).sort();
  const stub = src.match(/const pimBridge = \{\n([\s\S]*?)\n  \};/);
  const fill = src.match(/Object\.assign\(pimBridge, \{\n([\s\S]*?)\n  \}\);/);
  assert.ok(stub && fill, "stub and fill found");
  assert.ok(src.indexOf(fill[0]) > L.slice(0, begin).join("\n").length, "the fill sits inside the block");
  assert.deepStrictEqual(keysOf(fill[1]), keysOf(stub[1]));
});

test("app.js without the block still parses — the shape of a port to main", () => {
  const cut = [...L.slice(0, begin), ...L.slice(end + 1)].join("\n");
  assert.doesNotThrow(() => new Function(cut));
});
