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

// Where each piece of the view takes its definitions from: every title, crumb and status below holds a reference `[x][pic]`, and
// the module, the bare activity and the shared section each define `pic` differently.
const drawn = `---
booklet: "0.16"
title: Book [bt][pic]
---

> [!activity|bare] Bare [a][pic]
> Status [s][pic]

Words.

[pic]: bare.png

> [!module|one] One [m][pic]

> [!activity|a] Alpha [a][pic]
> Status [s][pic]

Words.

> [!activity|a2] Alpha two

More words.

> [!module|one end] End

> [!module|two] Two [m][pic]

> [!activity|b] Beta [a][pic]
> Status [s][pic]

Words [w][pic].

> [!module|two end] End

> [!data|one] One data

[pic]: one.png

> [!data|two] Two data

[pic]: two.png

> [!data] Shared

[pic]: shared.png
`;

/** Every fragment the view hands to the renderer, as the Markdown it was given. */
async function drawnWith(screen, then) {
 const seen = [];
 globalThis.__bookletStubRender = (md, el) => { seen.push(md); el.dataset.source = md; el.textContent = md.split("\n\n")[0]; };
 const p = pane(drawn, screen ? {screen} : {});
 try {
  await p.settled();
  await then(p, seen);
 } finally { p.close(); delete globalThis.__bookletStubRender; }
}
/** The definitions an element's words were drawn with. */
const defsOf = (el) => (el.dataset.source ?? "").split("\n\n").slice(1).join("\n").split("\n").filter(Boolean);
const card = (p, title) => p.all(".booklet-cardrow").find((r) => p.words(r.querySelector(".booklet-cardtitle")).includes(title));

test("a link of the trail is drawn with its own scope's definitions, not the screen's", async () => {
 for (const screen of ["activity:two/b", "module:one"]) {
  await drawnWith(screen, (p) => {
   // the first link is the booklet's title: only the shared definitions, though the screen is a module's
   const first = p.all(".booklet-trail-link")[0];
   assert.deepEqual(defsOf(first.querySelector("span")), ["[pic]: shared.png"], screen);
  });
 }
});

test("a module's card is drawn with that module's definitions", async () => {
 await drawnWith(null, (p) => {
  const words = card(p, "One").querySelector(".booklet-cardtitle-words");
  assert.deepEqual(defsOf(words), ["[pic]: one.png", "[pic]: shared.png"]);
 });
});

test("a card for a module's only activity is drawn with that module's definitions, its title and its status", async () => {
 await drawnWith(null, (p) => {
  const c = card(p, "Two");
  assert.deepEqual(defsOf(c.querySelector(".booklet-cardtitle-words")), ["[pic]: two.png", "[pic]: shared.png"]);
  assert.deepEqual(defsOf(c.querySelector(".booklet-status span")), ["[pic]: two.png", "[pic]: shared.png"]);
 });
});

test("a card for a bare activity is drawn with the bare activities' definitions", async () => {
 await drawnWith(null, (p) => {
  const c = card(p, "Bare");
  assert.deepEqual(defsOf(c.querySelector(".booklet-cardtitle-words")), ["[pic]: bare.png", "[pic]: shared.png"]);
  assert.deepEqual(defsOf(c.querySelector(".booklet-status span")), ["[pic]: bare.png", "[pic]: shared.png"]);
 });
});

test("a scope's definitions are worked out once while a screen is drawn", async () => {
 await drawnWith("activity:one/a", async (p, seen) => {
  // count the passes over the definitions of each note read from now on: a scope costs three (its own, its data section, the shared ones)
  let passes = 0;
  let book = p.view.book;
  const count = new Set(["filter"]);
  Object.defineProperty(p.view, "book", {
   get: () => book,
   set: (b) => { if (b) b.references = new Proxy(b.references, { get: (t, k) => { if (count.has(k)) passes++; const v = Reflect.get(t, k, t); return typeof v === "function" ? v.bind(t) : v; } }); book = b; },
  });
  seen.length = 0;
  await p.view.setState({ version: 1, screen: "activity:two/b" }, {});
  await p.settled();
  // the booklet's title and module two's crumb, title and words: four fragments, two scopes
  assert.equal(seen.filter((md) => md.includes("[pic]: ")).length, 4);
  assert.ok(passes <= 6, `${passes} passes over the definitions for two scopes`);
 });
});
