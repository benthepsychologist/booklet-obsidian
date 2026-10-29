/*
 * A question asked for each pick of another (`each:<id>`, core/each.ts), of any kind, drawn as the approved design and
 * SPEC section 5 have it: the question's title and help once (drawn by questions.ts drawCommon, or engines.ts for a
 * widget), then one copy for each pick in its source's answer, each under a subheading in the pick's own words. A copy
 * is the question's own controls as the question draws them without `each:`, with its marks (`[x]`), `open`, `menu:`,
 * `min:`, `max:`, `step:` and `earlier:`; what it picks or types is the `a` of that pick's pair. Nothing is drawn while
 * nothing is picked.
 *
 * A copy is drawn by the question's own drawer over a host of its own (copyHost): the host answers and writes the
 * pick's `a` and keeps what is typed for that pick, and passes everything else to the view's.
 *
 * The order: a drawing of the view puts the copies in the order the source's answer holds the picks. While it stays
 * open, a new pick adds a copy at the end and nothing already on screen moves, even when the source's answer changes
 * its order. A press or a word typed never reorders a source's answer (a word written in a grid cell goes at the end,
 * SPEC section 8), but a change made elsewhere can (a hand edit, another renderer), and that must not swap two copies
 * under the reader. The order
 * on screen is the view's, like the body widget's open place: nothing about it is stored, and the next drawing (the
 * note opened again, or its design changed) takes the answer's order again.
 *
 * Copies come and go around the field or button the reader is in: a copy is never drawn again once drawn (its own
 * updater shows its answer), and a copy whose pick was taken back while the reader was in it stays where it is until
 * they leave it. Its pair stays in the answer, not drawn, and a copy comes back for it (at the end) when the pick is
 * made again.
 */
import { pairFor, pickKey, pickWords, sourceOf, sourcePicks, type PickValue, type Question } from "./core";
import type { QuestionHost, Target } from "./questions";

interface Copy {
	el: HTMLElement;
	show: () => void;
}

/**
 * What draws a copy's controls into `into`: the question's own drawer, given the host to draw over, a key for the
 * copy's controls, and the ids of the words that name them (the question's, and the pick's).
 */
export type DrawCopy = (host: QuestionHost, into: HTMLElement, key: string, labelledBy: string) => void;

/**
 * A host for one copy of a question asked for each pick: the copy's answer is the `a` of its pick's pair, a press and
 * typing write that, and the function it registers to show its answer again is `onShow`'s to call (the copies are shown
 * together with the question).
 */
/**
 * The key a copy's controls are drawn under: one for each pick. For a `choice` or a `multi` it is the key the words typed
 * in the copy's Add your own field are held under on the device (held-store.ts), so it must stay `<key>#own:<pick>`:
 * words held under it by an earlier version are found again, and not lost.
 */
const copyKey = (key: string, p: PickValue): string => `${key}#own:${pickKey(p)}`;

function copyHost(host: QuestionHost, q: Question, pick: PickValue, onShow: (show: () => void) => void): QuestionHost {
	return {
		md: (markdown, el) => host.md(markdown, el),
		answerOf: (t) => pairFor(host.answerOf(t, q), pick)?.a,
		answer: (t, _q, value) => host.answer(t, q, value, pick),
		typed: (t, _q, value) => host.typed(t, q, value, pick),
		flushTyped: (t) => host.flushTyped(t, q, pick),
		pendingOf: (t) => host.pendingOf(t, q, pick),
		onShow: (_key, show) => onShow(show),
		keepOwn: (key, t, commit) => host.keepOwn(key, t, commit),
		pressTarget: () => host.pressTarget(),
		heldOf: (key) => host.heldOf(key),
		hold: (key, words) => host.hold(key, words),
		earlierOf: (t) => ({ ...host.earlierOf(t), pick }),
		reshow: () => host.reshow(),
		uid: () => host.uid(),
		wrongOf: (t) => host.wrongOf(t, q),
		redrawSoon: () => host.redrawSoon(),
	};
}

export function drawEach(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, promptId: string, draw: DrawCopy): void {
	box.addClass("booklet-each");
	const src = sourceOf(t.activity, q);
	const copies = box.createDiv({ cls: "booklet-copies" });
	const drawn = new Map<string, Copy>();
	const picksNow = (): PickValue[] => (src ? sourcePicks(src, host.answerOf(t, src)) : []);

	// a new copy is made at the end of the copies, where it stays; the map holds the copies in the order shown
	const makeCopy = (p: PickValue): Copy => {
		const el = copies.createDiv({ cls: "booklet-copy", attr: { "data-booklet-pick": pickKey(p) } });
		const headId = host.uid();
		const head = el.createDiv({ cls: "booklet-pick-head", attr: { id: headId } });
		const w = src ? pickWords(src, p) : { text: String(p) };
		if ("md" in w) host.md(w.md, head.createSpan({ cls: "booklet-inline markdown-rendered" }));
		else head.setText(w.text);
		// each copy's controls are named by the question's prompt and the pick's words; the copy's updaters run with the question's
		const shows: Array<() => void> = [];
		draw(copyHost(host, q, p, (show) => shows.push(show)), el, copyKey(key, p), `${promptId} ${headId}`);
		return { el, show: () => shows.forEach((show) => show()) };
	};

	const show = () => {
		const picks = picksNow();
		const want = picks.map(pickKey);
		const doc = box.ownerDocument;
		const inside = (c: Copy) => c.el.contains(doc.activeElement);
		// a copy whose pick was taken back goes, unless the reader is in it: it goes when they leave it (focusout below)
		for (const [k, c] of [...drawn]) {
			if (want.includes(k)) continue;
			if (inside(c)) {
				c.el.addClass("booklet-copy-gone");
				continue;
			}
			c.el.remove();
			drawn.delete(k);
		}
		// the copies on screen stay where they are; a new pick's copy goes at the end (the first drawing: the source's order)
		for (const p of picks) {
			const k = pickKey(p);
			const c = drawn.get(k);
			if (c) c.el.removeClass("booklet-copy-gone");
			else drawn.set(k, makeCopy(p));
		}
		for (const c of drawn.values()) c.show();
		// nothing is drawn while nothing is picked (an answer of the wrong shape still shows its notice)
		box.toggleClass("booklet-each-none", !drawn.size && !host.wrongOf(t, q));
	};
	// leaving a copy whose pick was taken back lets it go; a press elsewhere is not disturbed (reshow waits for it)
	copies.addEventListener("focusout", (evt) => {
		const to = evt.relatedTarget;
		if (to instanceof Node && copies.contains(to)) return;
		window.setTimeout(() => host.reshow(), 0);
	});
	show();
	host.onShow(key, show);
}
