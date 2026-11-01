// Check 33 of plugin-check.js: pictures written as image definition lines (`![alt][name]`, 0.10.0), in the real app. The notes are made up
// and written into the check's own copy of the vault, with small made-up image files:
//   the demo note test/page-notes/Pictures.booklet.md as it stands (its definition is in the shared data section), and a note of two
//   modules built from it, where one module holds the definitions and the other does not.
// Each runs on a desktop's width and in Obsidian's phone mode (390 px), and writes nothing into any note.
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check function.
const fs = require("fs"), path = require("path");
const { frames, mobile, kit } = require("./waits");

module.exports = function picturesChecks(env) {
  const { withApp, Check, BOOK, sleep } = env;
  const DEMO = "Pictures.booklet.md", CASES = "Picture cases.booklet.md", PLAIN = "Evening check-in.booklet.md";
  const DEMO_SRC = path.join(__dirname, "..", "test", "page-notes", DEMO);
  const demoKit = kit(env, DEMO), casesKit = kit(env, CASES), plainKit = kit(env, PLAIN);

  // one transparent pixel and one circle, both made up; a copy of the pixel stands for every picture file but the svg
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="teal"/></svg>';
  const files = {
    "images/shape.svg": SVG, "my boat.png": PNG, "dot.png": PNG, "images/wave.png": PNG,
  };
  const casesText = () => `---
booklet: "0.17"
id: booklet-test/picture-cases
title: Picture cases
lang: en
---

> [!module|harbour] Harbour

> [!activity|shapes] Shapes

Full form: ![The harbour][harbour]

A path with a space: ![A boat][boat]

Collapsed form: ![dot][]

Shortcut form: ![wave]

A web address: ![Far away][far]

A file that is not there: ![Gone][gone]

An inline shape, <svg class="made-up-shape" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="teal"/></svg> in a line of words.

> [!module|harbour end] End

> [!module|plain] Plain

> [!activity|bare] Bare

The same names in another module: ![The harbour][harbour] and ![dot][].

> [!module|plain end] End

> [!data|harbour] Harbour data

[harbour]: images/shape.svg "A made-up shape"
[boat]: <my boat.png>
[dot]: dot.png
[wave]: images/wave.png
[far]: https://example.invalid/far.png
[gone]: nothere.png
`;

  const put = (vault, rel, data) => { const f = path.join(vault, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
  // every file is in the vault's index before a note that names it is drawn
  const indexed = (o, rels) => o.page.waitForFunction(rels => rels.every(r => !!app.vault.getAbstractFileByPath(r)), rels, { timeout: 15000, polling: 50 });
  // the pictures in the page (not the icons of a callout or a button), with what the check reads of each
  const pictures = o => o.evaluate(sel => {
    const root = document.querySelector(sel + " .booklet-page");
    const imgs = [...root.querySelectorAll("img")].filter(e => !e.closest(".callout-icon") && !e.closest("button")).map(e => ({
      alt: e.getAttribute("alt"), src: e.getAttribute("src") || "", dec: decodeURIComponent(e.getAttribute("src") || ""), loaded: e.complete && e.naturalWidth > 0, broken: e.complete && e.naturalWidth === 0,
    }));
    const svgs = [...root.querySelectorAll("svg.made-up-shape")].map(e => ({ inP: !!e.closest("p"), inImg: !!e.closest("img"), w: e.getBoundingClientRect().width }));
    return { imgs, svgs, text: root.textContent.replace(/\s+/g, " ").trim(), vaultHas: ["nothere.png", "images/nothere.png"].map(p => !!app.vault.getAbstractFileByPath(p)) };
  }, BOOK);
  // an image has loaded or failed, not still waiting: the page's pictures are all complete
  const settled = o => o.page.waitForFunction(sel => [...document.querySelectorAll(sel + " .booklet-page img")].every(e => e.complete), BOOK, { timeout: 15000, polling: 50 });
  const by = (p, alt) => p.imgs.filter(i => i.alt === alt);

  async function check33() {
    const c = new Check(33, "0.10.0 pictures: `![alt][name]` drawn as pictures (a vault file, a path with a space, the collapsed and shortcut forms, a web address, a missing file), an inline svg left inline, a definition used only in its own module, a note with no picture as before, nothing written; desktop and phone");
    for (const where of ["desktop", "phone"]) {
      await withApp("c33-" + where, async (o, vault) => {
        for (const [rel, data] of Object.entries(files)) put(vault, rel, data);
        put(vault, DEMO, fs.readFileSync(DEMO_SRC, "utf8"));
        put(vault, CASES, casesText());
        await indexed(o, Object.keys(files));
        if (where === "phone") { await o.page.setViewportSize({ width: 390, height: 844 }); await mobile(o, true); }
        else await o.page.setViewportSize({ width: 1280, height: 900 });
        const demoFile = path.join(vault, DEMO), casesFile = path.join(vault, CASES), plainFile = path.join(vault, PLAIN);
        const hDemo = demoKit.sha(demoFile), hCases = casesKit.sha(casesFile), hPlain = plainKit.sha(plainFile);
        const bytesCases = fs.readFileSync(casesFile), bytesDemo = fs.readFileSync(demoFile);

        // the demo note as it stands: its picture is a definition in the shared data section, an svg in a subfolder
        await demoKit.open(o, DEMO);
        await settled(o);
        let p = await pictures(o);
        const h = by(p, "The harbour");
        c.ok(h.length === 1 && h[0].src.startsWith("app://") && h[0].dec.includes("images/shape.svg") && h[0].loaded, `[${where}] the demo note's \`![The harbour][harbour]\` is one picture, a vault file at an app:// address that loaded: ${JSON.stringify(h)}`);
        c.ok(!/!\[|\]\[/.test(p.text) && /A made-up harbour, drawn as a small shape:/.test(p.text), `[${where}] the demo note's words are drawn without the raw \`![..][..]\` text: ${JSON.stringify(p.text.slice(0, 110))}`);
        await demoKit.shot(o, `pictures-demo-${where}`);

        // the note of two modules: every kind of definition in the first
        await casesKit.open(o, CASES);
        await casesKit.goTo(o, "activity:harbour/shapes");
        await settled(o); await frames(o);
        p = await pictures(o);
        const want = { "The harbour": "images/shape.svg", "A boat": "my boat.png", dot: "dot.png", wave: "images/wave.png" };
        c.ok(p.imgs.length === 6, `[${where}] six pictures in the module that holds the definitions (the full, space, collapsed, shortcut, web and missing ones), no more: ${p.imgs.map(i => i.alt).join(", ")}`);
        for (const [alt, file] of Object.entries(want)) {
          const m = by(p, alt);
          c.ok(m.length === 1 && m[0].src.startsWith("app://") && m[0].dec.includes(file) && m[0].loaded, `[${where}] \`${alt}\` draws one picture, an app:// address for ${file}, loaded: ${JSON.stringify(m.map(i => ({ src: i.src.slice(0, 60), loaded: i.loaded })))}`);
        }
        const boat = by(p, "A boat")[0];
        c.ok(boat && /my(%20| )boat\.png/.test(boat.src), `[${where}] the path with a space is one address (the space kept, not cut): ${boat && boat.src}`);
        const far = by(p, "Far away");
        c.ok(far.length === 1 && far[0].src === "https://example.invalid/far.png", `[${where}] the web address is the picture's own address, no vault file: ${JSON.stringify(far.map(i => i.src))}`);
        const gone = by(p, "Gone");
        c.ok(gone.length === 1 && gone[0].broken && /nothere\.png$/.test(gone[0].src) && p.vaultHas.every(x => !x), `[${where}] the missing file is a broken picture (drawn, nothing loaded, no such file in the vault): ${JSON.stringify(gone.map(i => ({ src: i.src.slice(0, 80), broken: i.broken })))} vault has it: ${p.vaultHas}`);
        c.ok(!/!\[|\]\[/.test(p.text), `[${where}] no raw \`![..][..]\` text is left among the words of the module with the definitions: ${JSON.stringify(p.text.slice(0, 160))}`);
        c.ok(p.svgs.length === 1 && p.svgs[0].inP && !p.svgs[0].inImg && p.svgs[0].w > 0 && /An inline shape, in a line of words\./.test(p.text), `[${where}] the inline svg is still an svg inside its paragraph (not turned into a picture), with a width: ${JSON.stringify(p.svgs)}`);
        await casesKit.shot(o, `pictures-cases-${where}-light`);
        await o.setScheme("dark"); await frames(o); await casesKit.shot(o, `pictures-cases-${where}-dark`);
        await o.setScheme("light"); await frames(o);

        // the other module has none of these definitions: the same names stay words
        await casesKit.goTo(o, "activity:plain/bare");
        await settled(o);
        p = await pictures(o);
        c.ok(p.imgs.length === 0, `[${where}] a definition in one module draws no picture in another module that lacks it: ${p.imgs.length} pictures`);
        c.ok(p.text.includes("![The harbour][harbour]") && p.text.includes("![dot][]"), `[${where}] and its words stay as written: ${JSON.stringify(p.text.slice(0, 120))}`);
        await casesKit.shot(o, `pictures-bare-${where}`);

        // a note with no picture draws as it did (check 2's counts for this note), with no picture in it
        await plainKit.open(o, PLAIN);
        await sleep(600);
        const d = await o.evaluate(sel => {
          const v = document.querySelector(sel), q = s => v.querySelectorAll(s).length;
          return { choice: q(".booklet-choices:not(.booklet-scale) button"), scale: q(".booklet-scale button"), text: q("input[type=text]"), imgs: [...v.querySelectorAll("img")].filter(e => !e.closest(".callout-icon") && !e.closest("button")).length, raw: /!\[|\]\[/.test(v.textContent), title: (v.querySelector(".booklet-card-title") || {}).textContent };
        }, BOOK);
        c.ok(d.choice === 3 && d.scale === 5 && d.text === 1 && d.imgs === 0 && !d.raw && d.title === "How was today?", `[${where}] a note with no picture draws as before (3 choice buttons, 5 scale buttons, 1 text input, no picture, no raw picture text): ${JSON.stringify(d)}`);

        c.ok(demoKit.sha(demoFile) === hDemo && casesKit.sha(casesFile) === hCases && plainKit.sha(plainFile) === hPlain && fs.readFileSync(casesFile).equals(bytesCases) && fs.readFileSync(demoFile).equals(bytesDemo), `[${where}] drawing all three notes wrote nothing into them (file bytes before and after are equal)`);
        if (where === "phone") { await o.page.setViewportSize({ width: 1280, height: 900 }); await mobile(o, false); }
      });
    }
    return c;
  }
  return { 33: check33 };
};
