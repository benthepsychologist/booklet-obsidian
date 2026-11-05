#!/usr/bin/env node
// Contrast check for the paper looks. Plain Node, no dependencies.
// Reads themes/tokens-paper-light.css and themes/tokens-paper-dark.css, resolves the --bk-* hex values and computes
// WCAG 2.x contrast ratios. Text pairs need 4.5:1, UI pairs (focus ring, accent boundary) 3:1, decorative pairs are
// reported only. Prints a table per look and exits 1 if any required pair fails.
// Usage: node scripts/contrast.mjs [--markdown] [--look paper-light|paper-dark]
// (--markdown prints tables as markdown, for docs/themes-contrast.md; --look checks one look only)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOOKS = [
  { name: "paper-light", file: "themes/tokens-paper-light.css" },
  { name: "paper-dark", file: "themes/tokens-paper-dark.css" },
];
const ACCENTS = ["sky", "sage", "sun", "rose", "lilac"];

function readTokens(file) {
  const css = readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = {};
  for (const m of css.matchAll(/--bk-([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[1]] = m[2].toUpperCase();
  return tokens;
}

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// kind: text (4.5), ui (3), info (report only)
function pairs() {
  const p = [];
  const add = (fg, bg, kind, label) => p.push({ fg, bg, kind, label: label ?? `${fg} on ${bg}` });
  add("ink", "paper", "text"); add("ink", "card", "text");
  add("ink-soft", "paper", "text"); add("ink-soft", "card", "text");
  add("brand", "paper", "text", "brand on paper (link)"); add("brand", "card", "text", "brand on card (link)");
  add("brand", "brand-wash", "text", "brand on brand-wash (link)");
  add("on-brand", "brand", "text"); add("on-brand", "brand-deep", "text");
  for (const a of ACCENTS) add("ink", `${a}-wash`, "text");
  for (const a of ACCENTS) add("ink-soft", `${a}-wash`, "text");
  for (const a of ACCENTS) add(a, `${a}-wash`, "text", `${a} text on ${a}-wash`);
  for (const a of ACCENTS) add(a, "card", "text", `${a} text on card`);
  add("ink", "yes-wash", "text"); add("ink", "hmm-wash", "text");
  add("yes", "yes-wash", "text"); add("hmm", "hmm-wash", "text");
  add("focus", "paper", "ui", "focus ring on paper"); add("focus", "card", "ui", "focus ring on card");
  for (const a of ["brand", ...ACCENTS]) add(a, "card", "ui", `${a} boundary on card`);
  add("rule", "paper", "info", "rule on paper (decorative)"); add("rule", "card", "info", "rule on card (decorative)");
  return p;
}

const md = process.argv.includes("--markdown");
const need = { text: 4.5, ui: 3, info: 0 };
let failures = 0;
const only = process.argv.includes("--look") ? process.argv[process.argv.indexOf("--look") + 1] : null;
for (const look of LOOKS.filter((l) => !only || l.name === only)) {
  const t = readTokens(look.file);
  console.log(`${md ? "\n### " : "\n== "}${look.name}`);
  if (md) { console.log("\n| pair | fg | bg | ratio | needs | result |\n| --- | --- | --- | --- | --- | --- |"); }
  else console.log("pair".padEnd(34), "fg".padEnd(8), "bg".padEnd(8), "ratio".padStart(6), " needs result");
  for (const q of pairs()) {
    const fg = t[q.fg], bg = t[q.bg];
    if (!fg || !bg) { console.log(`MISSING token for ${q.label}`); failures++; continue; }
    const r = ratio(fg, bg), min = need[q.kind];
    const ok = q.kind === "info" ? "info" : r >= min ? "pass" : "FAIL";
    if (ok === "FAIL") failures++;
    const need_s = q.kind === "info" ? "-" : String(min);
    if (md) console.log(`| ${q.label} | ${fg} | ${bg} | ${r.toFixed(2)} | ${need_s} | ${ok} |`);
    else console.log(q.label.padEnd(34), fg.padEnd(8), bg.padEnd(8), r.toFixed(2).padStart(6), need_s.padStart(6), ok.padStart(6));
  }
}
console.log(failures ? `\n${failures} required pair(s) FAIL` : "\nAll required pairs pass");
process.exit(failures ? 1 : 0);
