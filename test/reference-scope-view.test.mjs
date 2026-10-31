import test from "node:test";
import assert from "node:assert/strict";
import { pane } from "./pane.mjs";

const note = `---
booklet: "0.16"
title: Scoped references
---

Home ![Home][pic]

> [!module|one] One

Opening ![Opening][pic]

> [!activity|a] Activity

Inside ![Inside][pic]

> [!module|one end] End

> [!module|two] Two

> [!activity|b] Activity two

Inside ![Inside][pic]

> [!module|two end] End

> [!data|one] One data

[pic]: one.png

> [!data|two] Two data

[pic]: two.png

> [!data] Shared

[pic]: shared.png
`;

const context = (p, selector) => p.all(selector).map((e) => e.dataset.source ?? "").join("\n");

test("view passes only the owning module's reference definitions, including after an edit", async () => {
 globalThis.__bookletStubRender = (md, el) => { el.dataset.source = md; el.textContent = md.split("\n\n")[0]; };
 let home, one, two;
 try {
  home = pane(note); await home.settled();
  const opening = context(home, ".booklet-opening");
  assert.match(opening, /\[pic\]: shared\.png/);
  assert.doesNotMatch(opening, /\[pic\]: (one|two)\.png/);
  one = pane(note, {screen: "activity:one/a"}); await one.settled();
  let body = context(one, ".booklet-opening, .booklet-prose");
  assert.match(body, /\[pic\]: one\.png/);
  assert.doesNotMatch(body, /\[pic\]: two\.png/);
  assert.ok(body.indexOf("[pic]: one.png") < body.indexOf("[pic]: shared.png"));
  two = pane(note, {screen: "activity:two/b"}); await two.settled();
  body = context(two, ".booklet-prose");
  assert.match(body, /\[pic\]: two\.png/);
  assert.doesNotMatch(body, /\[pic\]: one\.png/);
  one.view.setViewData(note.replace("[pic]: one.png", "[pic]: changed.png"), false);
  await one.settled();
  body = context(one, ".booklet-opening, .booklet-prose");
  assert.match(body, /\[pic\]: changed\.png/);
  assert.doesNotMatch(body, /\[pic\]: one\.png/);
 } finally { home?.close(); one?.close(); two?.close(); delete globalThis.__bookletStubRender; }
});

test("view supplies reference context only to fragments that can use it", async () => {
 const seen = [];
 globalThis.__bookletStubRender = (md, el) => { seen.push(md); el.textContent = md; };
 let p;
 try {
  const text = `---\nbooklet: "0.16"\ntitle: Sample\n---\n\n> [!activity|a] A\n\nPlain words.\n\nA [link][pic].\n\n> [!data] Data\n\n[pic]: picture.png\n`;
  p = pane(text, {screen: "activity:/a"});
  await p.settled();
  assert.ok(seen.some(md => md.trim() === "Sample"));
  assert.ok(seen.some(md => md.includes("[link][pic]") && md.includes("[pic]: picture.png")));
 } finally { p?.close(); delete globalThis.__bookletStubRender; }
});
