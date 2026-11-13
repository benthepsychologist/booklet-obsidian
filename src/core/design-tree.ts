/*
 * The Design view's tree: a note read into nested blocks, every one with the line it starts on, the line it ends before, its parent and
 * its depth. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 *   booklet                  the whole note; front matter, then its opening (prose and reading callouts), then what follows
 *     front-matter
 *     module                 fenced: its opening line, its blocks, and its closing line (the tail)
 *       module-tab           declared in the module's opening; what stands under it up to the next one is its prose
 *       activity             an activity joins a module tab with `tab:<id>` (`moduleTabOf`); none means the first tab
 *         activity-tab       an activity's own tabs
 *           page             a page line starts a page; the tree of `parent:` is `pageTree`, the file keeps them side by side
 *             group, row     a group holds blocks (read with one `>` less); a row holds blocks and is closed by `[!row|end]`
 *               question, callout, query, fence, menu, notice, page-break, prose, comment, as-written
 *     data-section           `> [!data]` and the blocks under it, up to the next module, activity or data line
 *     records                the records section: kept data, never written by the view
 *
 * Every line of the note is in exactly one node's own lines: a leaf owns all its lines, a container owns its head (`start` to
 * `headEnd`: its line, the lines it claims, and the blank lines after them) and its tail (`tailStart` to `end`: a module's closing
 * line, a group's blank lines after its body). Its children fill what lies between, in order, with no gap. A block owns the blank lines
 * that follow it, so deleting or moving a block leaves its neighbours exactly as they were. `reassemble` joins the own lines of
 * every node in file order, and the tests require it to give the note back, byte for byte, for every fixture.
 *
 * Text the plugin cannot read, or that stands where it does no work (a question in a module's opening, a page in an activity's
 * opening, a tab outside every activity), is an `as-written` node carrying its lines and the reason, never dropped.
 *
 * The reading is the scanner's (editor-scan.ts), so the view and the panel read a line alike. Line numbers are 0-based, as the
 * editor counts them; `end` is exclusive. The lines are `text.split("\n")`, so a `\r` stays at the end of its line.
 */
import { LP } from "./editor-patterns";
import { claimEnd, scan, type Scan, type ScanItem } from "./editor-scan";

export type DesignKind =
	| "booklet"
	| "front-matter"
	| "module"
	| "module-tab"
	| "activity"
	| "activity-tab"
	| "page"
	| "group"
	| "row"
	| "data-section"
	| "records"
	| "question"
	| "menu"
	| "notice"
	| "callout"
	| "query"
	| "fence"
	| "page-break"
	| "prose"
	| "comment"
	| "as-written";

export interface DesignNode {
	kind: DesignKind;
	/** The line it starts on (0-based). */
	start: number;
	/** The line it ends before: the next sibling's `start`, or the end of its parent. */
	end: number;
	/** Where its own opening lines end and its children begin (`end` for a leaf). */
	headEnd: number;
	/** Where its children end and its closing lines begin (`end` when it has none). */
	tailStart: number;
	parent: DesignNode | null;
	/** 0 for the booklet. */
	depth: number;
	/** The id it carries: an activity's, a module's, a question's, a tab's or page's (written or made from its title), a fence's `^id`. */
	id: string | null;
	/** The title on its line. */
	label: string;
	/** A question's kind (`choice`), a callout's kind (`tip`), a fence's info (`booklet query`), why an as-written node is one. */
	detail: string;
	children: DesignNode[];
	/** The bare words of its line (`repeat`, `daily`, `long`, `end`), as written. */
	flags: string[];
	/** The `key:value` words of its line (`tab`, `parent`, `icon`), keys lowercased. */
	set: Record<string, string>;
	/** The activity is the one a note with no module and no activity line is. */
	implicit?: boolean;
	/** A module with its closing line, a records section closed by `%%`. */
	closed?: boolean;
	/** A question's hint and solution that stand directly under it (they are inside its lines). */
	parts?: string[];
}

export const CONTAINER_KINDS: ReadonlySet<DesignKind> = new Set<DesignKind>(["booklet", "module", "module-tab", "activity", "activity-tab", "page", "group", "row", "data-section"]);

export const isContainer = (n: DesignNode): boolean => CONTAINER_KINDS.has(n.kind);

export interface ParseOptions {
	/**
	 * Read a piece's own text: no check of where a line stands, so a question with no activity above it is still a question (the
	 * piece is read to learn what it is made of, not where it would work).
	 */
	lenient?: boolean;
}

const blank = (s: string | undefined): boolean => !s || !s.trim();

type AtomKind =
	| "front-matter"
	| "records"
	| "fence"
	| "group"
	| "ignored"
	| "data"
	| "module"
	| "module-end"
	| "tab"
	| "page-named"
	| "activity"
	| "question"
	| "menu"
	| "callout"
	| "page-break"
	| "prose"
	| "comment";

/** A run of lines that is one thing, with the blank lines after it. `core` is where its own lines end, `end` where the blank lines do. */
interface Atom {
	kind: AtomKind;
	start: number;
	core: number;
	end: number;
	item?: ScanItem;
	/** A group's body ends here (`end` also takes the blank lines after it). */
	bodyEnd?: number;
}

const STRUCTURE_REASON = "A group can hold no structure line (SPEC section 6), so the reader ignores it.";

/** The lines [from, to) cut into atoms, in order, with no gap but the blank lines before the first. */
function atomize(s: Scan, from: number, to: number): Atom[] {
	const itemAt = new Map<number, ScanItem>();
	for (const it of s.items) if (!itemAt.has(it.line)) itemAt.set(it.line, it);
	// the runs a comment, a `$$` block or `<pre>` hold, by every line they cover (the opener line included): a blank line inside one
	// does not end the paragraph that holds it
	const hold = new Map<number, number>();
	for (const h of s.holders) if (h.kind === "comment" || h.kind === "math" || h.kind === "pre") for (let k = h.from; k <= h.end; k++) hold.set(k, h.end);
	const atoms: Atom[] = [];
	const trail = (core: number): number => {
		let e = Math.min(core, to);
		while (e < to && blank(s.read[e])) e++;
		return e;
	};
	let i = from;
	while (i < to) {
		if (blank(s.read[i])) {
			i++;
			continue;
		}
		const it = itemAt.get(i);
		const held = hold.get(i);
		if (it && held === undefined) {
			let core = i + 1;
			let kind: AtomKind;
			let bodyEnd: number | undefined;
			switch (it.type) {
				case "records":
					kind = "records";
					core = (it.end ?? i) + 1;
					break;
				case "fence":
					kind = "fence";
					core = (it.blockLine ?? it.end ?? i) + 1;
					break;
				case "group":
					if (it.reads) {
						kind = "group";
						bodyEnd = Math.min(it.end ?? i + 1, to);
						core = bodyEnd;
					} else {
						kind = "callout";
						core = claimEnd("group", s.read, i);
					}
					break;
				case "ignored":
					kind = "ignored";
					core = claimEnd(it.kind ?? "", s.read, i);
					break;
				case "data":
					kind = "data";
					core = claimEnd("data", s.read, i);
					break;
				case "module":
				case "module-end":
				case "tab":
				case "page-named":
				case "activity":
				case "question":
				case "menu":
				case "callout":
					kind = it.type === "module-end" ? "module-end" : it.type;
					core = claimEnd(it.kind ?? "", s.read, i);
					break;
				case "page":
					kind = "page-break";
					break;
				default:
					kind = "prose";
			}
			core = Math.max(core, i + 1);
			atoms.push({ kind, start: i, core: Math.min(core, to), end: trail(core), item: it, ...(bodyEnd !== undefined ? { bodyEnd } : {}) });
			i = Math.max(i + 1, atoms[atoms.length - 1]?.end ?? i + 1);
			continue;
		}
		// prose: up to the next blank line, the next line that starts something, or the end of a comment, math or `<pre>` run
		let j = i;
		while (j < to) {
			const h = hold.get(j);
			if (h !== undefined && h >= j) {
				j = h + 1;
				continue;
			}
			if (j > i && (blank(s.read[j]) || itemAt.has(j))) break;
			j++;
		}
		j = Math.min(j, to);
		const chunk = s.read.slice(i, j).join("\n");
		const kind: AtomKind = /^\s*(?:<!--[\s\S]*?-->|%%[\s\S]*?%%)\s*$/.test(chunk) ? "comment" : "prose";
		atoms.push({ kind, start: i, core: j, end: trail(j) });
		i = Math.max(i + 1, trail(j));
	}
	return atoms;
}

const KIND_OF_FENCE = (info: string): string => info.trim().split(/\s+/).slice(0, 2).join(" ").toLowerCase();

class Builder {
	readonly s: Scan;
	readonly lenient: boolean;
	readonly n: number;

	constructor(s: Scan, lenient: boolean) {
		this.s = s;
		this.lenient = lenient;
		this.n = s.lines.length;
	}

	node(kind: DesignKind, parent: DesignNode | null, a: { start: number; core?: number; end: number }, props: Partial<DesignNode> = {}): DesignNode {
		const n: DesignNode = {
			kind,
			start: a.start,
			end: a.end,
			headEnd: a.end,
			tailStart: a.end,
			parent,
			depth: parent ? parent.depth + 1 : 0,
			id: null,
			label: "",
			detail: "",
			children: [],
			flags: [],
			set: {},
			...props,
		};
		parent?.children.push(n);
		return n;
	}

	/** The line's own words, as the node carries them. */
	words(it: ScanItem | undefined): Partial<DesignNode> {
		const w = it?.words;
		if (!w) return {};
		return { flags: [...w.flags], set: { ...w.set } };
	}

	/** A node for a line of the booklet that carries its title and id. */
	lineProps(it: ScanItem | undefined): Partial<DesignNode> {
		return { id: it?.id ?? null, label: (it?.title ?? "").trim(), ...this.words(it) };
	}

	asWritten(parent: DesignNode, a: Atom, why: string): DesignNode {
		return this.node("as-written", parent, a, { detail: why, label: (this.s.lines[a.start] ?? "").trim() });
	}

	/** The block an atom is, when it is not structure. `inAct`: it stands where an activity's content stands. */
	block(parent: DesignNode, a: Atom, inAct: boolean, inData: boolean): DesignNode {
		const it = a.item;
		const ok = (cond: boolean): boolean => this.lenient || cond;
		switch (a.kind) {
			case "ignored":
				return this.asWritten(parent, a, STRUCTURE_REASON);
			case "records": {
				const reg = this.s.regions.find((r) => r.start === a.start);
				return this.node("records", parent, a, { closed: reg?.closed ?? false, detail: "records" });
			}
			case "fence": {
				const info = (it?.info ?? "").trim();
				const word = KIND_OF_FENCE(info);
				if (word === "booklet query") {
					if (!ok(inAct)) return this.asWritten(parent, a, "A query belongs in an activity's prose (SPEC section 6, 'Queries'), so a renderer draws it as code.");
					return this.node("query", parent, a, { detail: info, id: it?.blockId ?? null });
				}
				return this.node("fence", parent, a, { detail: info, id: it?.blockId ?? null });
			}
			case "question": {
				if (!ok(inAct && !inData)) {
					return this.asWritten(parent, a, "A question belongs inside an activity, not before the file's first module or activity line or in a module's opening (SPEC section 3), so a renderer draws it nowhere.");
				}
				return this.node("question", parent, a, { ...this.lineProps(it), detail: it?.kind ?? "", parts: [] });
			}
			case "menu":
				return this.node("menu", parent, a, { ...this.lineProps(it), detail: "menu" });
			case "callout": {
				const kind = it?.kind ?? "";
				if (kind === "copy" && !ok(inAct)) return this.asWritten(parent, a, "A copy line belongs inside an activity (SPEC section 6, 'Copy'), so a renderer ignores it.");
				return this.node("callout", parent, a, { ...this.lineProps(it), detail: kind });
			}
			case "page-break":
				return this.node("page-break", parent, a, { detail: "***" });
			case "comment":
				return this.node("comment", parent, a);
			case "group": {
				const g = this.node("group", parent, a, { ...this.lineProps(it), detail: "group" });
				const body = atomize(this.s, a.start + 1, a.bodyEnd ?? a.end);
				this.fill(g, body, inAct, false);
				g.tailStart = a.bodyEnd ?? a.end;
				return g;
			}
			default: {
				// "A line that starts `> [!` but cannot be read as a Booklet line is reported, and is read as text" (SPEC section 4, 'Unknown kinds')
				const first = this.s.read[a.start] ?? "";
				if (LP.CALLOUT_ANY.test(first) && !LP.CALLOUT_LINE.test(first)) return this.asWritten(parent, a, "A line that starts `> [!` but cannot be read as a Booklet line is reported and read as text (SPEC section 4).");
				return this.node("prose", parent, a);
			}
		}
	}

	/** The blocks of a group's body: no structure can stand in one, so only blocks. */
	fill(parent: DesignNode, atoms: Atom[], inAct: boolean, inData: boolean): void {
		for (let k = 0; k < atoms.length; k++) {
			const a = atoms[k];
			if (!a) continue;
			const nd = this.block(parent, a, inAct, inData);
			if (nd.kind === "question") k = this.absorb(nd, atoms, k);
		}
	}

	/** A hint or a solution straight under a question is the question's own; its lines are inside the question's. Returns the atom index it reached. */
	absorb(q: DesignNode, atoms: Atom[], k: number): number {
		let j = k;
		for (;;) {
			const nx = atoms[j + 1];
			const kind = nx?.item?.kind ?? "";
			if (!nx || nx.kind !== "callout" || (kind !== "hint" && kind !== "solution")) return j;
			q.parts?.push(kind);
			q.end = nx.end;
			q.headEnd = nx.end;
			q.tailStart = nx.end;
			j++;
		}
	}

	/** Finish a container, bottom up: its end, where its head ends (at its first child) and where its tail begins. A module with its closing line, a row and a group have set their tail already. */
	finish(n: DesignNode): void {
		for (const c of n.children) this.finish(c);
		if (!isContainer(n)) return;
		const last = n.children[n.children.length - 1];
		if (n.kind !== "group" && n.closed !== true) {
			n.end = Math.max(n.end, last ? last.end : 0);
			n.tailStart = n.end;
		}
		n.headEnd = n.children[0] ? n.children[0].start : n.tailStart;
	}

	build(): DesignNode {
		const s = this.s;
		const n = this.n;
		const root = this.node("booklet", null, { start: 0, end: n });
		const bodyStart = Math.min(s.bodyStart, n);
		const atoms = atomize(s, bodyStart, n);
		if (s.hasFrontMatter) {
			let e = bodyStart;
			while (e < n && blank(s.read[e])) e++;
			// the leading blank lines belong to the front matter; the first atom starts after them
			const fm: Atom = { kind: "prose", start: 0, core: bodyStart, end: e };
			this.node("front-matter", root, fm, { detail: "front matter" });
		}

		let mod: DesignNode | null = null;
		let act: DesignNode | null = null;
		let tab: DesignNode | null = null;
		let page: DesignNode | null = null;
		let mtab: DesignNode | null = null;
		let data: DesignNode | null = null;
		let row: DesignNode | null = null;
		let noticeSeen = false;

		if (s.implicit) {
			// a note with no module and no activity line is one activity: its prose, tabs and pages are that activity's
			const first = atoms[0]?.start ?? n;
			act = this.node("activity", root, { start: first, end: first }, { implicit: true, label: "", detail: "implicit" });
		}

		// which activities have a tab line, so a page line above their first tab is known to stand in the activity's opening
		const tabsOf = new Map<number, number>(); // activity line -> its first tab line
		{
			let a = s.implicit ? -1 : -2;
			for (const it of s.items) {
				if (it.type === "activity") a = it.line;
				else if (it.type === "module" || it.type === "module-end" || it.type === "data" || it.type === "records") a = s.implicit ? a : -2;
				else if (it.type === "tab" && it.where === "activity" && a !== -2 && !tabsOf.has(a)) tabsOf.set(a, it.line);
			}
		}
		const actKey = (x: DesignNode | null): number => (x ? (x.implicit ? -1 : x.start) : -2);

		const cur = (): DesignNode => data ?? row ?? page ?? tab ?? act ?? mtab ?? mod ?? root;
		const inAct = (): boolean => data === null && act !== null;
		const closeAct = (): void => {
			act = tab = page = row = mtab = null;
		};
		const closeAll = (): void => {
			closeAct();
			data = null;
		};

		// a records section that nothing of the design follows ends everything above it, as a module or an activity line does
		const designFollows = (k: number): boolean => {
			for (let m = k + 1; m < atoms.length; m++) {
				const kind = atoms[m]?.kind;
				if (kind === "module" || kind === "activity" || kind === "data" || kind === "records") return false;
				if (kind) return true;
			}
			return false;
		};
		const rowEnd = (k: number): boolean => {
			for (let m = k + 1; m < atoms.length; m++) {
				const a2 = atoms[m];
				if (!a2) continue;
				if (a2.kind === "callout" && a2.item?.kind === "row") return !!a2.item.words?.flags.has("end");
				if (a2.kind === "module" || a2.kind === "module-end" || a2.kind === "activity" || a2.kind === "tab" || a2.kind === "page-named" || a2.kind === "page-break" || a2.kind === "data" || a2.kind === "records") return false;
			}
			return false;
		};

		for (let k = 0; k < atoms.length; k++) {
			const a = atoms[k];
			if (!a) continue;
			const it = a.item;
			switch (a.kind) {
				case "records": {
					if (!designFollows(k)) {
						mod = null;
						closeAll();
					}
					this.block(cur(), a, inAct(), data !== null);
					break;
				}
				case "data": {
					closeAct();
					data = this.node("data-section", mod ?? root, a, { id: it?.names ?? null, label: (it?.title ?? "").trim(), ...this.words(it) });
					break;
				}
				case "module": {
					if (mod && !this.lenient) {
						this.asWritten(cur(), a, "A module opens before the one above it is closed (SPEC section 3), so a reader refuses the file.");
						break;
					}
					closeAll();
					mod = this.node("module", root, a, this.lineProps(it));
					noticeSeen = false;
					break;
				}
				case "module-end": {
					if (!mod) {
						this.asWritten(cur(), a, "A module is closed that was never opened (SPEC section 3), so a reader refuses the file.");
						break;
					}
					closeAll();
					mod.tailStart = a.start;
					mod.end = a.end;
					mod.closed = true;
					mod = null;
					break;
				}
				case "activity": {
					closeAll();
					act = this.node("activity", mod ?? root, a, this.lineProps(it));
					break;
				}
				case "tab": {
					if (it?.where === "activity" && act) {
						page = row = null;
						tab = this.node("activity-tab", act, a, { ...this.lineProps(it), id: it.tabId ?? null });
					} else if (it?.where === "module" && mod && !act) {
						mtab = this.node("module-tab", mod, a, { ...this.lineProps(it), id: it.tabId ?? null });
					} else {
						this.asWritten(cur(), a, "A tab line belongs inside an activity, or in a module's opening before its first activity (SPEC section 3), so a renderer ignores it.");
					}
					break;
				}
				case "page-named": {
					const firstTab = tabsOf.get(actKey(act));
					const opening = act !== null && tab === null && firstTab !== undefined && firstTab > a.start;
					if (!act || data) this.asWritten(cur(), a, "A page line belongs inside an activity, in one of its tabs or anywhere in an activity with no tab line (SPEC section 3, 'Pages'), so a renderer ignores it.");
					else if (opening) this.asWritten(cur(), a, "A page line above an activity's first tab line stands in the activity's opening, which is no page of any tab (SPEC section 3, 'Pages'), so a renderer ignores it.");
					else {
						row = null;
						page = this.node("page", tab ?? act, a, { ...this.lineProps(it), id: it?.pageId ?? null });
					}
					break;
				}
				case "callout": {
					const kind = it?.kind ?? "";
					if (kind === "row") {
						if (it?.words?.flags.has("end")) {
							if (row) {
								row.tailStart = a.start;
								row.end = a.end;
								row.closed = true;
								row = null;
							} else this.asWritten(cur(), a, "A row is closed that was never opened (SPEC section 3, 'Rows').");
						} else if (row) this.asWritten(cur(), a, "A row opens inside a row (rows do not nest, SPEC section 3, 'Rows').");
						else if (!rowEnd(k)) this.asWritten(cur(), a, "A row that is never closed before a break, a tab, a page, an activity or a module line (SPEC section 3, 'Rows').");
						else row = this.node("row", cur(), a, { ...this.words(it), detail: "row" });
						break;
					}
					if (kind === "notice") {
						const ok = this.lenient || (mod !== null && act === null && !noticeSeen && data === null);
						if (ok) {
							noticeSeen = true;
							this.node("notice", cur(), a, { detail: "notice" });
						} else this.asWritten(cur(), a, "A notice sits inside a module's fence before its first activity, and a module has at most one (SPEC section 3, 'A module's notice').");
						break;
					}
					this.block(cur(), a, inAct(), data !== null);
					break;
				}
				case "page-break": {
					const ok = this.lenient || (inAct() && row === null);
					if (ok) this.node("page-break", cur(), a, { detail: "***" });
					else this.node("prose", cur(), a);
					break;
				}
				default: {
					const parent = cur();
					const nd = this.block(parent, a, inAct(), data !== null);
					if (nd.kind === "question") k = this.absorb(nd, atoms, k);
				}
			}
		}
		this.finish(root);
		if (act && s.implicit) {
			// the implicit activity has no line of its own: it starts at its first block
			const first = act.children[0];
			act.start = first ? first.start : act.start;
			act.headEnd = act.start;
		}
		root.end = n;
		root.tailStart = n;
		const first = root.children[0];
		root.headEnd = first ? first.start : n;
		this.fixDepth(root, 0);
		return root;
	}

	fixDepth(n: DesignNode, d: number): void {
		n.depth = d;
		for (const c of n.children) {
			c.parent = n;
			this.fixDepth(c, d + 1);
		}
	}
}

/** A note read into the design tree. */
export function parseDesign(text: string, opts: ParseOptions = {}): DesignNode {
	return new Builder(scan(text), opts.lenient === true).build();
}

/** The nodes in file order (a node before its children), with the booklet itself first. */
export function walkDesign(root: DesignNode, out: DesignNode[] = []): DesignNode[] {
	out.push(root);
	for (const c of root.children) walkDesign(c, out);
	return out;
}

/** The line ranges a node owns itself: all of a leaf; the head and the tail of a container. */
export function ownRanges(n: DesignNode): [number, number][] {
	if (!isContainer(n)) return [[n.start, n.end]];
	const out: [number, number][] = [[n.start, n.headEnd]];
	if (n.tailStart < n.end) out.push([n.tailStart, n.end]);
	return out;
}

/** The note's lines as every node's own lines give them, joined: `reassemble(parseDesign(t)) === t` for every note. */
export function reassemble(root: DesignNode, text: string): string {
	const lines = text.split("\n");
	const out: string[] = [];
	const emit = (from: number, to: number): void => {
		for (let k = from; k < to; k++) out.push(lines[k] ?? "");
	};
	const visit = (n: DesignNode): void => {
		if (!isContainer(n)) {
			emit(n.start, n.end);
			return;
		}
		emit(n.start, n.headEnd);
		for (const c of n.children) visit(c);
		emit(n.tailStart, n.end);
	};
	visit(root);
	return out.join("\n");
}

/** Is the tree well formed for a note of `count` lines: children in order, touching, inside their parent; every line owned once? A sentence naming the first fault, or null. */
export function checkDesign(root: DesignNode, count: number): string | null {
	if (root.start !== 0 || root.end !== count) return `the booklet spans ${root.start}-${root.end}, not 0-${count}`;
	let owned = 0;
	let fault: string | null = null;
	const visit = (n: DesignNode): void => {
		if (fault) return;
		const where = `${n.kind} at ${n.start}`;
		if (n.start > n.headEnd || n.headEnd > n.tailStart || n.tailStart > n.end) {
			fault = `${where}: its parts are out of order (${n.start}, ${n.headEnd}, ${n.tailStart}, ${n.end})`;
			return;
		}
		if (!isContainer(n)) {
			owned += n.end - n.start;
			return;
		}
		owned += n.headEnd - n.start + (n.end - n.tailStart);
		let at = n.headEnd;
		for (const c of n.children) {
			if (c.parent !== n) fault = `${where}: a child's parent is not it`;
			else if (c.start !== at) fault = `${where}: a child starts at ${c.start} where ${at} was expected`;
			at = c.end;
			visit(c);
		}
		if (!fault && at !== n.tailStart) fault = `${where}: its children end at ${at}, not at ${n.tailStart}`;
	};
	visit(root);
	if (!fault && owned !== count) fault = `${owned} lines are owned, not ${count}`;
	return fault;
}

/** The lines of a node, as the note has them. */
export const linesOf = (text: string, n: DesignNode): string[] => text.split("\n").slice(n.start, n.end);

/** One row per node, indented by depth: `kind[:detail] id start-end`. For the tests and the shared cases. */
export function designOutline(root: DesignNode): string[] {
	return walkDesign(root).map((n) => {
		const what = n.kind === "as-written" ? "as-written" : n.detail && (n.kind === "question" || n.kind === "callout") ? `${n.kind}:${n.detail}` : n.kind;
		return "  ".repeat(n.depth) + [what, n.id ?? "-", `${n.start}-${n.end}`].join(" ");
	});
}

/** The module tab an activity is drawn under: the one its `tab:` names, else the module's first; null outside a module or when the module has no tab. */
export function moduleTabOf(activity: DesignNode): DesignNode | null {
	const m = activity.parent;
	if (activity.kind !== "activity" || !m || m.kind !== "module") return null;
	const tabs = m.children.filter((c) => c.kind === "module-tab");
	const named = activity.set["tab"];
	return tabs.find((t) => t.id === named) ?? tabs[0] ?? null;
}

export interface PageEntry {
	/** The page line's node, or null for the words before a tab's first page line (the tab's own first page). */
	page: DesignNode | null;
	children: PageEntry[];
}

/**
 * The pages of a tab (or of an activity with no tab) as the format reads them (SPEC section 3, "The shape of a tab's tree"): the words
 * before the first page line are the first page, pages with no `parent:` stand side by side after it, and `parent:<id>` puts a page
 * under the page of that id in the same tab (a parent that is not there puts it at the top). The file keeps them side by side; this is
 * the drawn tree.
 */
export function pageTree(holder: DesignNode): PageEntry[] {
	const pages = holder.children.filter((c) => c.kind === "page");
	const entries = pages.map<PageEntry>((p) => ({ page: p, children: [] }));
	const byId = new Map<string, PageEntry>();
	for (const e of entries) if (e.page?.id && !byId.has(e.page.id)) byId.set(e.page.id, e);
	const top: PageEntry[] = [];
	for (const e of entries) {
		const up = e.page?.set["parent"] ? byId.get(e.page.set["parent"]) : undefined;
		// a page that is its own ancestor is drawn once, at the top
		let loop = false;
		let u: PageEntry | undefined = up;
		for (let steps = 0; u && !loop && steps <= entries.length; steps++) {
			loop = u === e;
			u = u.page?.set["parent"] ? byId.get(u.page.set["parent"]) : undefined;
		}
		if (up && up !== e && !loop) up.children.push(e);
		else top.push(e);
	}
	// the words before the first page line are the first page, unless they are nothing but comments and a lone `***`
	const firstAt = holder.children.findIndex((c) => c.kind === "page");
	const before = holder.children.slice(0, firstAt < 0 ? holder.children.length : firstAt);
	const words = before.some((c) => c.kind !== "comment" && c.kind !== "page-break" && c.kind !== "activity-tab");
	return words || !pages.length ? [{ page: null, children: [] }, ...top] : top;
}
