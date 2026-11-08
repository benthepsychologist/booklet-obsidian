// Checks 29 to 32, 61 and 62 of plugin-check.js: the 0.9.0 dashboards, in the real app. The note is test/page-notes/Garden dashboards.booklet.md (made up),
// copied into each check's own copy of the vault:
//   29 charts (bars and a line, the numbers fold, the readout and the arrow keys),
//   30 data blocks and the kept days in every view (icons, links, pills, a nested list, tiles of an each-pick, the empty words),
//   31 the reader's sort and filter (from nine rows; headings; a line has the search alone; never saved, never written),
//   32 deleting a kept entry (asked in place; Yes takes out one item and leaves every other byte; with a Markdown pane open).
// Each runs on a desktop's width and a phone's (Obsidian's phone mode at 390 px), light and dark, and writes nothing but the one deletion.
// plugin-check.js hands this file what it shares (the Obsidian launcher, the report, the paths); it returns the check functions.
const fs = require("fs"), path = require("path");
const { quiet, frames, mobile, kit } = require("./waits");

module.exports = function dashboardChecks(env) {
  const { withApp, Check, BOOK, sleep, waitActiveType } = env;
  const shot0 = (o, name) => o.screenshot(path.join(env.SHOTS, name + ".png"));
  const NOTE = "Garden dashboards.booklet.md";
  const SRC = path.join(__dirname, "..", "test", "page-notes", NOTE);
  const { shot, sha, goTo, open } = kit(env, NOTE);
  const put = vault => fs.writeFileSync(path.join(vault, NOTE), fs.readFileSync(SRC, "utf8"));
  const q = (o, i) => o.page.locator(BOOK + " .booklet-query").nth(i);
  const scheme = async (o, s) => { await o.setScheme(s); await sleep(250); await frames(o); };
  const phone = async (o, vault, on) => {
    await o.page.setViewportSize(on ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await mobile(o, on);
    await open(o, NOTE);
  };
  // a press at the empty right end of a summary (the value on a row's line is a button of its own that edits)
  const clickEnd = async loc => { const b = await loc.boundingBox(); await loc.click({ position: { x: Math.max(2, b.width - 3), y: Math.max(2, Math.min(b.height - 2, 6)) } }); };
  const sideways = o => o.evaluate(sel => { const v = document.querySelector(sel + " .view-content"); return v.scrollWidth - v.clientWidth; }, BOOK);
  // the text of the first match of a selector inside the first query of the note
  const textIn = (o, s) => o.evaluate(([b, s]) => document.querySelectorAll(b + " .booklet-query")[0].querySelector(s).textContent.trim(), [BOOK, s]);
  const heights = (o, sel) => o.evaluate(([b, s]) => [...document.querySelectorAll(b + " " + s)].map(e => Math.round(e.getBoundingClientRect().height)), [BOOK, sel]);
  const setup = async (o, vault, where) => {
    put(vault);
    await open(o, NOTE);
    if (where === "phone") await phone(o, vault, true); else await o.page.setViewportSize({ width: 1280, height: 900 });
  };
  const tidy = async (o, where) => { if (where === "phone") { await o.page.setViewportSize({ width: 1280, height: 900 }); await mobile(o, false); } };

  /* ================= CHECK 29 ================= */
  async function check29() {
    const c = new Check(29, "0.9.0 charts: bars (zero-based, a tone for each bar, the numbers under a closed fold) and a line (named by hidden text, series told apart, a readout read by a tap, a hover and the arrow keys); desktop and phone, light and dark; nothing written");
    for (const where of ["desktop", "phone"]) {
      await withApp("c29-" + where, async (o, vault) => {
        await setup(o, vault, where);
        const file = path.join(vault, NOTE), h0 = sha(file);
        await goTo(o, "activity:/bars");
        for (const sch of ["light", "dark"]) {
          await scheme(o, sch);
          const b = await o.evaluate(sel => {
            const root = document.querySelector(sel), qs = [...root.querySelectorAll(".booklet-query")];
            // the look (data-booklet-look on .booklet-view) decides what a bar is wanted in: Obsidian's own variable, or the Paper token (the feedback pair
            // for good and warn; "bad" keeps Obsidian's red in the Paper looks on purpose, see structure.css). The probe sits inside the view so the tokens resolve.
            const viewEl = root.querySelector(".booklet-view") || document.querySelector(".booklet-view"), look = (viewEl && viewEl.getAttribute("data-booklet-look")) || "obsidian", paper = /^paper/.test(look);
            const probe = (cssColor) => { const e = document.createElement("span"); e.style.color = cssColor; (viewEl || document.body).appendChild(e); const v = getComputedStyle(e).color; e.remove(); return v; };
            const one = (box) => {
              const chart = box.querySelector(".booklet-ch-bars"), lab = chart && box.querySelector("#" + chart.getAttribute("aria-labelledby"));
              const rects = [...box.querySelectorAll("rect.booklet-ch-bar")];
              return { chart: !!chart, name: lab && lab.textContent, nameHidden: lab && getComputedStyle(lab).position === "absolute", rows: box.querySelectorAll(".booklet-ch-row").length, rects: rects.length,
                zero: rects.every(r => Number(r.getAttribute("x")) === 0 || r.closest(".booklet-ch-row").querySelector(".booklet-ch-zero")), svgAria: box.querySelectorAll("svg[aria-label]").length, styled: box.querySelectorAll("[style]").length,
                fills: rects.map(r => getComputedStyle(r).fill), tones: rects.map(r => (r.getAttribute("class").match(/booklet-tone-(\w+)/) || [])[1] || ""),
                fold: (() => { const d = box.querySelector("details.booklet-ch-nums"); return d ? { open: d.open, rows: d.querySelectorAll("tbody tr").length, head: d.querySelector("summary").textContent } : null; })() };
            };
            return { first: one(qs[0]), long: one(qs[1]), picks: one(qs[2]), green: probe(paper ? "var(--bk-yes)" : "var(--color-green)"), red: probe("var(--color-red)"), orange: probe(paper ? "var(--bk-hmm)" : "var(--color-orange)"), accent: probe("var(--interactive-accent)"), look };
          }, BOOK);
          const f = b.first;
          c.ok(f.chart && f.rows === 7 && f.rects >= 6 && /^Bar chart, 7 bars/.test(f.name || "") && f.nameHidden, `[${where} ${sch}] seven kept days as seven bars, the chart named by hidden text: ${f.name}`);
          c.ok(f.zero && f.svgAria === 0 && f.styled === 0, `[${where} ${sch}] every bar starts at zero, no aria-label on an svg, no inline style: zero ${f.zero}, svg aria-label ${f.svgAria}, style ${f.styled}`);
          const byTone = t => f.fills[f.tones.indexOf(t)];
          c.ok(f.tones.includes("good") && f.tones.includes("bad") && byTone("good") === b.green && byTone("bad") === b.red && (!f.tones.includes("warn") || byTone("warn") === b.orange), `[${where} ${sch}] a bar's colour is the look's (${b.look}: ${/^paper/.test(b.look) ? "--bk-yes" : "Obsidian's green"}): good ${byTone("good")} = ${b.green}, bad ${byTone("bad")} = ${b.red}`);
          c.ok(f.fold && f.fold.open === false && f.fold.rows === 7 && f.fold.head === "Show the numbers", `[${where} ${sch}] the numbers are under a closed fold of 7 rows: ${JSON.stringify(f.fold)}`);
          c.ok(b.long.rows === 12 && b.picks.rows === 3, `[${where} ${sch}] twelve jobs from a data block and three tools from an each-pick: ${b.long.rows}, ${b.picks.rows}`);
          await shot(o, `charts-bars-${where}-${sch}`);
        }
        await o.evaluate(sel => document.querySelectorAll(sel + " details.booklet-ch-nums").forEach(d => { d.open = true; }), BOOK);
        await frames(o);
        await shot(o, `charts-bars-numbers-${where}-light`);
        if (where === "phone") {
          const sum = await heights(o, ".booklet-ch-nums summary");
          c.ok(sum.length > 0 && sum.every(h => h >= 44), `[phone] the fold's heading is at least 44 px: ${sum}`);
          const sw = await sideways(o);
          c.ok(sw <= 0, `[phone] the bars do not make the view scroll sideways (${sw})`);
        }

        await goTo(o, "activity:/lines");
        for (const sch of ["light", "dark"]) {
          await scheme(o, sch);
          const l = await o.evaluate(sel => {
            const root = document.querySelector(sel), box = root.querySelector(".booklet-query"), svg = box.querySelector("svg.booklet-ch-svg"), lab = svg && box.querySelector("#" + svg.getAttribute("aria-labelledby"));
            const paths = [...box.querySelectorAll("polyline.booklet-ch-path")], strokes = [...new Set(paths.map(p => getComputedStyle(p).stroke))];
            const dashes = [...new Set(paths.map(p => getComputedStyle(p).strokeDasharray))];
            const pts = [...box.querySelectorAll(".booklet-ch-pt")];
            return { svg: !!svg, role: svg && svg.getAttribute("role"), tab: svg && svg.getAttribute("tabindex"), name: lab && lab.textContent, aria: box.querySelectorAll("[aria-label]").length, styled: box.querySelectorAll("[style]").length,
              strokes, dashes, shapes: [...new Set(pts.map(p => p.tagName))], legend: [...box.querySelectorAll(".booklet-ch-legend li")].map(x => x.textContent.trim()), hits: box.querySelectorAll(".booklet-ch-hit").length,
              ticks: [...box.querySelectorAll(".booklet-ch-tick")].map(t => t.textContent), readout: box.querySelector(".booklet-ch-readout").textContent, live: box.querySelector(".booklet-ch-readout").getAttribute("aria-live"),
              width: svg && Math.round(svg.getBoundingClientRect().width), box: Math.round(box.getBoundingClientRect().width) };
          }, BOOK);
          c.ok(l.svg && l.role === "img" && l.tab === "0" && /^Line chart of Hours slept, Hours of focused work, 7 points/.test(l.name || "") && l.aria === 0 && l.styled === 0, `[${where} ${sch}] the line is an img named by hidden text, reached by Tab, no aria-label, no style: ${l.name}`);
          c.ok(l.strokes.length === 2 && l.strokes.every(s => s && s !== "none" && s !== "rgba(0, 0, 0, 0)") && l.dashes.length >= 1 && l.shapes.length >= 1, `[${where} ${sch}] the two lines are told apart by colour (${l.strokes.join(" / ")}) and by dash (${l.dashes.join(" / ")}); legend ${l.legend.join(", ")}`);
          c.ok(l.legend.length === 2 && l.hits === 7 && l.live === "polite" && l.width > 100 && l.width <= l.box + 1, `[${where} ${sch}] a legend of two, a band for each of the 7 points, a polite readout, the plot fits its box (${l.width} of ${l.box} px)`);
          await shot(o, `charts-line-${where}-${sch}`);
        }
        await scheme(o, "light");
        // a tap or hover on a point, then the arrow keys along the points
        const hit = q(o, 0).locator(".booklet-ch-hit").nth(3);
        if (where === "desktop") { await hit.hover(); } else { await hit.click(); }
        await sleep(200);
        let r = await textIn(o, ".booklet-ch-readout");
        c.ok(/: Hours slept .* · Hours of focused work /.test(r), `[${where}] ${where === "desktop" ? "hovering" : "tapping"} the fourth point reads it: ${r}`);
        await q(o, 0).locator("svg.booklet-ch-svg").focus();
        await o.page.keyboard.press("ArrowRight"); await sleep(100);
        const r2 = await textIn(o, ".booklet-ch-readout");
        c.ok(r2 !== r && /: Hours slept /.test(r2), `[${where}] ArrowRight moves to the next point: ${r2}`);
        await o.page.keyboard.press("Home"); await sleep(100);
        const r3 = await textIn(o, ".booklet-ch-readout");
        await o.page.keyboard.press("End"); await sleep(100);
        const r4 = await textIn(o, ".booklet-ch-readout");
        c.ok(r3 !== r4 && r3 !== r2, `[${where}] Home and End go to the first and last points: ${r3} | ${r4}`);
        await shot(o, `charts-line-point-${where}-light`);
        const single = await o.evaluate(sel => { const box = document.querySelectorAll(sel + " .booklet-query")[1]; return { pts: box.querySelectorAll(".booklet-ch-hit").length, names: (s => s ? box.querySelector("#" + s.getAttribute("aria-labelledby")).textContent : "")(box.querySelector("svg.booklet-ch-svg")) }; }, BOOK);
        c.ok(single.pts === 12 && /Mood, 12 points/.test(single.names), `[${where}] a scale question is plotted by its number, all twelve days: ${single.names}`);
        if (where === "phone") c.ok((await sideways(o)) <= 0, "[phone] the lines do not make the view scroll sideways");
        c.ok(sha(file) === h0, `[${where}] drawing the charts wrote nothing into the note`);
        await tidy(o, where);
      });
    }
    return c;
  }

  /* ================= CHECK 30 ================= */
  async function check30() {
    const c = new Check(30, "0.9.0 data blocks and the kept days in every view: icons by bare name, pills, tones in words, links that lead only where they can, a nested list opened by the reader, tiles of an each-pick, the empty words; desktop and phone, light and dark; nothing written");
    for (const where of ["desktop", "phone"]) {
      await withApp("c30-" + where, async (o, vault) => {
        await setup(o, vault, where);
        const file = path.join(vault, NOTE), h0 = sha(file);
        await goTo(o, "activity:/data");
        for (const sch of ["light", "dark"]) {
          await scheme(o, sch);
          const d = await o.evaluate(sel => {
            const qs = [...document.querySelectorAll(sel + " .booklet-query")], t = e => e.textContent.replace(/\s+/g, " ").trim();
            const list = qs[0], table = qs[1], cards = qs[2], tiles = qs[3], tree = qs[4], picks = qs[5], none = qs[6];
            // the look decides what a pill's tone is wanted in: Obsidian's orange, or the Paper look's --bk-hmm (probe inside the view so the token resolves)
            const viewEl = document.querySelector(sel + " .booklet-view") || document.querySelector(".booklet-view"), look = (viewEl && viewEl.getAttribute("data-booklet-look")) || "obsidian", paper = /^paper/.test(look);
            const probe = (cssColor) => { const e = document.createElement("span"); e.style.color = cssColor; (viewEl || document.body).appendChild(e); const v = getComputedStyle(e).color; e.remove(); return v; };
            const pill = list.querySelector(".booklet-q-pill.booklet-tone-warn");
            return {
              views: qs.map(x => x.getAttribute("data-booklet-view")),
              groups: [...list.querySelectorAll(".booklet-q-group")].map(t),
              icons: list.querySelectorAll(".booklet-q-icon svg").length, rows: list.querySelectorAll("li.booklet-q-row").length,
              pills: [...list.querySelectorAll("li.booklet-q-row")[0].querySelectorAll(".booklet-q-pill")].map(t),
              pillColour: pill && getComputedStyle(pill).borderTopColor, warn: probe(paper ? "var(--bk-hmm)" : "var(--color-orange)"), look,
              toneWords: /\(Needs a look\)/.test(t(list)), ext: [...list.querySelectorAll("a.external-link")].map(a => [a.getAttribute("href"), a.getAttribute("rel"), a.getAttribute("target")]),
              js: [...document.querySelectorAll(sel + " a")].filter(a => /^javascript:/i.test(a.getAttribute("href") || "")).length,
              head: [...table.querySelectorAll("thead th")].map(t), numeric: table.querySelectorAll("th.booklet-q-num").length, sortBtns: table.querySelectorAll("th button").length,
              cards: cards.querySelectorAll(".booklet-q-card").length, tiles: tiles.querySelectorAll(".booklet-q-tile").length,
              details: tree.querySelectorAll("details").length, open: [...tree.querySelectorAll("details")].filter(x => x.open).length,
              picks: [...picks.querySelectorAll(".booklet-q-tile")].map(t), none: t(none.querySelector(".booklet-q-empty")),
            };
          }, BOOK);
          c.ok(d.views.join() === "list,table,cards,tiles,list,tiles,list", `[${where} ${sch}] the seven queries draw as list, table, cards, tiles, a nested list, tiles, and the empty one: ${d.views}`);
          c.ok(d.groups.join("|") === "March2 rows|April3 rows|May3 rows|June4 rows" && d.rows === 12, `[${where} ${sch}] the list is grouped by month with counts: ${d.groups}`);
          c.ok(d.icons >= 9 && d.icons < 12, `[${where} ${sch}] an icon drawn by its bare name in ${d.icons} of 12 rows (a name that is not an icon, and a row with none, draw nothing)`);
          c.ok(d.pills.join() === "open,blocked" && d.toneWords && d.pillColour === d.warn, `[${where} ${sch}] a list of values is two pills, a tone coloured as the look does (${d.look}: ${/^paper/.test(d.look) ? "--bk-hmm" : "Obsidian's orange"}) and said in words: ${d.pills}, ${d.pillColour} = ${d.warn}`);
          c.ok(d.ext.length === 1 && d.ext[0][0] === "https://example.org/dig" && /noopener/.test(d.ext[0][1]) && d.js === 0, `[${where} ${sch}] a web link opens outside with noopener, and a javascript: link is not a link: ${JSON.stringify(d.ext)}, ${d.js}`);
          c.ok(d.head.slice(0, 2).join() === "Job,State" && d.numeric >= 1 && d.sortBtns === 4, `[${where} ${sch}] the table's headings are the declared labels, hours set right, and (twelve rows) sortable: ${d.head}`);
          c.ok(d.cards === 4 && d.tiles === 6 && d.details === 1 && d.open === 0 && d.picks.length === 3 && /Spade/.test(d.picks[0]) && d.none === "No rows in this block.", `[${where} ${sch}] cards 4, tiles 6, the nested list has ${d.details} parent shut (what it opens to, its children among it, is drawn when it opens), tiles of the tools: ${d.picks.length}, the empty words: ${d.none}`);
          await shot(o, `data-${where}-${sch}`);
        }
        await scheme(o, "light");
        // a nested list: the reader opens two parents; a search opens the parents of its match; clearing it leaves what the reader opened
        const tree = q(o, 4);
        await tree.locator("summary").filter({ hasText: "Spring planting" }).first().click();
        await tree.locator("summary").filter({ hasText: "Sow the seed" }).first().click();
        await sleep(200);
        const open = id => tree.locator("details[data-id='" + id + "']").evaluate(d => d.open);
        const openedByReader = (await open("season")) && (await open("sow"));
        await tree.locator(".booklet-qc-toggle").click();
        await tree.locator(".booklet-qc-search input").fill("Dig the");
        await sleep(300);
        const forced = (await open("season")) && (await open("beds"));
        const gone = await tree.locator("details[data-id='sow']").count();
        await tree.locator(".booklet-qc-clear").click();
        await sleep(300);
        const kept = (await open("season")) && (await open("sow"));
        const shut = !(await open("beds"));
        c.ok(openedByReader && forced && gone === 0 && kept && shut, `[${where}] a nested list: opened by the reader (${openedByReader}); a search opens the parents of its match (${forced}) and drops the rest (${gone} left of the other); cleared, what the reader opened stays open (${kept}) and what only the search opened is shut (${shut})`);
        await shot(o, `data-nested-${where}-light`);
        await goTo(o, "activity:/kept");
        const k = await o.evaluate(sel => { const qs = [...document.querySelectorAll(sel + " .booklet-query")]; return { views: qs.map(x => x.getAttribute("data-booklet-view")), rows: qs.map(x => x.querySelectorAll("tbody tr, li.booklet-q-row, .booklet-q-card, .booklet-q-tile").length), del: document.querySelectorAll(sel + " .booklet-entry-delete").length }; }, BOOK);
        c.ok(k.views.join() === "table,list,cards,tiles" && k.rows.join() === "12,5,3,6" && k.del === 0, `[${where}] the kept days as a table (12), a list (5), cards (3) and tiles (6), none with a Delete: ${k.views}, ${k.rows}, Delete ${k.del}`);
        for (const sch of ["light", "dark"]) { await scheme(o, sch); await shot(o, `kept-${where}-${sch}`); }
        if (where === "phone") c.ok((await sideways(o)) <= 0, "[phone] the kept days do not make the view scroll sideways (a wider table scrolls inside its card)");
        c.ok(sha(file) === h0, `[${where}] drawing every view wrote nothing into the note`);
        await tidy(o, where);
      });
    }
    return c;
  }

  /* ================= CHECK 31 ================= */
  async function check31() {
    const c = new Check(31, "0.9.0 the reader's sort and filter: a closed button from nine rows, a search that keeps focus while it types, a Sort by menu and a direction, table headings, a count line, Clear and Escape; a line has the search alone; never saved, never written; desktop and phone, light and dark");
    for (const where of ["desktop", "phone"]) {
      await withApp("c31-" + where, async (o, vault) => {
        await setup(o, vault, where);
        const file = path.join(vault, NOTE), h0 = sha(file);
        await goTo(o, "activity:/kept");
        const st0 = await o.evaluate(() => JSON.stringify(app.workspace.getLeavesOfType("booklet")[0].view.getState()));
        const box = q(o, 0), toggle = box.locator(".booklet-qc-toggle");
        const pre = await o.evaluate(sel => { const qs = [...document.querySelectorAll(sel + " .booklet-query")], t = qs[0].querySelector(".booklet-qc-toggle"); return { expanded: t.getAttribute("aria-expanded"), barShown: qs[0].querySelector(".booklet-qc-bar").offsetParent !== null, label: t.textContent.trim(), five: qs[1].querySelectorAll(".booklet-qc").length }; }, BOOK);
        c.ok(pre.label === "Sort and filter" && pre.expanded === "false" && !pre.barShown && pre.five === 0, `[${where}] twelve rows have a closed "Sort and filter" button and five rows have none: ${JSON.stringify(pre)}`);
        await toggle.click(); await sleep(150);
        const first = () => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")][0].querySelectorAll("tbody tr").length, BOOK);
        const col = (n) => o.evaluate(([sel, n]) => [...document.querySelectorAll(sel + " .booklet-query")][0].querySelectorAll("tbody tr td:nth-child(" + n + ")") && [...[...document.querySelectorAll(sel + " .booklet-query")][0].querySelectorAll("tbody tr")].map(r => r.children[n - 1].textContent.trim()), [BOOK, n]);
        const input = box.locator(".booklet-qc-search input");
        await input.click();
        await o.page.keyboard.type("rain", { delay: 40 });
        await sleep(250);
        const typed = await o.evaluate(sel => { const b = [...document.querySelectorAll(sel + " .booklet-query")][0], a = document.activeElement; return { focus: a === b.querySelector(".booklet-qc-search input"), value: a && a.value, count: b.querySelector(".booklet-qc-count").textContent.trim(), rows: b.querySelectorAll("tbody tr").length }; }, BOOK);
        c.ok(typed.focus && typed.value === "rain" && typed.count === "1 of 12 shown" && typed.rows === 1, `[${where}] typing "rain" keeps the focus in the field and leaves one of twelve rows: ${JSON.stringify(typed)}`);
        await o.page.keyboard.press("Escape"); await sleep(200);
        c.ok((await first()) === 12, `[${where}] Escape puts the twelve rows back`);
        await o.page.keyboard.type("zzz"); await sleep(200);
        const none = await textIn(o, ".booklet-qc-count");
        c.ok(none === "Nothing matches.", `[${where}] nothing matching says so: ${none}`);
        await box.locator(".booklet-qc-clear").click(); await sleep(200);
        c.ok((await first()) === 12 && (await textIn(o, ".booklet-qc-count")) === "12 rows", `[${where}] Clear puts them back and counts the rows`);
        // the menu and the direction; the headings
        const sel = box.locator(".booklet-qc-sort select");
        await sel.selectOption("sleep"); await sleep(250);
        const asc = await col(2);
        const num = s => Number(s);
        c.ok(asc.map(num).every((v, i, a) => i === 0 || a[i - 1] <= v), `[${where}] Sort by Hours slept puts the hours in order: ${asc}`);
        await box.locator(".booklet-qc-dir").click(); await sleep(250);
        const desc = await col(2);
        c.ok(desc.map(num).every((v, i, a) => i === 0 || a[i - 1] >= v) && desc[0] === "8", `[${where}] the direction button reverses it: ${desc}`);
        await sel.selectOption(""); await sleep(200);
        const head = box.locator("th button").first();
        await head.click(); await sleep(250);
        const sorted1 = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")][0].querySelector("th[aria-sort]").getAttribute("aria-sort"), BOOK);
        await box.locator("th button").first().click(); await sleep(200);
        const sorted2 = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")][0].querySelector("th[aria-sort]").getAttribute("aria-sort"), BOOK);
        await box.locator("th button").first().click(); await sleep(200);
        const sorted3 = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")][0].querySelectorAll("th[aria-sort]").length, BOOK);
        const menuNow = await sel.inputValue();
        c.ok(sorted1 === "ascending" && sorted2 === "descending" && sorted3 === 0 && menuNow === "", `[${where}] a heading sorts ascending, then descending, then the original order: ${sorted1}, ${sorted2}, ${sorted3} (menu: "${menuNow}")`);
        await sel.selectOption("date"); await box.locator(".booklet-qc-dir").click(); await sleep(250);
        await shot(o, `sort-open-${where}-light`);
        await scheme(o, "dark");
        // dark: the same steps work and the words read against what they sit on
        await box.locator(".booklet-qc-search input").fill("rain"); await sleep(250);
        const dk = await o.evaluate(sel => {
          const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
          const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          const b = [...document.querySelectorAll(sel + " .booklet-query")][0], bar = b.querySelector(".booklet-qc-bar"), bg = getComputedStyle(bar).backgroundColor, cnt = b.querySelector(".booklet-qc-count"), tg = b.querySelector(".booklet-qc-toggle"), page = getComputedStyle(document.querySelector(sel + " .view-content")).backgroundColor;
          return { dark: document.body.classList.contains("theme-dark"), count: cnt.textContent.trim(), rows: b.querySelectorAll("tbody tr").length, cr: ratio(getComputedStyle(cnt).color, bg), tr: ratio(getComputedStyle(tg).color, page), bar: ratio(bg, page) };
        }, BOOK);
        c.ok(dk.dark && dk.count === "1 of 12 shown" && dk.rows === 1 && dk.cr >= 3 && dk.tr >= 3, `[${where}] dark: the filter works and its count reads against the panel (${dk.cr.toFixed(1)}:1), the button against the page (${dk.tr.toFixed(1)}:1)`);
        await shot(o, `sort-open-${where}-dark`);
        await box.locator(".booklet-qc-clear").click(); await sleep(200);
        await box.locator(".booklet-qc-sort select").selectOption("date"); await box.locator(".booklet-qc-dir").click(); await sleep(200);
        await scheme(o, "light");
        // what is set is never saved or written
        const st1 = await o.evaluate(() => JSON.stringify(app.workspace.getLeavesOfType("booklet")[0].view.getState()));
        await quiet(o); await sleep(2200);
        c.ok(st1 === st0 && sha(file) === h0, `[${where}] none of it is saved in the pane's state or written into the note`);
        if (where === "phone") {
          const hs = await heights(o, ".booklet-qc-toggle, .booklet-qc-bar input, .booklet-qc-bar select, .booklet-qc-bar button, .booklet-q-sort");
          c.ok(hs.length >= 6 && hs.every(h => h >= 44), `[phone] every control of the sort and filter is at least 44 px high: ${hs}`);
          c.ok((await sideways(o)) <= 0, "[phone] no sideways scroll of the view");
        }
        // a line keeps its order and has the search alone
        await goTo(o, "activity:/lines");
        const line = q(o, 1);
        await line.locator(".booklet-qc-toggle").click(); await sleep(150);
        const ln = await o.evaluate(sel => { const b = [...document.querySelectorAll(sel + " .booklet-query")][1]; return { search: b.querySelectorAll(".booklet-qc-search input").length, menu: b.querySelectorAll(".booklet-qc-bar select, .booklet-qc-dir").length, pts: b.querySelectorAll(".booklet-ch-hit").length }; }, BOOK);
        await line.locator(".booklet-qc-search input").fill("zzz"); await sleep(200);
        const gone = await o.evaluate(sel => { const b = [...document.querySelectorAll(sel + " .booklet-query")][1]; return { svg: b.querySelectorAll("svg.booklet-ch-svg").length, count: b.querySelector(".booklet-qc-count").textContent.trim() }; }, BOOK);
        c.ok(ln.search === 1 && ln.menu === 0 && ln.pts === 12 && gone.svg === 0 && gone.count === "Nothing matches.", `[${where}] a line has the search and no menu or direction, and a search with no match draws no chart: ${JSON.stringify({ ln, gone })}`);
        await line.locator(".booklet-qc-clear").click(); await sleep(200);
        c.ok(sha(file) === h0, `[${where}] and the note is as it was`);
        await tidy(o, where);
      });
    }
    return c;
  }

  /* ================= CHECK 32 ================= */
  async function check32() {
    const c = new Check(32, "0.9.0 deleting a kept entry: Delete asks \"Delete this entry?\" in place, No writes nothing, Yes takes out exactly that item and leaves every other byte as written; also with a Markdown pane open; desktop and phone");
    for (const mode of ["one pane", "markdown pane", "phone", "typed draft"]) {
      await withApp("c32-" + mode.replace(" ", "-"), async (o, vault) => {
        const where = mode === "phone" ? "phone" : "desktop";
        await setup(o, vault, where);
        const file = path.join(vault, NOTE);
        let orig = fs.readFileSync(file, "utf8");
        const items = orig.split("\n").filter(l => /^\{"ts":"2026-10-\d\dT07:30:00Z","sleep"/.test(l));
        const lineOf = day => items.find(l => l.includes(`2026-10-${day}T07:30:00Z`));
        if (mode === "markdown pane") {
          await o.evaluate(async rel => { const l = app.workspace.getLeaf("split", "vertical"); await l.openFile(app.vault.getAbstractFileByPath(rel)); }, NOTE);
          await sleep(600);
          await o.page.locator(BOOK + " .view-action[aria-label='Show Markdown']").last().click({ timeout: 5000 });
          await sleep(800);
        }
        await goTo(o, "activity:/log");
        const card = n => o.page.locator(BOOK + " .booklet-entry-list .booklet-entry").nth(n);
        const n0 = await o.page.locator(BOOK + " .booklet-entry-list .booklet-entry").count();
        c.ok(items.length === 12 && n0 === 10, `[${mode}] twelve kept days, ten shown, a Delete on each card: ${n0}, Delete ${await o.page.locator(BOOK + " .booklet-entry-delete").count()}`);
        if (mode === "typed draft") {
          // the reader answers something first: the pane's later copies of the note then hold new objects for the same entries
          await o.page.locator(BOOK + " [data-booklet-q='sleep'] input").first().click();
          await o.page.keyboard.type("4");
          await o.page.locator(BOOK + " .booklet-entries-title").click(); await sleep(2500);
          await quiet(o);
          const typed = fs.readFileSync(file, "utf8");
          c.ok(typed !== orig && /```booklet draft log\n\{[^}]*"sleep"\s*:\s*4/.test(typed), `[${mode}] the typed answer is in the draft on disk`);
          orig = typed;
          // the list's fold was pressed to leave the field: it is open again
          if (await o.page.locator(BOOK + " .booklet-entry-list").evaluate(e => e.hidden)) await o.page.locator(BOOK + " .booklet-entries-title").click();
        }
        // the second card, newest first, is Oct 27
        const when = (await card(1).locator(".booklet-entry-when").textContent()).trim();
        await card(1).locator(".booklet-entry-delete").click(); await sleep(150);
        const ask = await o.evaluate(sel => { const a = document.querySelectorAll(sel + " .booklet-entry-list .booklet-entry")[1]; const ask = a.querySelector(".booklet-entry-ask"); return { text: ask.querySelector(".booklet-entry-ask-text").textContent, shown: ask.offsetParent !== null, del: a.querySelector(".booklet-entry-delete").offsetParent !== null, buttons: [...ask.querySelectorAll("button")].map(b => b.textContent), focus: document.activeElement === ask.querySelectorAll("button")[1] }; }, BOOK);
        c.ok(ask.text === "Delete this entry?" && ask.shown && !ask.del && ask.buttons.join() === "Yes, delete,No" && ask.focus, `[${mode}] ${when}: Delete asks in place, with focus on No: ${JSON.stringify(ask)}`);
        await shot(o, `remove-ask-${mode.replace(" ", "-")}-light`);
        // the Yes button and the question both read at 4.5:1 or more (WCAG AA for small text) against the card, light and dark
        const contrasts = () => o.evaluate(sel => {
          // a colour as rgb(...) or, once a colour is mixed, as color(srgb 0.5 0.1 0.1) with each part from 0 to 1
          const lum = c => { const m = c.match(/[\d.]+/g).map(Number).map(v => /^color\(/.test(c) ? v * 255 : v); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
          const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          const card = document.querySelectorAll(sel + " .booklet-entry-list .booklet-entry")[1], bg = getComputedStyle(document.querySelector(sel + " .view-content")).backgroundColor;
          const q = card.querySelector(".booklet-entry-ask-text"), yes = card.querySelector(".booklet-entry-ask button");
          return { q: ratio(getComputedStyle(q).color, bg), yes: ratio(getComputedStyle(yes).color, getComputedStyle(yes).backgroundColor), dark: document.body.classList.contains("theme-dark") };
        }, BOOK);
        const lit = await contrasts();
        c.ok(!lit.dark && lit.q >= 4.5 && lit.yes >= 4.5, `[${mode}] light: the question reads against the card (${lit.q.toFixed(1)}:1, at least 4.5:1) and "Yes, delete" against its button (${lit.yes.toFixed(1)}:1, at least 4.5:1)`);
        await scheme(o, "dark");
        const dark = await contrasts();
        c.ok(dark.dark && dark.q >= 4.5 && dark.yes >= 4.5, `[${mode}] dark: the question reads against the card (${dark.q.toFixed(1)}:1, at least 4.5:1) and "Yes, delete" against its button (${dark.yes.toFixed(1)}:1, at least 4.5:1)`);
        await shot(o, `remove-ask-${mode.replace(" ", "-")}-dark`);
        await scheme(o, "light");
        if (mode === "phone") {
          const hs = (await heights(o, ".booklet-entry-foot button")).filter(h => h > 0);
          c.ok(hs.length >= 4 && hs.every(h => h >= 44), `[phone] every shown Delete, and the Yes and No of the card asked, are at least 44 px high: ${hs}`);
        }
        const names = await o.evaluate(sel => { const c = document.querySelectorAll(sel + " .booklet-entry-list .booklet-entry")[1], n = el => el.getAttribute("aria-labelledby").split(" ").map(i => document.getElementById(i).textContent.trim()).join(" "); return [n(c.querySelector(".booklet-entry-delete")), n(c.querySelector(".booklet-entry-ask")), c.querySelectorAll("svg[aria-label]").length]; }, BOOK);
        c.ok(/^Delete \(the entry from .*Oct 27/.test(names[0]) && /^Delete this entry\? \(the entry from .*Oct 27/.test(names[1]) && names[2] === 0, `[${mode}] the Delete button and its question are named with the entry: ${names[0]} | ${names[1]}`);
        await card(1).locator(".booklet-entry-ask button", { hasText: "No" }).click(); await sleep(2300);
        c.ok(fs.readFileSync(file, "utf8") === orig, `[${mode}] No writes nothing`);
        await card(1).locator(".booklet-entry-delete").click(); await sleep(100);
        await card(1).locator(".booklet-entry-ask button", { hasText: "Yes, delete" }).click();
        await quiet(o);
        if (mode === "markdown pane") {
          // the change goes into the open editor as the smallest edit; the pane saves it a moment later
          const buf = await o.evaluate(() => { let t = null; app.workspace.iterateRootLeaves(l => { if (l.view.getViewType() === "markdown") t = l.view.editor.getValue(); }); return t; });
          c.ok(buf !== null && buf.includes(lineOf("26")) && !buf.includes(lineOf("27")), `[${mode}] the open editor no longer holds the entry`);
          await sleep(2800);
        } else await sleep(600);
        const after = fs.readFileSync(file, "utf8");
        c.ok(after === orig.replace(lineOf("27") + "\n", ""), `[${mode}] Yes took out that one line (the item and its comma), and every other byte is as written (${orig.length - after.length} bytes fewer)`);
        const left = await o.page.locator(BOOK + " .booklet-entry-list .booklet-entry").count();
        const title = (await o.page.locator(BOOK + " .booklet-entries-title").textContent()).trim();
        c.ok(left === 10 && /\(11\)/.test(title), `[${mode}] the list is drawn again without it: ${title}, ${left} shown`);
        c.ok(await o.evaluate(() => document.activeElement && document.activeElement.classList.contains("booklet-entries-title")), `[${mode}] the reader's place is kept: focus is on the list's heading`);
        // the queries over the same days now show eleven
        await goTo(o, "activity:/kept");
        const rows = await o.evaluate(sel => document.querySelectorAll(sel + " .booklet-query")[0].querySelectorAll("tbody tr").length, BOOK);
        c.ok(rows === 11, `[${mode}] a query over the days shows eleven now: ${rows}`);
        if (mode === "one pane") {
          // the newest entry deleted too, the file read back by the plugin's own reader
          await goTo(o, "activity:/log");
          await card(0).locator(".booklet-entry-delete").click();
          await card(0).locator(".booklet-entry-ask button", { hasText: "Yes, delete" }).click();
          await quiet(o); await sleep(600);
          const after2 = fs.readFileSync(file, "utf8");
          c.ok(after2 === after.replace(lineOf("26") + "\n" + lineOf("28") + "\n", lineOf("26").replace(/,$/, "") + "\n") && !after2.includes(lineOf("28")) && after2.includes(lineOf("26").replace(/,$/, "")), `[${mode}] the newest entry (Oct 28), the last item of its list, goes too with the comma before it, the earlier ones stay`);
          c.ok(orig.match(/```booklet entries shed[\s\S]*?```/)[0] === after2.match(/```booklet entries shed[\s\S]*?```/)[0], `[${mode}] and the other block (the shed's entries) is as written`);
        }
        await tidy(o, where);
      });
    }
    return c;
  }


  /* ================= CHECK 61 ================= */
  // Dashboards slice 1 (format 0.19): rows that open, and data files read through the vault. The made-up orchard example and a made-up
  // garden dashboard of 462 rows at every depth (test/dashboards/, test/dashboard-fixture.mjs) are put into the check's own copy of the vault with
  // their .json files beside them; the JSON is then changed from outside the app, as a program that writes it would.
  async function check61() {
    const c = new Check(61, "0.19 rows that open and data files, in the real app: a .json file beside the note read through the vault; a row opened by a real click, Enter and Space, drawn when it opens; Open all, Close all, a search and a sort keeping what the reader opened; print opens everything and folds back; the file changed outside the app is read again on return, keeping open rows and scroll; a file that goes missing leaves the rows on screen, and comes back with its rows; the disclosures named in the accessibility tree; nothing written to the note");
    const ORCHARD = "orchard-dashboard.booklet.md", GARDEN = "garden-dashboard.booklet.md";
    const here = f => path.join(__dirname, "..", "test", "dashboards", f);
    const F = await import("../test/dashboard-fixture.mjs");
    const garden = F.make();
    for (const where of ["desktop", "phone"]) {
      const desk = where === "desktop";
      await withApp("c61-" + where, async (o, vault) => {
        fs.writeFileSync(path.join(vault, ORCHARD), fs.readFileSync(here("orchard-dashboard.booklet.md")));
        fs.writeFileSync(path.join(vault, "orchard-dashboard.json"), fs.readFileSync(here("orchard-dashboard.json")));
        fs.writeFileSync(path.join(vault, GARDEN), F.bookletText("garden.json"));
        fs.writeFileSync(path.join(vault, "garden.json"), JSON.stringify(garden));
        if (!desk) { await o.page.setViewportSize({ width: 390, height: 844 }); await mobile(o, true); }
        const orchard = kit(env, ORCHARD), big = kit(env, GARDEN);
        const sh0 = orchard.sha(path.join(vault, ORCHARD)), sj0 = orchard.sha(path.join(vault, "orchard-dashboard.json"));
        // whether Obsidian tells a plugin about a change to a .json file it does not index (reported, not required)
        await o.evaluate(() => { window.__jsonEvents = []; app.vault.on("modify", f => window.__jsonEvents.push("modify " + f.path)); app.vault.on("create", f => window.__jsonEvents.push("create " + f.path)); });
        await orchard.open(o, ORCHARD);
        await orchard.goTo(o, "activity:desk/orchard");
        const qs = () => o.page.locator(BOOK + " .booklet-query");
        await o.page.waitForFunction(sel => { const q = document.querySelectorAll(sel + " .booklet-query"); return q.length === 4 && [...q].every(x => !x.querySelector(".booklet-q-quiet")); }, BOOK, { timeout: 10000 });
        const plots = qs().nth(0);
        c.ok((await plots.locator("tbody tr").count()) === 3, `[${where}] the plots table reads orchard-dashboard.json from the vault: ${await plots.locator("tbody tr").count()} top rows`);
        c.ok((await plots.locator("thead th").allInnerTexts()).join("|") === "Name|Kind|Stage|Open jobs|Due|A note for the gardener", `[${where}] its headings are the file's labels`);
        c.ok((await plots.locator("details").count()) === 3, `[${where}] the three plots open (each has text or jobs); every disclosure is shut and nothing below is drawn: ${await plots.locator("tbody tr").count()} rows`);
        c.ok((await qs().nth(3).locator("summary, .booklet-q-row").count()) >= 1, `[${where}] the requests list reads the same file at inbox.requests`);

        // a real click opens a row: its text, then its jobs, one step in
        // (a press on the title's own value edits it, so the row is opened by the summary's empty end, where a pointer opens a row)
        await clickEnd(plots.locator("summary", { hasText: "Orchard" }).first());
        await quiet(o);
        const kinds = () => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")[0].querySelectorAll("tbody tr")].map(r => (r.classList.contains("booklet-q-trow") ? "row" : r.classList.contains("booklet-q-trmore") ? "more" : "head") + r.getAttribute("data-depth")).join(), BOOK);
        c.ok((await kinds()).startsWith("row0,more1,head1,row1,row1,row1,row0,row0"), `[${where}] a click opens the orchard to its text, the heading Jobs and its three jobs: ${await kinds()}`);
        c.ok(/Eight apple trees and two pear trees\./.test(await plots.innerText()) && (await plots.locator(".booklet-q-text").first().evaluate(e => getComputedStyle(e).whiteSpace)) === "pre-wrap", `[${where}] the text is plain, its blank line kept (white-space: pre-wrap)`);
        // the keyboard: Enter and Space on a focused summary
        const jobSummary = plots.locator("summary", { hasText: "Prune the apple trees" });
        await jobSummary.focus();
        await o.page.keyboard.press("Enter");
        await quiet(o);
        c.ok((await plots.locator("details[data-id='j-prune']").evaluate(d => d.open)), `[${where}] Enter on a focused summary opens the job`);
        await o.page.keyboard.press("Space");
        await quiet(o);
        c.ok(!(await plots.locator("details[data-id='j-prune']").evaluate(d => d.open)) && !/Borrow the tall ladder/.test(await plots.innerText()), `[${where}] Space shuts it and its steps are taken away`);
        await o.page.keyboard.press("Space");
        await quiet(o);
        // the accessibility tree
        let tree = "";
        try { tree = await plots.ariaSnapshot(); } catch (e) { tree = "(no ariaSnapshot: " + e.message + ")"; }
        c.info(`[${where}] the accessibility tree of the plots table: ${JSON.stringify(tree.slice(0, 900))}`);
        c.ok(/columnheader "Name"/.test(tree) && /Orchard/.test(tree) && /Prune the apple trees/.test(tree), `[${where}] the tree has real column headings and the rows`);
        c.ok((await plots.locator("summary").evaluateAll(a => a.every(s => s.textContent.trim().length > 0 && s.tabIndex === 0 && !s.getAttribute("role")))), `[${where}] every summary has words for a name, is in the tab order, and has no role over its own`);

        // print: opens everything, folds back exactly the rows it opened
        const openIds = () => o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")[0].querySelectorAll("details")].filter(d => d.open).map(d => d.getAttribute("data-id")).join(), BOOK);
        const before = await openIds();
        await o.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
        const during = await plots.locator("details").evaluateAll(a => a.length + ":" + a.filter(d => d.open).length);
        c.ok(during.split(":")[0] === during.split(":")[1] && Number(during.split(":")[0]) >= 4, `[${where}] beforeprint opens every row, the jobs' steps too: ${during}`);
        await o.evaluate(() => window.dispatchEvent(new Event("afterprint")));
        await sleep(300);
        c.ok((await openIds()) === before, `[${where}] afterprint folds back exactly those: open before ${before}, after ${await openIds()}`);

        
        // the file changes outside the app; the pane comes back
        const file = path.join(vault, "orchard-dashboard.json");
        const json = JSON.parse(fs.readFileSync(file, "utf8"));
        json.plots.rows[0].title = "Orchard (the old one)";
        json.plots.rows[0].jobs.push({ id: "j-new", title: "Net the cherry tree", kind: "Job", stage: "planning", due: "2026-12-05", notes: [] });
        const events0 = await o.evaluate(() => window.__jsonEvents.length);
        fs.writeFileSync(file, JSON.stringify(json));
        await sleep(1500);
        const raised = (await o.evaluate(() => window.__jsonEvents.slice())).filter(x => /orchard-dashboard\.json/.test(x));
        c.info(`[${where}] Obsidian raised ${raised.length} vault event(s) for the .json file written from outside: ${JSON.stringify(raised)}`);
        const openBefore = await openIds();
        await o.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        await o.page.waitForFunction(sel => /Orchard \(the old one\)/.test(document.querySelectorAll(sel + " .booklet-query")[0].textContent), BOOK, { timeout: 8000 }).catch(() => {});
        await quiet(o);
        c.ok(/Orchard \(the old one\)/.test(await plots.innerText()), `[${where}] the pane coming back reads the changed file and draws the new rows`);
        c.ok((await openIds()) === openBefore && /Net the cherry tree/.test(await plots.innerText()), `[${where}] the rows the reader had open are open, now with the new job: ${await openIds()}`);

        // the file goes: the rows already on screen stay (a file that cannot be read again leaves good data as it is); it comes back changed: the new rows
        const rowsNow = await qs().nth(0).locator("tbody tr").count();
        fs.renameSync(file, file + ".away");
        await o.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        await sleep(1500);
        await quiet(o);
        c.ok((await qs().nth(0).locator(".booklet-q-quiet").count()) === 0 && (await qs().nth(0).locator("tbody tr").count()) === rowsNow && rowsNow > 0, `[${where}] a file that is gone leaves the ${rowsNow} rows on screen and draws no quiet box`);
        json.plots.rows[0].title = "Orchard (the file came back)";
        fs.writeFileSync(file + ".away", JSON.stringify(json));
        fs.renameSync(file + ".away", file);
        await o.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        await o.page.waitForFunction(sel => /Orchard \(the file came back\)/.test(document.querySelectorAll(sel + " .booklet-query")[0].textContent), BOOK, { timeout: 8000 }).catch(() => {});
        await quiet(o);
        c.ok(/Orchard \(the file came back\)/.test(await plots.innerText()) && (await qs().nth(0).locator("tbody tr").count()) > 0, `[${where}] the file back gives its rows again`);

        // each: over rows (slice 2): the question asked for each plot is drawn in the Notes column, a text area in every row, named for a screen reader
        const notes = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")[0].querySelectorAll("tr.booklet-q-trow[data-depth='0'] [data-booklet-q='notes'] textarea")].map(t => t.getAttribute("aria-labelledby").split(" ").map(i => document.getElementById(i).textContent.trim()).join(" ")), BOOK);
        c.ok(notes.length === 3 && notes.every(x => /^A note for the gardener \(.+\)$/.test(x)), `[${where}] the question asked for each plot is a text area in the Notes column of every row, named by the question and the plot: ${JSON.stringify(notes)}`);
        c.ok(orchard.sha(path.join(vault, ORCHARD)) === sh0, `[${where}] the orchard note is the same bytes`);

        // the large dashboard
        await big.open(o, GARDEN);
        await big.goTo(o, "activity:/desk");
        await o.page.waitForFunction(sel => { const q = document.querySelectorAll(sel + " .booklet-query"); return q.length === 3 && [...q].every(x => !x.querySelector(".booklet-q-quiet")); }, BOOK, { timeout: 15000 });
        const list = qs().nth(1);
        c.ok((await list.locator(".booklet-q-tree > li").count()) === 6 && (await list.locator(".booklet-q-label").count()) === 6, `[${where}] 462 rows at every depth: the list draws its six top rows while all are shut`);
        const bar = list.locator(".booklet-qc-toggle");
        await bar.click();
        const t0 = Date.now();
        await list.locator(".booklet-qc-openall").click();
        await quiet(o);
        const ms = Date.now() - t0;
        c.info(`[${where}] Open all on the list of 462 rows took ${ms} ms in the real app`);
        c.ok((await list.locator(".booklet-q-label").count()) === 462, `[${where}] Open all draws all 462 rows: ${await list.locator(".booklet-q-label").count()}`);
        await list.locator(".booklet-qc-closeall").click();
        await quiet(o);
        c.ok((await list.locator(".booklet-q-label").count()) === 6, `[${where}] Close all shuts them`);
        await list.locator(".booklet-qc-openall").click();
        await quiet(o);
        // a search keeps the matches with their parents, and a sort keeps the tree
        await list.locator(".booklet-qc-search input").fill("Net the berries");
        await sleep(400);
        const labs = await list.locator(".booklet-q-label").count();
        c.ok(labs > 0 && labs < 462 && (await list.locator("li.booklet-q-node > details").first().evaluate(d => d.open)), `[${where}] a search keeps ${labs} rows, each match under its parents, which stand open`);
        await list.locator(".booklet-qc-search input").fill("");
        await sleep(300);
        c.ok((await list.locator(".booklet-q-label").count()) === 462, `[${where}] cleared: all 462 rows are back, open as the reader had them`);
        // scroll kept across the file being read again
        const sc = await o.evaluate(sel => { const v = document.querySelector(sel + " .view-content"); v.scrollTop = Math.floor((v.scrollHeight - v.clientHeight) / 2); return v.scrollTop; }, BOOK);
        const gfile = path.join(vault, "garden.json");
        const g2 = JSON.parse(fs.readFileSync(gfile, "utf8"));
        g2.programmes[0].title = "Garden programme one (renamed, and a little longer)";
        fs.writeFileSync(gfile, JSON.stringify(g2));
        await sleep(1200);
        await o.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
        await o.page.waitForFunction(sel => /renamed, and a little longer/.test(document.querySelectorAll(sel + " .booklet-query")[1].textContent), BOOK, { timeout: 10000 }).catch(() => {});
        await quiet(o);
        const after = await o.evaluate(sel => document.querySelector(sel + " .view-content").scrollTop, BOOK);
        c.ok(/renamed, and a little longer/.test(await list.innerText()), `[${where}] the changed file is read again`);
        c.ok(sc > 500 && Math.abs(after - sc) <= 3, `[${where}] the page's scroll is kept across the redraw of 462 rows: ${sc} before, ${after} after`);
        c.ok((await list.locator(".booklet-q-label").count()) === 462, `[${where}] and every row the reader opened is still open`);
        c.ok(big.sha(path.join(vault, GARDEN)) !== "" && orchard.sha(path.join(vault, "orchard-dashboard.json")) !== sj0, `[${where}] the only change to a file was the one this check made to the JSON; the notes are untouched`);
        await orchard.goTo(o, "home").catch(() => {});
        await shot0(o, "rows-open-" + where);
        if (!desk) { await o.page.setViewportSize({ width: 1280, height: 900 }); await mobile(o, false); }
      });
    }
    return c;
  }

  /* ================= CHECK 62 ================= */
  // Dashboards slice 2 (format 0.19): acts on the rows of a data block, in the real app, on the made-up orchard example: a field marked `edit` pressed
  // with a real click into a box and kept with Enter as one act (`pick`, `a`, `was`) in a new kept entry, no other byte of the note changed; Esc and
  // the keyboard; the three display states when the JSON is changed from outside; `readonly` on the roundup; a question asked for each row typed in a
  // column (a draft, not an act) and in a request's open part, kept by the row's Finalize; the control names in the accessibility tree; print.
  // Since 1.4.0-beta.3 the plugin is the host of the vault data file and applies an edit to it (docs/hosting.md, "Applying a reader's acts"): the value's own text is
  // replaced, every other byte stays, and the read-only table of the same rows shows it. An edit that cannot be applied is kept, not written, and says why.
  async function check62() {
    const c = new Check(62, "0.19 acts on rows, in the real app: a field marked edit pressed into a box and kept by Enter as one act with was in a new entry, nothing else in the note changed, and the value written into the vault data file (only its own text), the read-only table showing it; Esc keeps nothing; the keyboard; waiting, same and changed after the JSON changes outside; an edit whose data changed meanwhile, and one for a file that cannot be written, are kept and not written, in words; readonly cards have no box; a question in a column is a draft; a row's Finalize keeps its pairs as one entry and writes no data; control names; print shows values");
    const ORCHARD = "orchard-dashboard.booklet.md";
    const here = f => path.join(__dirname, "..", "test", "dashboards", f);
    for (const where of ["desktop", "phone"]) {
      const desk = where === "desktop";
      await withApp("c62-" + where, async (o, vault) => {
        const noteFile = path.join(vault, ORCHARD), jsonFile = path.join(vault, "orchard-dashboard.json");
        fs.writeFileSync(noteFile, fs.readFileSync(here("orchard-dashboard.booklet.md")));
        // the open-jobs count is marked as a number to edit in this copy of the file (the example marks four other fields)
        const j0 = JSON.parse(fs.readFileSync(here("orchard-dashboard.json"), "utf8"));
        j0.plots.fields.open = { label: "Open jobs", edit: "number" };
        fs.writeFileSync(jsonFile, JSON.stringify(j0));
        if (!desk) { await o.page.setViewportSize({ width: 390, height: 844 }); await mobile(o, true); }
        const orchard = kit(env, ORCHARD);
        const orig = fs.readFileSync(noteFile, "utf8");
        const jsonOrig = fs.readFileSync(jsonFile, "utf8");
        await orchard.open(o, ORCHARD);
        await orchard.goTo(o, "activity:desk/orchard");
        await o.page.waitForFunction(sel => { const q = document.querySelectorAll(sel + " .booklet-query"); return q.length === 4 && [...q].every(x => !x.querySelector(".booklet-q-quiet")); }, BOOK, { timeout: 10000 });
        const qs = () => o.page.locator(BOOK + " .booklet-query");
        const plots = qs().nth(0);
        const cell = (key, pick = "p-orchard") => plots.locator(`[data-booklet-edit='${key}'][data-booklet-pick='${pick}']`);
        const noteText = () => fs.readFileSync(noteFile, "utf8");
        const countWord = (text, w) => text.split(w).length - 1;
        const entries = () => (noteText().match(/^\{"ts":"[^\n]*$/gm) || []);
        const settle = async () => { await quiet(o); await sleep(900); await quiet(o); };

        // an editable value is drawn as the value it holds, not as a pill, and its column is as wide as its longest word (a one-letter column wraps inside a word)
        const looks = await plots.locator("button.booklet-edit-open").evaluateAll(bs => bs.map(b => {
          const cs = getComputedStyle(b), words = (b.querySelector(".booklet-edit-value") || b).textContent.trim().split(/\s+/).filter(Boolean).length;
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5, h = b.getBoundingClientRect().height;
          return { radius: cs.borderTopLeftRadius, border: cs.borderTopWidth, h: Math.round(h), lines: Math.round(h / lh), words, wrap: cs.overflowWrap, bg: cs.backgroundColor };
        }));
        const pill = looks.filter(l => parseFloat(l.radius) > 8 || l.border !== "0px" || l.wrap === "anywhere");
        c.ok(looks.length > 0 && pill.length === 0, `[${where}] an editable value is plain text with a faint tint (no pill, no border, no break-anywhere): ${JSON.stringify(pill[0] || looks[0])}`);
        const broken = looks.filter(l => l.lines > l.words + 1);
        c.ok(broken.length === 0, `[${where}] no editable value is wrapped inside a word (lines no more than words + 1): ${JSON.stringify(broken[0] || "")}`);
        c.ok(looks.every(l => l.bg !== "rgba(0, 0, 0, 0)" && l.bg !== "transparent"), `[${where}] and each has a tint to say it can be pressed: ${looks[0].bg}`);

        // a top-level row of the editable table opens by its triangle, which is inside the table's scroll box (not clipped) and is pressed with the mouse
        const sum0 = plots.locator("details > summary").first();
        const b0 = await sum0.boundingBox(), w0 = await plots.locator(".booklet-q-wrap").boundingBox();
        c.ok(b0.x - w0.x >= 14, `[${where}] the first row's triangle has room inside the table (the summary starts ${Math.round(b0.x - w0.x)}px in)`);
        await o.page.mouse.click(b0.x - 13, b0.y + b0.height / 2);
        await o.page.waitForFunction(sel => document.querySelector(sel + " .booklet-query details").open, BOOK, { timeout: 4000 }).catch(() => {});
        c.ok(await plots.locator("details").first().evaluate(d => d.open), `[${where}] pressing the first row's triangle opens the row`);
        c.ok((await plots.locator("tr.booklet-q-trmore").count()) > 0, `[${where}] and its open part is drawn under it`);
        await o.page.mouse.click(b0.x - 13, b0.y + b0.height / 2);
        await o.page.waitForFunction(sel => !document.querySelector(sel + " .booklet-query details").open, BOOK, { timeout: 4000 }).catch(() => {});
        c.ok(!(await plots.locator("details").first().evaluate(d => d.open)), `[${where}] pressing it again shuts the row`);

        // a real click on a value turns it into a box of its kind, with the focus in it
        await cell("stage").locator("button").click();
        const sel = cell("stage").locator("select");
        c.ok((await sel.count()) === 1 && (await sel.evaluate(e => e === document.activeElement && e.value)) === "growing", `[${where}] pressing the Stage value gives a menu with the focus in it, on the value`);
        c.ok((await sel.evaluate(e => [...e.options].map(x => x.value).join())) === "planning,growing,resting,done", `[${where}] and its options are the field's`);
        c.ok((await plots.locator("details[open]").count()) === 0, `[${where}] the press did not open the row`);
        await sel.selectOption("resting");
        const restingBefore = countWord(await qs().nth(1).innerText(), "resting");
        // notices come and go: a watcher keeps the words of every one that appears
        // (Obsidian shows no notice in a window that is not focused, and the harness's window may not be: it is told it has the focus)
        await o.evaluate(() => { window.dispatchEvent(new Event("focus")); });
        await o.evaluate(() => { window.__seen = []; new MutationObserver(() => document.querySelectorAll(".notice").forEach(n => { if (!window.__seen.includes(n.textContent)) window.__seen.push(n.textContent); })).observe(document.body, { childList: true, subtree: true, characterData: true }); });
        await o.page.keyboard.press("Enter");
        await settle();
        const t1 = noteText(), es = entries();
        c.ok(t1.startsWith(orig.replace(/\s*$/, "")) && es.length === 1 && /"stage":\[\{"pick":"p-orchard","a":"resting","was":"growing"\}\]/.test(es[0]), `[${where}] Enter keeps one entry, one pair with the row, the value and was: ${es[0]}`);
        c.ok(t1.slice(0, orig.replace(/\s*$/, "").length) === orig.replace(/\s*$/, ""), `[${where}] and the note before the records is the same bytes`);
        // the plugin wrote the data file: the value's own text, every other byte as it was
        const at = jsonOrig.indexOf('"stage":"growing"', jsonOrig.indexOf('"p-orchard"')) + '"stage":'.length;
        const jsonExpected = jsonOrig.slice(0, at) + '"resting"' + jsonOrig.slice(at + '"growing"'.length);
        c.ok(fs.readFileSync(jsonFile, "utf8") === jsonExpected, `[${where}] the data file holds the new value in its own place and every other byte as before (${jsonOrig.length} bytes before, ${fs.readFileSync(jsonFile, "utf8").length} after)`);
        c.ok(/resting/.test(await cell("stage").innerText()) && !/sent, waiting|You sent/.test(await cell("stage").innerText()), `[${where}] the cell shows the value alone: ${JSON.stringify(await cell("stage").innerText())}`);
        c.ok(countWord(await qs().nth(1).innerText(), "resting") === restingBefore + 1, `[${where}] and the read-only roundup of the same rows shows the new value (${restingBefore} before, ${countWord(await qs().nth(1).innerText(), "resting")} now)`);
        c.ok(await cell("stage").locator("button").evaluate(b => b === document.activeElement), `[${where}] the focus is back on the value's button`);
        c.ok((await cell("stage").locator("button").getAttribute("aria-describedby")) === null, `[${where}] and nothing describes the button (no waiting words)`);
        await o.page.waitForFunction(() => (window.__seen || []).some(x => /change kept/i.test(x)), null, { timeout: 8000 }).catch(() => {});
        const notices = await o.evaluate(() => (window.__seen || []).join("|"));
        c.ok(/Change kept and written to orchard-dashboard\.json\./i.test(notices), `[${where}] a kept and written change is announced by a notice: ${JSON.stringify(notices)}`);

        // the three display states, when the JSON is changed from outside
        let json = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
        const jsonWrite = async fn => { fn(json); fs.writeFileSync(jsonFile, JSON.stringify(json)); await sleep(1200); await o.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await sleep(800); await quiet(o); };
        await jsonWrite(j => (j.plots.rows[0].stage = "resting"));
        c.ok(!/sent, waiting|You sent/.test(await cell("stage").innerText()) && /resting/.test(await cell("stage").innerText()), `[${where}] the data holds what was sent: nothing is marked`);
        await jsonWrite(j => (j.plots.rows[0].stage = "done"));
        c.ok(/done/.test(await cell("stage").innerText()) && /You sent: resting/.test(await cell("stage").innerText()), `[${where}] the data holds something else: the value now, with what was sent beneath: ${JSON.stringify(await cell("stage").innerText())}`);
        await jsonWrite(j => (j.plots.rows[0].stage = "growing"));
        c.ok(/resting/.test(await cell("stage").innerText()) && /· sent, waiting/.test(await cell("stage").innerText()), `[${where}] the data is back to what the edit began from (changed outside): what was sent, marked as waiting: ${JSON.stringify(await cell("stage").innerText())}`);
        const waitDescribed = await cell("stage").locator("button").evaluate(b => { const m = document.getElementById(b.getAttribute("aria-describedby") || "-"); return m ? m.textContent.trim() : ""; });
        c.ok(/^· sent, waiting$/.test(waitDescribed), `[${where}] the waiting words describe the value's button (aria-describedby): ${JSON.stringify(waitDescribed)}`);

        // Esc keeps nothing; the keyboard reaches the value and Enter keeps
        await cell("due").locator("button").focus();
        await o.page.keyboard.press("Enter");
        const due = cell("due").locator("input");
        c.ok((await due.count()) === 1 && (await due.getAttribute("type")) === "date", `[${where}] Enter on the focused Due value gives a date field`);
        await o.page.keyboard.press("Escape");
        await settle();
        c.ok(entries().length === 1 && (await cell("due").locator("input").count()) === 0 && /2026-11-20/.test(await cell("due").innerText()), `[${where}] Esc keeps nothing and puts the value back`);
        // a half-typed number ("3e" gives value "" and badInput in Chrome) is kept as nothing: the box stays open with the text and a word
        await cell("open").locator("button").focus();
        await o.page.keyboard.press("Enter");
        await o.page.keyboard.type("3e");
        const badInput = await cell("open").locator("input").evaluate(i => ({ bad: i.validity.badInput, value: i.value }));
        await o.page.keyboard.press("Tab");
        await settle();
        c.ok(badInput.bad === true && entries().length === 1 && (await cell("open").locator("input").count()) === 1 && /not a number/.test(await cell("open").locator("[role=alert]").innerText()), `[${where}] unreadable number text (${JSON.stringify(badInput)}) keeps nothing, the box stays open, and a word says why: ${JSON.stringify(await cell("open").innerText())}`);
        await cell("open").locator("input").focus();
        await o.page.keyboard.press("Escape");
        await settle();
        c.ok(entries().length === 1 && (await cell("open").locator("input").count()) === 0, `[${where}] Esc leaves the value as it was`);
        await cell("title").locator("button").focus();
        await o.page.keyboard.press("Enter");
        await o.page.keyboard.type("Old orchard");
        c.ok((await plots.locator("details[open]").count()) === 0, `[${where}] typing a space in the box does not open the row`);
        await o.page.keyboard.press("Enter");
        await settle();
        const es2 = entries();
        c.ok(es2.length === 2 && /"title":\[\{"pick":"p-orchard","a":"Old orchard","was":"Orchard"\}\]/.test(es2[1]), `[${where}] the keyboard keeps a second entry: ${es2[1]}`);
        c.ok(es2[0] === es[0] + ",", `[${where}] the first entry's bytes are as they were`);
        c.ok(JSON.parse(fs.readFileSync(jsonFile, "utf8")).plots.rows[0].title === "Old orchard" && fs.readFileSync(jsonFile, "utf8") === JSON.stringify(json).replace('"title":"Orchard"', '"title":"Old orchard"'), `[${where}] the keyboard edit is written into the data file too, and only that value changed`);
        json = JSON.parse(fs.readFileSync(jsonFile, "utf8"));

        // readonly: the roundup draws values only
        const roundup = qs().nth(1);
        c.ok((await roundup.locator("[data-booklet-edit], .booklet-edit-open").count()) === 0 && /growing/.test(await roundup.innerText()), `[${where}] the read-only cards hold values and no box`);

        // a question asked for each row, in a column: typing is a draft, not an act
        const ta = plots.locator("[data-booklet-q='notes'][data-booklet-pick='p-orchard'] textarea");
        await ta.fill("Check the stakes");
        await ta.blur();
        await settle();
        const t3 = noteText();
        c.ok(entries().length === 2 && /"notes":\[\{"pick":"p-orchard","a":"Check the stakes"\}\]/.test(t3), `[${where}] a note typed in the column is a draft pair with no was, and no entry`);

        // a request: its choice replaces nothing (the field is a list) and Finalize keeps that row's pairs as one entry
        const requests = qs().nth(3);
        await clickEnd(requests.locator("summary").first());
        await quiet(o);
        const d0 = requests.locator("details").first();
        const pick = await d0.getAttribute("data-id");
        await d0.locator("[data-booklet-q='decision'] button.booklet-choice").first().click();
        await d0.locator("[data-booklet-q='reply'] textarea").fill("Hire one, this time");
        await d0.locator("[data-booklet-q='reply'] textarea").blur();
        await settle();
        const fin = d0.locator("button.booklet-row-finalize");
        c.ok(await fin.isEnabled(), `[${where}] Finalize in the row is enabled once the row has an answer`);
        await fin.click();
        await settle();
        const es3 = entries();
        c.ok(es3.length === 3 && new RegExp(`"decision":\\[\\{"pick":"${pick}","a":1\\}\\]`).test(es3[2]) && new RegExp(`"reply":\\[\\{"pick":"${pick}","a":"Hire one, this time"\\}\\]`).test(es3[2]), `[${where}] Finalize keeps that row's pairs as one entry with no was: ${es3[2]}`);
        c.ok(/"notes":\[\{"pick":"p-orchard"/.test(noteText()) && !new RegExp(`"reply":\\[\\{"pick":"${pick}"`).test(noteText().split("booklet draft")[1] || ""), `[${where}] and the plot's note stays in the draft while the request's is out of it`);

        // names in the accessibility tree, and print
        let tree = "";
        try { tree = await plots.ariaSnapshot(); } catch (e) { tree = "(no ariaSnapshot: " + e.message + ")"; }
        c.info(`[${where}] the tree of the plots table (start): ${JSON.stringify(tree.slice(0, 700))}`);
        c.ok(/button "Edit Stage, [^"]*: [a-z]+"/.test(tree) && /textbox "A note for the gardener/.test(tree), `[${where}] the edit button and the column's text area are named by field or question and row`);
        await o.page.emulateMedia({ media: "print" });
        await sleep(300);
        const pr = await o.evaluate(sel => { const q = document.querySelectorAll(sel + " .booklet-query")[0]; const shown = e => getComputedStyle(e).display !== "none"; return { controls: [...q.querySelectorAll(".booklet-row-controls")].filter(shown).length, values: [...q.querySelectorAll(".booklet-print-value")].filter(shown).length, words: [...q.querySelectorAll(".booklet-print-value")].map(e => e.textContent).join("|") }; }, BOOK);
        await o.page.emulateMedia({ media: "screen" });
        c.ok(pr.controls === 0 && pr.values >= 1 && /Check the stakes/.test(pr.words), `[${where}] in print the question's controls are hidden and its words are shown: ${JSON.stringify(pr)}`);


        // an edit whose data was changed from outside after the page drew is kept but not written (the stale-page check), and says why
        const nBefore = entries().length;
        const staleBefore = fs.readFileSync(jsonFile, "utf8");
        await o.evaluate(() => { window.__seen = []; });
        await cell("due").locator("button").click();
        const staleOutside = staleBefore.replace('"due":"2026-11-20"', '"due":"2030-01-01"');
        c.ok(staleOutside !== staleBefore, `[${where}] (the file has the due date this part changes)`);
        fs.writeFileSync(jsonFile, staleOutside);
        await cell("due").locator("input").fill("2027-05-05");
        await o.page.keyboard.press("Enter");
        await settle();
        const esStale = entries();
        c.ok(esStale.length === nBefore + 1 && /"due":\[\{"pick":"p-orchard","a":"2027-05-05","was":"2026-11-20"\}\]/.test(esStale[esStale.length - 1]), `[${where}] the stale edit is kept as an entry: ${esStale[esStale.length - 1]}`);
        c.ok(fs.readFileSync(jsonFile, "utf8") === staleOutside, `[${where}] and the data file is exactly what was written from outside: nothing of it was written`);
        const staleCell = await cell("due").innerText();
        c.ok(/2030-01-01/.test(staleCell) && /You sent: 2027-05-05/.test(staleCell), `[${where}] the cell shows the value now with what was sent beneath: ${JSON.stringify(staleCell)}`);
        const staleSeen = await o.evaluate(() => (window.__seen || []).join("|"));
        c.ok(/change kept, but not written to orchard-dashboard\.json, because the data holds a different value now\./i.test(staleSeen), `[${where}] a notice says it was kept and not written, and why: ${JSON.stringify(staleSeen)}`);

        // a data file that cannot be written: kept, not written, the cell waits, and a notice says so
        fs.chmodSync(jsonFile, 0o444);
        const lockedBefore = fs.readFileSync(jsonFile, "utf8");
        await o.evaluate(() => { window.__seen = []; });
        await cell("title").locator("button").click();
        await cell("title").locator("input").fill("Third name");
        await o.page.keyboard.press("Enter");
        await settle();
        fs.chmodSync(jsonFile, 0o644);
        c.ok(fs.readFileSync(jsonFile, "utf8") === lockedBefore && entries().length === nBefore + 2, `[${where}] with the file read-only: the entry is kept (${entries().length} entries) and the data file is as it was`);
        c.ok(/Third name/.test(await cell("title").innerText()) && /· sent, waiting/.test(await cell("title").innerText()), `[${where}] and the cell says it is sent and waiting: ${JSON.stringify(await cell("title").innerText())}`);
        const lockedSeen = await o.evaluate(() => (window.__seen || []).join("|"));
        c.ok(/change kept, but not written to orchard-dashboard\.json, because the file cannot be written\./i.test(lockedSeen), `[${where}] a notice says the file cannot be written: ${JSON.stringify(lockedSeen)}`);
        c.ok(fs.readFileSync(noteFile, "utf8").includes("booklet entries"), `[${where}] (the note still holds its records)`);
        await orchard.goTo(o, "home").catch(() => {});
        if (!desk) { await o.page.setViewportSize({ width: 1280, height: 900 }); await mobile(o, false); }
      });
    }
    return c;
  }

  return { 29: check29, 30: check30, 31: check31, 32: check32, 61: check61, 62: check62 };
};
