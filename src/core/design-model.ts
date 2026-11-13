/*
 * What the Design view draws and offers, decided from the tree, so it is tested without a DOM. Plain TypeScript: nothing here imports
 * Obsidian or the DOM.
 *
 *   levelOf       which of the seven levels a node is drawn as (booklet, module, module tab, activity, activity tab, page, block)
 *   nameOf        what a node is called on screen
 *   crumbOf       the nodes from the booklet down to a node, for the breadcrumb
 *   addChoices    what a container's "+ Add" offers: only what design-places says is legal there, as the pieces of the pieces table
 *   moveTargets   where "Move up" and "Move down" would put a block
 *   needsAsking   whether a change reports something the reader has to say yes to first
 */
import type { DesignKind, DesignNode } from "./design-tree";
import { addPosition, canPlacePiece, checkNeed, containerAdds, needOfNode, needsOf, placeCheck, positionAfter, positionBefore, type DesignPosition, type NeedKind, type PlaceKind } from "./design-places";
import type { OpDone } from "./design-ops";
import { PIECES, type Piece } from "./editor-pieces";

export type Level = "booklet" | "module" | "module-tab" | "activity" | "activity-tab" | "page" | "block";

export const LEVELS: readonly Level[] = ["booklet", "module", "module-tab", "activity", "activity-tab", "page", "block"];

const LEVEL_OF: Partial<Record<DesignKind, Level>> = {
	booklet: "booklet",
	module: "module",
	"module-tab": "module-tab",
	activity: "activity",
	"activity-tab": "activity-tab",
	page: "page",
};

export const levelOf = (n: DesignNode): Level => LEVEL_OF[n.kind] ?? "block";

/** What a node is called: the title on its line, else its id, else nothing. */
export const nameOf = (n: DesignNode): string => n.label.trim() || n.id || "";

/**
 * The icon names a node may be drawn with, best first: the shell takes the first one Obsidian's icon set has (`getIcon` is null for a
 * name it lacks, and the names here are Lucide's, which Obsidian carries a version of: the floor release has some of the newer spellings
 * under their older names, so each level lists both). The last of each list is a name that has been in Lucide for years.
 */
export const LEVEL_ICONS: Readonly<Record<Level, readonly string[]>> = {
	booklet: ["book-open", "book"],
	module: ["layers", "folder"],
	"module-tab": ["panel-top", "folder-tree", "list"],
	activity: ["list-checks", "check-square", "clipboard-list", "list"],
	"activity-tab": ["bookmark", "tag"],
	page: ["file-text", "file"],
	block: ["square", "box"],
};

/** A block's own icon where its kind has one; the level's otherwise. */
const KIND_ICONS: Partial<Record<DesignKind, readonly string[]>> = {
	"front-matter": ["file-cog", "settings", "file-text"],
	"data-section": ["database", "table"],
	records: ["lock", "database"],
	group: ["square-stack", "folder", "layers"],
	row: ["columns-2", "columns", "layout-grid"],
	question: ["circle-help", "help-circle", "message-circle"],
	callout: ["message-square", "quote", "info"],
	notice: ["info", "alert-circle"],
	menu: ["list", "list-ordered"],
	query: ["table", "layout-grid"],
	fence: ["database", "table"],
	"page-break": ["scissors", "minus"],
	prose: ["align-left", "text", "file-text"],
	comment: ["message-circle", "message-square"],
	"as-written": ["alert-triangle", "file-warning", "file-text"],
};

export const iconNamesOf = (n: DesignNode): readonly string[] => KIND_ICONS[n.kind] ?? LEVEL_ICONS[levelOf(n)];

/** The nodes from the booklet down to this one, this one included. */
export function crumbOf(n: DesignNode): DesignNode[] {
	const out: DesignNode[] = [];
	for (let c: DesignNode | null = n; c; c = c.parent) out.unshift(c);
	return out;
}

/** A block the view has no piece for, "words", that a container can still take (the format reads any text there as prose). */
export const WORDS_PIECE: Pick<Piece, "file" | "group" | "label" | "text"> = { file: "(words)", group: "reading", label: "words", text: "Some words.\n\n" };

export interface AddPiece {
	file: string;
	label: string;
	group: Piece["group"];
	text: string;
}

export interface AddGroup {
	kind: PlaceKind;
	position: DesignPosition;
	pieces: AddPiece[];
}

export interface AddChoices {
	groups: AddGroup[];
	/** What a container would take if another part stood first: a page in a module with no activity, and the part to add first. */
	first: { kind: PlaceKind; first: PlaceKind }[];
	/** The container holds nothing yet (its words are `EMPTY_TEXT[node.kind]`). */
	empty: boolean;
}

/** Does a piece whose first part is `need` belong under the "+ Add" kind `kind`? A tab is a module's or an activity's by where it stands. */
const belongs = (need: NeedKind | undefined, kind: PlaceKind): boolean => need === kind || (need === "tab" && (kind === "module-tab" || kind === "activity-tab"));

/**
 * What "+ Add" in a container offers. The kinds are the ones `containerAdds` lists as legal where each would go; under each kind are the
 * pieces whose first part it is and that may stand there as a whole (`canPlacePiece`), so nothing illegal is ever on the list. A kind with
 * no piece is left out.
 */
export function addChoices(container: DesignNode): AddChoices {
	const adds = containerAdds(container);
	const groups: AddGroup[] = [];
	for (const kind of adds.kinds) {
		const position = addPosition(container, kind);
		const pieces = [...PIECES, WORDS_PIECE]
			.filter((p) => belongs(needsOf(p)[0], kind) && canPlacePiece(position, p).ok)
			.map((p) => ({ file: p.file, label: p.label, group: p.group, text: p.text }));
		if (pieces.length) groups.push({ kind, position, pieces });
	}
	return { groups, first: adds.first, empty: adds.empty !== null };
}

export interface MoveTargets {
	up: DesignPosition | null;
	down: DesignPosition | null;
}

/** May this block stand at this position, by the legal-places rules? A tab stays the kind of tab it is (moveBlock's rule). */
function mayStand(n: DesignNode, pos: DesignPosition): boolean {
	const need = needOfNode(n);
	if (!need) return false;
	// a notice and a theme are "at most one": on the tree that still holds the block itself the check would count it twice, so it is left to moveBlock, which checks with the block taken out
	if (need === "notice" || need === "theme") return true;
	return (n.kind === "module-tab" ? placeCheck("module-tab", pos) : n.kind === "activity-tab" ? placeCheck("activity-tab", pos) : checkNeed(pos, need)).ok;
}

/**
 * Above the previous sibling and below the next one: a block moves one place among its siblings. The first has no up and the last no down,
 * and a place the format would not read the block in (an activity above its module's tabs, anything above the front matter) is no target,
 * so the button is off rather than a press that is refused. `moveBlock` still checks, on the note with the block taken out, and says why
 * in words if it refuses.
 */
export function moveTargets(n: DesignNode): MoveTargets {
	const sibs = n.parent?.children ?? [];
	const at = sibs.indexOf(n);
	const before = at > 0 ? sibs[at - 1] : undefined;
	const after = at >= 0 ? sibs[at + 1] : undefined;
	const up = before ? positionBefore(before) : null;
	const down = after ? positionAfter(after) : null;
	return { up: up && mayStand(n, up) ? up : null, down: down && mayStand(n, down) ? down : null };
}

/** A change that counted something it would leave not matching, could not count, or would leave the reader unable to open the note, is asked about first. */
export const needsAsking = (op: Pick<OpDone, "impact" | "blind" | "breaks">): boolean => op.blind || op.impact.length > 0 || !!op.breaks;
