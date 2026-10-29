/*
 * Stage B of the navigation: a link from another note (Obsidian hands the view its `#Words` part as `subpath`), the finish
 * drawn only where the tab on show holds a question, the set of icon names, and the scroll that waits for the draw to finish.
 * Every note is made up.
 */
import { window as w, until } from "./dom.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BOOKLET, ROOT, SKETCH, norm } from "./helpers.mjs";
import { pane, sleep } from "./pane.mjs";

const CHECKIN = readFileSync(join(ROOT, "test-vault", "Check-in.booklet.md"), "utf8");
const BOOKLET_ICONS = new Set([...readFileSync(join(ROOT, "src", "booklet-icons.ts"), "utf8").matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]));

/* ---- a link from another note ---- */

test("a link from another note opens the screen, tab and page that hold the words: an activity's title, a heading on a later page, a tab's name, a prompt", async () => {
	const to = async (words, sample = SKETCH) => {
		const p = pane(sample);
		await p.settled();
		p.view.setEphemeralState({ subpath: "#" + words });
		await p.settled();
		return p;
	};
	let p = await to("Cast shadows");
	assert.equal(p.screen, "activity:basics/shadow", "an activity's title, which is no Markdown heading");
	p.close();
	p = await to("Ten in a row");
	assert.equal(p.screen, "activity:basics/lines");
	assert.equal(p.pager().at, "Page 3 of 3", "a heading on a later page");
	p.close();
	p = await to("Cylinders");
	assert.equal(p.screen, "activity:basics/shapes");
	assert.equal(p.tabOn(), "Cylinders", "a tab's name opens that tab, on its first page");
	p.close();
	p = await to("How steady were your lines?");
	assert.equal(p.pager().at, "Page 2 of 3", "a question's prompt");
	p.close();
	// whole file, first match in file order, whatever module holds it
	p = await to("Seven studies");
	assert.equal(p.screen, "activity:journal/studies");
	p.close();
	p = await to("hold-the-pencil-loosely");
	assert.equal(p.pager().at, "Page 2 of 3", "the slug form");
	p.close();
});

test("a link from another note into the check-in opens Today, the only place with those words", async () => {
	const p = pane(CHECKIN);
	await p.settled();
	p.view.setEphemeralState({ subpath: "#Today" });
	await p.settled();
	assert.equal(p.screen, "activity:day-check/today");
	p.close();
});

test("a link from another note moves the pane without a step of its own (Obsidian opening the note is the step); words nothing holds, a block link, and a note not yet drawn are handled", async () => {
	const p = pane(SKETCH);
	await p.settled();
	const steps = p.hist.back.length;
	p.view.setEphemeralState({ subpath: "#Nothing of the sort" });
	p.view.setEphemeralState({ subpath: "#^abc123" });
	p.view.setEphemeralState({ subpath: "#" });
	p.view.setEphemeralState({ subpath: "#100% done" });
	await p.settled();
	assert.equal(p.screen, "home", "nothing moved");
	assert.equal(p.hist.back.length, steps);
	p.view.setEphemeralState({ subpath: "#Cast shadows" });
	await p.settled();
	assert.equal(p.screen, "activity:basics/shadow");
	assert.equal(p.hist.back.length, steps, "Obsidian's own opening of the note is the step; the view adds none, which it could not (a move asked of the pane during an opening is dropped)");
	assert.equal(p.flight.calls, 0, "no move was asked of the pane");
	p.close();

	// handed over before the note is drawn: the note opens there
	const q = pane(SKETCH, { drawLater: true });
	q.view.setEphemeralState({ subpath: "#Ten in a row" });
	q.draw();
	await q.settled();
	assert.equal(q.screen, "activity:basics/lines");
	assert.equal(q.pager().at, "Page 3 of 3");
	assert.equal(q.hist.back.length, 0, "the open itself is Obsidian's step");
	q.close();
});

test("a link to a heading in the opening of a tabbed activity leaves the tab and the page as they are", async () => {
	const text = `---\nbooklet: "0.16"\ntitle: Opening\n---\n\n> [!activity|a] A\n\n## Above every tab\n\nWords.\n\n> [!tab] One\n\nOne p1\n***\nOne p2\n\n> [!tab] Two\n\nTwo p1\n***\nTwo p2\n***\nTwo p3\n`;
	const p = pane(text);
	await p.settled();
	await p.tab("Two");
	await p.pageNext();
	p.view.setEphemeralState({ subpath: "#Above every tab" });
	await p.settled();
	assert.equal(p.tabOn(), "Two");
	assert.equal(p.pager().at, "Page 2 of 3");
	p.close();
});

/* ---- the finish rule (call H) ---- */

const FINISH = `---\nbooklet: "0.16"\ntitle: Finish\n---\n\n> [!activity|log repeat daily] Log\n\n> [!tab] Read\n\nSome words to read.\n\n> [!tab] Answer\n\n> [!text|what] What happened?\n\n> [!activity|plain repeat] Plain\n\nOnly words.\n\n> [!activity|asked repeat] Asked\n\n> [!text|above] Asked above every tab\n\n> [!tab] One\n\nWords.\n\n> [!tab] Two\n\nMore words.\n`;

test("the finish is drawn under the page only where the tab on show holds a question, or the opening above every tab does", async () => {
	const p = pane(FINISH, { screen: "activity:/log" });
	await p.settled();
	const finish = () => p.all(".booklet-finish").length + p.all(".booklet-entries").length + p.all(".booklet-repeat-note").length;
	assert.equal(p.tabOn(), "Read");
	assert.equal(finish(), 0, "a reading tab holds nothing to finalize");
	await p.tab("Answer");
	assert.equal(p.all(".booklet-finalize").length, 1, "a tab with a question has the Finalize");
	assert.equal(p.all(".booklet-entries").length, 1);
	await p.tab("Read");
	assert.equal(finish(), 0);
	p.close();

	const plain = pane(FINISH, { screen: "activity:/plain" });
	await plain.settled();
	assert.equal(plain.all(".booklet-finalize").length, 0, "an activity with no question has no finish");
	plain.close();

	const asked = pane(FINISH, { screen: "activity:/asked" });
	await asked.settled();
	for (const t of ["One", "Two"]) {
		await asked.tab(t);
		assert.equal(asked.all(".booklet-finalize").length, 1, `a question in the opening: the finish on tab ${t}`);
	}
	asked.close();
});

test("the finish stays under every page of a tab that holds a question, wherever the question is in it", async () => {
	const text = `---\nbooklet: "0.16"\ntitle: Pages\n---\n\n> [!activity|log repeat] Log\n\nOne words\n***\nTwo words\n***\n> [!text|what] What?\n`;
	const p = pane(text);
	await p.settled();
	assert.equal(p.all(".booklet-finalize").length, 1, "page 1 has no question but its tab does");
	await p.pageNext();
	await p.pageNext();
	assert.equal(p.all(".booklet-finalize").length, 1);
	p.close();
});

/* ---- the set of icon names ---- */

test("Booklet's icon names are 161, each a plain lucide name, the set the format's art folder holds", () => {
	assert.equal(BOOKLET_ICONS.size, 161);
	for (const n of BOOKLET_ICONS) assert.match(n, /^[a-z0-9]+(-[a-z0-9]+)*$/, n);
	const dir = join(BOOKLET, "art", "icons");
	if (!existsSync(dir)) return console.log("skipped: no art/icons folder at " + dir);
	const files = readdirSync(dir).filter((f) => f.endsWith(".svg")).map((f) => f.replace(/\.svg$/, ""));
	assert.deepEqual([...BOOKLET_ICONS].sort(), files.sort());
});

/* ---- the scroll waits for the draw ---- */

test("a heading a link led to is scrolled into view only after every piece of Markdown is rendered, not after a fixed delay", async () => {
	const seen = { inFlight: 0, scrolls: [] };
	globalThis.__bookletStubRender = (markdown, el) => {
		seen.inFlight++;
		return sleep(60).then(() => {
			const m = /^## (.*)$/m.exec(markdown);
			if (m) el.createEl("h2", { text: m[1] });
			else el.appendText(markdown);
			seen.inFlight--;
		});
	};
	const proto = w.HTMLElement.prototype;
	const was = proto.scrollIntoView;
	proto.scrollIntoView = function () {
		seen.scrolls.push({ inFlight: seen.inFlight, text: this.textContent });
	};
	try {
		const p = pane(SKETCH, { screen: "activity:basics/lines" });
		await p.settled();
		p.view.setEphemeralState({ subpath: "#Hold the pencil loosely" });
		await until(() => seen.scrolls.length >= 1, "the heading scrolled to");
		await p.settled();
		assert.equal(p.pager().at, "Page 2 of 3");
		assert.ok(seen.scrolls.length >= 1, "scrolled to the heading");
		assert.deepEqual(norm(seen.scrolls.map((s) => s.inFlight)), seen.scrolls.map(() => 0), "no render was still going when it scrolled");
		assert.equal(seen.scrolls.at(-1).text, "Hold the pencil loosely");
		p.close();
	} finally {
		delete globalThis.__bookletStubRender;
		if (was) proto.scrollIntoView = was;
		else delete proto.scrollIntoView;
	}
});
