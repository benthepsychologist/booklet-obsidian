/*
 * The outline: a tree of the booklet's structure in file order, built from the scan (the linter's own reading).
 *
 *   module                   its tabs (declared in its opening), its activities, the menus and questions in its opening
 *     activity               its opening, then its tabs; a part (the opening, or one tab) with named pages is split into them
 *       tab                  (a page under its `parent:`), and one with page breaks into "Page 1", "Page 2", ...
 *         page
 *           group            a group in an activity (one step each, read one at a time), holding its questions
 *             question
 *   data section, records    the two other lines that walk the file (SPEC section 3, "Navigating the file")
 *
 * Activities outside every module sit at the top, as the module with no name. A file with no module and no activity line is one
 * activity, shown as one node named by its front matter title. Every node has the line it starts on. Plain TypeScript: nothing
 * here imports Obsidian.
 */
import { scan, type CalloutWords, type Scan } from "./editor-scan";

export type OutlineType = "module" | "activity" | "tab" | "page" | "group" | "question" | "menu" | "data" | "records";

export interface OutlineNode {
	type: OutlineType;
	/** 0-based line the node starts on. */
	line: number;
	children: OutlineNode[];
	id?: string | null;
	label?: string;
	kind?: string;
	fold?: string;
	words?: CalloutWords;
	implicit?: boolean;
	endLine?: number;
	/** A named page (`> [!page]`), as against a part of a tab cut by a page break. */
	named?: boolean;
}

function frontTitle(lines: readonly string[]): string {
	if (!lines.length || (lines[0] ?? "").trim() !== "---") return "";
	for (let k = 1; k < lines.length && (lines[k] ?? "").trim() !== "---"; k++) {
		const m = /^title:\s*["']?(.*?)["']?\s*$/.exec(lines[k] ?? "");
		if (m) return m[1] ?? "";
	}
	return "";
}

const node = (type: OutlineType, line: number, props?: Partial<OutlineNode>): OutlineNode => ({ type, line, children: [], ...props });

interface PagePart {
	line: number;
	nodes: OutlineNode[];
}

interface Part {
	tab: OutlineNode | null;
	/** What stands before any named page, and then the break-cut pages. */
	pages: PagePart[];
	/** Named pages of this part, in file order, each with the nodes under it. */
	named: { page: OutlineNode; parent: string | null }[];
	line: number;
}

interface Holder {
	owner: OutlineNode;
	parts: Part[];
}

const newPart = (tab: OutlineNode | null, line: number): Part => ({ tab, pages: [{ line, nodes: [] }], named: [], line });
const holderOf = (owner: OutlineNode): Holder => ({ owner, parts: [newPart(null, owner.line)] });

function addTo(h: Holder, n: OutlineNode): void {
	const part = h.parts[h.parts.length - 1];
	if (!part) return;
	const last = part.named[part.named.length - 1];
	if (last) last.page.children.push(n);
	else part.pages[part.pages.length - 1]?.nodes.push(n);
}

function finish(h: Holder): void {
	for (const part of h.parts) {
		const target = part.tab ? part.tab.children : h.owner.children;
		if (part.pages.length > 1) {
			part.pages.forEach((p, k) => {
				const pg = node("page", k === 0 ? part.line : p.line, { label: "Page " + (k + 1) });
				pg.children = p.nodes;
				target.push(pg);
			});
		} else target.push(...(part.pages[0]?.nodes ?? []));
		// named pages: a page whose `parent:` names another page of the tab goes under it
		const byId = new Map<string, OutlineNode>();
		for (const n of part.named) if (n.page.id && !byId.has(n.page.id)) byId.set(n.page.id, n.page);
		for (const n of part.named) {
			const up = n.parent ? byId.get(n.parent) : undefined;
			if (up && up !== n.page) up.children.push(n.page);
			else target.push(n.page);
		}
		if (part.tab) h.owner.children.push(part.tab);
	}
}

export function outlineOf(s: Scan): OutlineNode[] {
	const roots: OutlineNode[] = [];
	let mod: OutlineNode | null = null;
	let holder: Holder | null = null;
	let group: { node: OutlineNode; end: number } | null = null;
	const close = (): void => {
		if (holder) finish(holder);
		holder = null;
		group = null;
	};
	const place = (n: OutlineNode): void => {
		if (group && n.line < group.end) {
			group.node.children.push(n);
			return;
		}
		group = null;
		if (holder) addTo(holder, n);
		else if (mod) mod.children.push(n);
		else roots.push(n);
	};

	if (s.implicit) {
		const one = node("activity", s.bodyStart, { label: frontTitle(s.lines) || "This booklet", id: null, implicit: true });
		roots.push(one);
		holder = holderOf(one);
	}

	for (const it of s.items) {
		const title = (it.title ?? "").trim();
		if (it.type === "module") {
			close();
			mod = node("module", it.line, { id: it.id ?? null, label: title, ...(it.words ? { words: it.words } : {}) });
			roots.push(mod);
		} else if (it.type === "module-end") {
			close();
			if (mod) mod.endLine = it.line;
			mod = null;
		} else if (it.type === "activity") {
			if (!s.implicit) close();
			const a = node("activity", it.line, { id: it.id ?? null, label: title, ...(it.words ? { words: it.words } : {}) });
			(mod ? mod.children : roots).push(a);
			holder = holderOf(a);
		} else if (it.type === "tab") {
			const t = node("tab", it.line, { id: it.tabId ?? null, label: title });
			if (holder && it.where === "activity") {
				group = null;
				holder.parts.push(newPart(t, it.line));
			} else if (mod && it.where === "module") mod.children.push(t);
		} else if (it.type === "page-named") {
			if (holder) {
				group = null;
				const part = holder.parts[holder.parts.length - 1];
				const pg = node("page", it.line, { id: it.words?.id ?? null, label: title || (it.pageId ?? ""), named: true });
				part?.named.push({ page: pg, parent: it.words?.set["parent"] ?? null });
			}
		} else if (it.type === "page") {
			if (holder) {
				group = null;
				const part = holder.parts[holder.parts.length - 1];
				// a page break inside a named page is a break within it; the part is cut into "Page n" only before any named page
				if (part && !part.named.length) part.pages.push({ line: it.line, nodes: [] });
			}
		} else if (it.type === "group" && it.reads) {
			const g = node("group", it.line, { label: title, fold: it.fold ?? "" });
			place(g);
			group = { node: g, end: it.end ?? it.line + 1 };
		} else if (it.type === "question" || it.type === "menu") {
			place(node(it.type, it.line, { kind: it.kind ?? "", id: it.id ?? null, label: title, ...(it.words ? { words: it.words } : {}) }));
		} else if (it.type === "data") {
			close();
			mod = null;
			roots.push(node("data", it.line, { id: it.names ?? null, label: title }));
		} else if (it.type === "records") {
			close();
			mod = null;
			roots.push(node("records", it.line, { label: "Records (answers; written by the app)" }));
		}
	}
	close();
	return roots;
}

export const outline = (text: string): OutlineNode[] => outlineOf(scan(text));

/** The nodes in tree order, flattened with their depth. */
export function flatten(roots: readonly OutlineNode[], depth = 0, out: { node: OutlineNode; depth: number }[] = []): { node: OutlineNode; depth: number }[] {
	for (const n of roots) {
		out.push({ node: n, depth });
		flatten(n.children, depth + 1, out);
	}
	return out;
}
