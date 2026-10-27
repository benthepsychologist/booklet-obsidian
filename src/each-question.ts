/*
 * A question asked for each pick of another (`each:<id>`, core/each.ts), drawn ahead of format 0.16 as the approved
 * design has it: the question's title and help once (drawn by questions.ts drawCommon), then one copy for each pick in
 * its source's answer, in the order the source holds them, each under a subheading in the pick's own words. A copy is
 * the question's own options, `open` field and replies, as a plain multi draws them (questions.ts choiceBody); what it
 * picks is the `a` of that pick's pair. Nothing is drawn while nothing is picked.
 *
 * Copies come and go as picks are made and taken back, around the field or button the reader is in: a copy is never
 * drawn again once drawn (its own updater shows its answer), copies around it are added or moved without moving it,
 * and a copy whose pick was taken back while the reader was in it stays until they leave it. Its pair stays in the
 * answer, not drawn, and the copy comes back with it when the pick is made again.
 */
import { pairFor, pairsOf, pickKey, pickWords, setPair, sourceOf, sourcePicks, type PickValue, type Question } from "./core";
import { choiceBody, picksOf, type Label, type QuestionHost, type Target } from "./questions";

interface Copy {
	el: HTMLElement;
	show: () => void;
}

export function drawEach(host: QuestionHost, box: HTMLElement, t: Target, q: Question, key: string, label: Label, locked: boolean): void {
	box.addClass("booklet-each");
	const src = sourceOf(t.activity, q);
	const copies = box.createDiv({ cls: "booklet-copies" });
	if (q.options.some((o) => o.correct)) box.createDiv({ cls: "booklet-muted", text: "Marking an answer right or wrong is not yet supported." });
	const drawn = new Map<string, Copy>();
	const picksNow = (): PickValue[] => (src ? sourcePicks(src, host.answerOf(t, src)) : []);

	// a new copy is made at the end of the copies; show() then puts it in its place
	const makeCopy = (p: PickValue): Copy => {
		const el = copies.createDiv({ cls: "booklet-copy", attr: { "data-booklet-pick": pickKey(p) } });
		const headId = host.uid();
		const head = el.createDiv({ cls: "booklet-pick-head", attr: { id: headId } });
		const w = src ? pickWords(src, p) : { text: String(p) };
		if ("md" in w) host.md(w.md, head.createSpan({ cls: "booklet-inline markdown-rendered" }));
		else head.setText(w.text);
		// each copy's controls are named by the question's prompt and the pick's words
		const named: Label = (c) => {
			label(c);
			c.setAttr("aria-labelledby", `${c.getAttribute("aria-labelledby") ?? ""} ${headId}`.trim());
		};
		const show = choiceBody(host, el, q, named, locked, {
			picks: () => picksOf(pairFor(host.answerOf(t, q), p)?.a),
			put: (list) => {
				const next = setPair(host.answerOf(t, q), p, list);
				host.answer(t, q, next.length ? next : undefined);
			},
			// the reader's own options under the other picks now, then in earlier entries (every pick's), as for `open`
			offered: (now) => {
				if (!q.open) return [];
				const others = pairsOf(host.answerOf(t, q)).filter((x) => x.pick !== p);
				return host.earlierOwn(
					t,
					q,
					now,
					others.flatMap((x) => picksOf(x.a).filter((y): y is string => typeof y === "string")),
				);
			},
			ownKey: `${key}#own:${pickKey(p)}`,
		});
		return { el, show };
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
		for (const p of picks) {
			const k = pickKey(p);
			const c = drawn.get(k);
			if (c) c.el.removeClass("booklet-copy-gone");
			else drawn.set(k, makeCopy(p));
		}
		// the copies in the source's order, the one the reader is in left where it is (moving it would take focus away)
		const order = [...want, ...[...drawn.keys()].filter((k) => !want.includes(k))];
		const now = Array.from(copies.children).map((el) => el.getAttribute("data-booklet-pick"));
		if (JSON.stringify(now) !== JSON.stringify(order)) {
			const fixed = order.find((k) => inside(drawn.get(k) as Copy));
			const at = fixed === undefined ? -1 : order.indexOf(fixed);
			if (at < 0) for (const k of order) copies.appendChild((drawn.get(k) as Copy).el);
			else {
				const f = (drawn.get(fixed as string) as Copy).el;
				for (const k of order.slice(0, at)) copies.insertBefore((drawn.get(k) as Copy).el, f);
				for (const k of order.slice(at + 1)) copies.appendChild((drawn.get(k) as Copy).el);
			}
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

