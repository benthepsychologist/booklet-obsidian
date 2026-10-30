/*
 * What a note with no page line is, as a plain structure, and how it draws: the reading (parseBooklet), the navigation model (buildNav), and
 * the DOM of every place the view can show (home, each module screen and tab, each activity's screen, tab and part), hashed.
 *
 * The dashboards release (0.9.0) must leave every note with no chart, no data source and no removal exactly as it was: test/legacy.test.mjs
 * compares this structure with test/legacy-golden.json, which was made from the code of release 0.8.0 (e692029) before 0.9.0 changed
 * anything (it came out byte for byte the same as the file made from 0.7.0's code, bb9283e, so 0.8.0 did leave these notes as they were).
 * To make it again, build that commit's tests (`node test/build-for-tests.mjs` in a checkout of it, with this file and fixed-date.mjs
 * copied in) and run
 *   node test/legacy-structure.mjs > legacy-golden.json
 * This file uses only what release 0.7.0 had (parseBooklet, buildNav, barTabs, the pane helper), so it runs on any code since.
 */
import "./fixed-date.mjs";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { core, ROOT } from "./helpers.mjs";
import { pane } from "./pane.mjs";

/** Made-up 0.16 notes the vault lacks: a wiki written with `parent:` on activities (module and bare), tabs with page breaks, and odd lines. */
export const EXTRA = {
	"wiki-in-a-module": `---\nbooklet: "0.16"\ntitle: Harbour notes\n---\n\n> [!module|harbour icon:anchor] Harbour notes\n\nA small wiki.\n\n> [!activity|tides icon:waves] Tides\n\nHow the water moves. See [[#Spring tides]].\n\n> [!activity|spring parent:tides] Spring tides\n\nThe widest range.\n\n***\n\nTwice a month.\n\n> [!activity|neap parent:tides] Neap tides\n\nThe narrowest range.\n\n> [!activity|moon] The moon\n\nIt pulls.\n\n> [!module|harbour end]\n`,
	"bare-wiki": `---\nbooklet: "0.16"\ntitle: Bare\n---\n\n> [!activity|a] A\n\nOne.\n\n> [!activity|b parent:a] B\n\nTwo.\n\n> [!activity|c parent:zzz] C\n\nThree, with a parent that is not there.\n`,
	"tabs-and-breaks": `---\nbooklet: "0.16"\ntitle: Tabs\n---\n\n> [!activity|t repeat] Tabs\n\nAbove every tab.\n\n> [!tab|first] First\n\nOne.\n\n---\n\nTwo.\n\n> [!tab] Second one\n\n> [!text|note] A note\n\n***\n\n> [!tab|third] Third\n\nJust words, and a heading link to [[#Second one]].\n`,
	"odd-lines": `---\nbooklet: "0.16"\ntitle: Odd\n---\n\n> [!activity|o] Odd\n\n> [!hint]- A hint\n> Small.\n\n> [!group]\n> > [!tab] Nested, so text\n\n> [!choice|c] Pick\n\n- [ ] One\n- [ ] Two\n\n> [!row]\n\n## Cell\n\nWords.\n\n> [!row|end]\n\n> [!invented|what] Not a kind\n`,
};

const sha = (s) => createHash("sha256").update(s).digest("hex");
/** As plain data; a query's source names its activity by key (the activity itself holds the query). */
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (k === "act" && x && typeof x === "object" && "segments" in x ? `${x.scope}/${x.id}` : x)));

/** The reading and the model of a note, with only what release 0.7.0 had in them. */
export function modelOf(text) {
	const book = core.parseBooklet(text);
	const nav = core.buildNav(book, text);
	const key = (a) => (a ? a.key : null);
	const mods = nav.mods.map((m) => ({
		id: m.id, bare: m.bare, title: m.title, written: m.written, emoji: m.emoji, icon: m.icon, opening: m.opening, blurb: m.blurb, tabs: m.tabs, notice: m.notice,
		acts: m.acts.map(key), top: m.top.map(key), order: m.order.map(key), line: m.line,
	}));
	const acts = [...nav.byKey.values()].map((a) => ({
		key: a.key, mod: a.mod.id, title: a.title, emoji: a.emoji, icon: a.icon, blurb: a.blurb, statusMd: a.statusMd, statusOff: a.statusOff, parentId: a.parentId,
		parent: key(a.parent), children: a.children.map(key), modTab: a.modTab, opening: a.opening,
		tabs: a.tabs.map((t) => ({ id: t.id, title: t.title, pages: t.pages })), named: a.named, reads: a.reads, number: a.number, line: a.line,
	}));
	const cards = nav.cards.map((c) => (c.kind === "module" ? { kind: "module", mod: c.mod.id, line: c.line } : { kind: "activity", act: c.act.key, line: c.line }));
	const { records, ...rest } = book;
	return plain({ book: { ...rest, records }, nav: { title: nav.title, startHome: nav.startHome, mods, acts, cards }, start: core.startPlace(nav) });
}

/** Every place the view can show for a note: [screen, tab, part]. */
export function placesOf(text) {
	const nav = core.buildNav(core.parseBooklet(text), text);
	const out = [["home", null, 0]];
	for (const m of nav.mods) {
		if (m.bare || m.acts.length < 2) continue;
		if (m.tabs.length > 1) for (const t of m.tabs) out.push([`module:${m.id}`, t.id, 0]);
		else out.push([`module:${m.id}`, null, 0]);
	}
	for (const a of nav.byKey.values()) {
		const bar = core.barTabs(a);
		for (const t of bar.length ? bar : [a.tabs[0]]) for (let p = 0; p < t.pages.length; p++) out.push([`activity:${a.key}`, bar.length ? t.id : null, p]);
	}
	return out;
}

/** The DOM of one place, hashed: the view's ids are numbered as drawn, so they are taken out. */
export async function drawnHash(text, [screen, tab, part], path = "Note.booklet.md") {
	const p = pane(text, { path, state: { file: path, version: 1, screen, ...(tab ? { tab } : {}), part } });
	await p.settled();
	const html = p.el.innerHTML.replace(/booklet-\d+/g, "booklet-N");
	// what the view would save for this place, as the pane keeps it (the saved place of a note with no page line is what 0.7.0 saved)
	const state = { writes: p.disk.writes, same: p.disk.text === text, drawn: p.screen, saved: JSON.parse(JSON.stringify(p.view.getState())) };
	p.close();
	return { sha: sha(html), ...state };
}

export const vaultNotes = () => {
	const dir = join(ROOT, "test-vault");
	return Object.fromEntries(
		readdirSync(dir)
			.filter((f) => f.endsWith(".booklet.md"))
			.sort()
			.map((f) => [f, readFileSync(join(dir, f), "utf8")]),
	);
};

/** The whole structure: for each note, its model and the hash of every place's drawing. */
export async function legacyStructure() {
	const notes = { ...vaultNotes(), ...Object.fromEntries(Object.entries(EXTRA).map(([k, v]) => [`${k} (made up here)`, v])) };
	const out = {};
	for (const [name, text] of Object.entries(notes)) {
		const places = {};
		for (const pl of placesOf(text)) places[pl.join("|")] = await drawnHash(text, pl, name);
		out[name] = { model: modelOf(text), places };
	}
	return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	process.stdout.write(JSON.stringify(await legacyStructure(), null, 1) + "\n");
	process.exit(0);
}
