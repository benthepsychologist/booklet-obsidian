/*
 * Where a block of the note stands, as the reader's references see it: the module its words belong to, and the places a picture's or a
 * footnote's definition may be found from there. Plain TypeScript: nothing here imports Obsidian or the DOM.
 *
 * SPEC section 3, "Where data goes": a reference is looked up in the module's own fence, then the module's own data section, then the
 * shared data section, and never in another module's. The reader (core/reader.ts `definitionScope`, `noteScope`, `blockModule`) gives
 * each definition and each block the scope it is written in; this reads the same from the design tree, so a picker or a field offers
 * what the reader would find.
 */
import type { DesignNode } from "./design-tree";

/** The module a block is written in (the id on its module's line), or null outside every module. */
export function moduleOf(node: DesignNode): string | null {
	for (let n: DesignNode | null = node; n; n = n.parent) {
		if (n.kind === "module") return n.id;
		// a data section names the module whose it is; one with no name is shared by every module
		if (n.kind === "data-section") return n.id;
	}
	return null;
}

/** Is the block in a data section (the blocks at the end of the file that the activities refer to)? */
export function inDataSection(node: DesignNode): boolean {
	for (let n: DesignNode | null = node; n; n = n.parent) if (n.kind === "data-section") return true;
	return false;
}

/**
 * The scope an image definition written in this block is given, the way the reader gives it (`definitionScope`): in the content, its
 * module's id, "" for an activity outside every module, null before the first line of structure (the booklet's opening); in a data
 * section, the module it names, or null when it names none (the shared one).
 */
export interface DefinitionScope {
	section: "content" | "data";
	module: string | null;
}

export function definitionScopeOf(node: DesignNode): DefinitionScope {
	let data: DesignNode | null = null;
	let mod: DesignNode | null = null;
	let act = false;
	for (let n: DesignNode | null = node; n; n = n.parent) {
		if (n.kind === "data-section" && !data) data = n;
		else if (n.kind === "module" && !mod) mod = n;
		else if (n.kind === "activity") act = true;
	}
	if (data) return { section: "data", module: data.id };
	if (mod) return { section: "content", module: mod.id };
	return { section: "content", module: act ? "" : null };
}

/**
 * How far a definition is from a reader in `at`: 0 for one written in the reader's own place, 1 in its module's data section, 2 in the
 * shared data section, and null when the reader cannot see it at all (another module's). The first of the lowest rank is the one used.
 */
export function definitionRank(at: DefinitionScope, def: DefinitionScope): number | null {
	if (def.section === "content") return def.module === at.module ? 0 : null;
	if (at.module !== null && def.module === at.module) return 1;
	return def.module === null ? 2 : null;
}

/** The part of a line a quote mark and the spaces after it take: `> ` and `> > ` in front of a line in a group. */
export const QUOTE_PREFIX = /^(?:>[ \t]?)*/;

/** Is the block inside a group, whose lines the note writes behind `>` marks? */
export function inGroup(node: DesignNode): boolean {
	for (let n: DesignNode | null = node.parent; n; n = n.parent) if (n.kind === "group") return true;
	return false;
}
