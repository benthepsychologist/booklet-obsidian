/*
 * The Design view's outline and its list of lines the reader cannot read, as data. Plain TypeScript: nothing here imports Obsidian or
 * the DOM. They moved here from the side panel (the panel's Outline and Problems sections), and every entry now names the node of the
 * Design view's tree it belongs to, so a press on one can select that block.
 *
 * The outline lists the structure of the booklet and the blocks that carry an id: modules and their tabs, activities and their tabs,
 * pages (under their `parent:` as the tree has them), groups, questions, menus, the data section and the records. Words, reading
 * callouts, notices and page breaks are not listed. (The panel's outline also cut an activity or tab into "Page 1", "Page 2" at each
 * page break; the tree draws a page break as a block of its own and has no such pages, so the outline does not either.)
 *
 * The problems are the panel's own list, made from what the reader already reads (editor-problems.ts): a line it cannot read, a line
 * it reads with a complaint, and kept data that matches nothing now. Each is matched to the innermost block that holds its line.
 */
import { pageTree, walkDesign, type DesignKind, type DesignNode, type PageEntry } from "./design-tree";
import type { Problem } from "./editor-problems";

/** The kinds the outline lists. */
export const OUTLINE_KINDS: ReadonlySet<DesignKind> = new Set<DesignKind>(["module", "module-tab", "activity", "activity-tab", "page", "group", "question", "menu", "data-section", "records"]);

export interface OutlineEntry {
	node: DesignNode;
	/** How many listed blocks hold it. */
	depth: number;
}

/**
 * The listed blocks of the tree in file order, each with its depth among the listed ones. The pages of a tab or an activity are listed
 * as `pageTree` has them: a page under the page its `parent:` names, as the panel's outline had them (the file keeps them side by
 * side, and the drawn tree does too).
 */
export function outlineEntries(root: DesignNode): OutlineEntry[] {
	const out: OutlineEntry[] = [];
	const visit = (n: DesignNode, depth: number): void => {
		const listed = n.parent !== null && OUTLINE_KINDS.has(n.kind);
		if (listed) out.push({ node: n, depth });
		const inner = listed ? depth + 1 : depth;
		const pages = (list: readonly PageEntry[], level: number): void => {
			for (const e of list) {
				if (e.page) visit(e.page, inner + level);
				pages(e.children, level + 1);
			}
		};
		let done = false;
		for (const c of n.children) {
			if (c.kind !== "page") visit(c, inner);
			else if (!done) {
				done = true;
				pages(pageTree(n), 0);
			}
		}
	};
	visit(root, 0);
	return out;
}

/** The innermost block whose lines hold this line (0-based): its own opening, its closing line, or what it is made of. */
export function nodeAtLine(root: DesignNode, line: number): DesignNode {
	let best = root;
	for (const n of walkDesign(root)) if (n.start <= line && line < n.end && n.depth >= best.depth) best = n;
	return best;
}

export interface Trouble {
	problem: Problem;
	/** The block the line is in; null for a problem of the whole note. */
	node: DesignNode | null;
}

/** Each problem with the block it belongs to, in the order given. A problem of a line the tree does not reach belongs to no block. */
export function troublesOf(root: DesignNode, problems: readonly Problem[]): Trouble[] {
	return problems.map((problem) => ({ problem, node: problem.line === null || problem.line < 0 || problem.line >= root.end ? null : nodeAtLine(root, problem.line) }));
}
