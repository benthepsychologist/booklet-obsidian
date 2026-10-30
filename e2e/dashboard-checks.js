// Checks 29 to 32 of plugin-check.js: the 0.9.0 dashboards, in the real app. The note is test/page-notes/Garden dashboards.booklet.md (made up),
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
  const sideways = o => o.evaluate(sel => { const v = document.querySelector(sel + " .view-content"); return v.scrollWidth - v.clientWidth; }, BOOK);
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
            const probe = (cssColor) => { const e = document.createElement("span"); e.style.color = cssColor; document.body.appendChild(e); const v = getComputedStyle(e).color; e.remove(); return v; };
            const one = (box) => {
              const chart = box.querySelector(".booklet-ch-bars"), lab = chart && box.querySelector("#" + chart.getAttribute("aria-labelledby"));
              const rects = [...box.querySelectorAll("rect.booklet-ch-bar")];
              return { chart: !!chart, name: lab && lab.textContent, nameHidden: lab && getComputedStyle(lab).position === "absolute", rows: box.querySelectorAll(".booklet-ch-row").length, rects: rects.length,
                zero: rects.every(r => Number(r.getAttribute("x")) === 0 || r.closest(".booklet-ch-row").querySelector(".booklet-ch-zero")), svgAria: box.querySelectorAll("svg[aria-label]").length, styled: box.querySelectorAll("[style]").length,
                fills: rects.map(r => getComputedStyle(r).fill), tones: rects.map(r => (r.getAttribute("class").match(/booklet-tone-(\w+)/) || [])[1] || ""),
                fold: (() => { const d = box.querySelector("details.booklet-ch-nums"); return d ? { open: d.open, rows: d.querySelectorAll("tbody tr").length, head: d.querySelector("summary").textContent } : null; })() };
            };
            return { first: one(qs[0]), long: one(qs[1]), picks: one(qs[2]), green: probe("var(--color-green)"), red: probe("var(--color-red)"), orange: probe("var(--color-orange)"), accent: probe("var(--interactive-accent)") };
          }, BOOK);
          const f = b.first;
          c.ok(f.chart && f.rows === 7 && f.rects >= 6 && /^Bar chart, 7 bars/.test(f.name || "") && f.nameHidden, `[${where} ${sch}] seven kept days as seven bars, the chart named by hidden text: ${f.name}`);
          c.ok(f.zero && f.svgAria === 0 && f.styled === 0, `[${where} ${sch}] every bar starts at zero, no aria-label on an svg, no inline style: zero ${f.zero}, svg aria-label ${f.svgAria}, style ${f.styled}`);
          const byTone = t => f.fills[f.tones.indexOf(t)];
          c.ok(f.tones.includes("good") && f.tones.includes("bad") && byTone("good") === b.green && byTone("bad") === b.red && (!f.tones.includes("warn") || byTone("warn") === b.orange), `[${where} ${sch}] a bar's colour is Obsidian's: good ${byTone("good")} = ${b.green}, bad ${byTone("bad")} = ${b.red}`);
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
        let r = await o.evaluate(sel => document.querySelector(sel + " .booklet-query .booklet-ch-readout").textContent, BOOK);
        c.ok(/: Hours slept .* · Hours of focused work /.test(r), `[${where}] ${where === "desktop" ? "hovering" : "tapping"} the fourth point reads it: ${r}`);
        await q(o, 0).locator("svg.booklet-ch-svg").focus();
        await o.page.keyboard.press("ArrowRight"); await sleep(100);
        const r2 = await o.evaluate(sel => document.querySelector(sel + " .booklet-query .booklet-ch-readout").textContent, BOOK);
        c.ok(r2 !== r && /: Hours slept /.test(r2), `[${where}] ArrowRight moves to the next point: ${r2}`);
        await o.page.keyboard.press("Home"); await sleep(100);
        const r3 = await o.evaluate(sel => document.querySelector(sel + " .booklet-query .booklet-ch-readout").textContent, BOOK);
        await o.page.keyboard.press("End"); await sleep(100);
        const r4 = await o.evaluate(sel => document.querySelector(sel + " .booklet-query .booklet-ch-readout").textContent, BOOK);
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
            const probe = (cssColor) => { const e = document.createElement("span"); e.style.color = cssColor; document.body.appendChild(e); const v = getComputedStyle(e).color; e.remove(); return v; };
            const pill = list.querySelector(".booklet-q-pill.booklet-tone-warn");
            return {
              views: qs.map(x => x.getAttribute("data-booklet-view")),
              groups: [...list.querySelectorAll(".booklet-q-group")].map(t),
              icons: list.querySelectorAll(".booklet-q-icon svg").length, rows: list.querySelectorAll("li.booklet-q-row").length,
              pills: [...list.querySelectorAll("li.booklet-q-row")[0].querySelectorAll(".booklet-q-pill")].map(t),
              pillColour: pill && getComputedStyle(pill).borderTopColor, warn: probe("var(--color-orange)"),
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
          c.ok(d.pills.join() === "open,blocked" && d.toneWords && d.pillColour === d.warn, `[${where} ${sch}] a list of values is two pills, a tone coloured as Obsidian's and said in words: ${d.pills}, ${d.pillColour} = ${d.warn}`);
          c.ok(d.ext.length === 1 && d.ext[0][0] === "https://example.org/dig" && /noopener/.test(d.ext[0][1]) && d.js === 0, `[${where} ${sch}] a web link opens outside with noopener, and a javascript: link is not a link: ${JSON.stringify(d.ext)}, ${d.js}`);
          c.ok(d.head.slice(0, 2).join() === "Job,State" && d.numeric >= 1 && d.sortBtns === 4, `[${where} ${sch}] the table's headings are the declared labels, hours set right, and (twelve rows) sortable: ${d.head}`);
          c.ok(d.cards === 4 && d.tiles === 6 && d.details === 3 && d.open === 0 && d.picks.length === 3 && /Spade/.test(d.picks[0]) && d.none === "No rows in this block.", `[${where} ${sch}] cards 4, tiles 6, the nested list has ${d.details} parents all shut, tiles of the tools: ${d.picks.length}, the empty words: ${d.none}`);
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
        const none = await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")][0].querySelector(".booklet-qc-count").textContent.trim(), BOOK);
        c.ok(none === "Nothing matches.", `[${where}] nothing matching says so: ${none}`);
        await box.locator(".booklet-qc-clear").click(); await sleep(200);
        c.ok((await first()) === 12 && (await o.evaluate(sel => [...document.querySelectorAll(sel + " .booklet-query")][0].querySelector(".booklet-qc-count").textContent.trim(), BOOK)) === "12 rows", `[${where}] Clear puts them back and counts the rows`);
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
        await scheme(o, "dark"); await shot(o, `sort-open-${where}-dark`); await scheme(o, "light");
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
    for (const mode of ["one pane", "markdown pane", "phone"]) {
      await withApp("c32-" + mode.replace(" ", "-"), async (o, vault) => {
        const where = mode === "phone" ? "phone" : "desktop";
        await setup(o, vault, where);
        const file = path.join(vault, NOTE);
        const orig = fs.readFileSync(file, "utf8");
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
        // the second card, newest first, is Oct 27
        const when = (await card(1).locator(".booklet-entry-when").textContent()).trim();
        await card(1).locator(".booklet-entry-delete").click(); await sleep(150);
        const ask = await o.evaluate(sel => { const a = document.querySelectorAll(sel + " .booklet-entry-list .booklet-entry")[1]; const ask = a.querySelector(".booklet-entry-ask"); return { text: ask.querySelector(".booklet-entry-ask-text").textContent, shown: ask.offsetParent !== null, del: a.querySelector(".booklet-entry-delete").offsetParent !== null, buttons: [...ask.querySelectorAll("button")].map(b => b.textContent), focus: document.activeElement === ask.querySelectorAll("button")[1] }; }, BOOK);
        c.ok(ask.text === "Delete this entry?" && ask.shown && !ask.del && ask.buttons.join() === "Yes, delete,No" && ask.focus, `[${mode}] ${when}: Delete asks in place, with focus on No: ${JSON.stringify(ask)}`);
        await shot(o, `remove-ask-${mode.replace(" ", "-")}-light`);
        if (mode === "phone") {
          const hs = (await heights(o, ".booklet-entry-foot button")).filter(h => h > 0);
          c.ok(hs.length >= 4 && hs.every(h => h >= 44), `[phone] every shown Delete, and the Yes and No of the card asked, are at least 44 px high: ${hs}`);
        }
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

  return { 29: check29, 30: check30, 31: check31, 32: check32 };
};
