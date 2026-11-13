/*
 * The made-up notes the Design view's tests read: every nesting level, and the ways a note can be unreadable. Not a test file (no
 * `.test.mjs`), so `node --test` does not run it.
 */
import { bookletAround } from "./helpers.mjs";

/** The 0-based line a fixture's text has `needle` on (the first line that contains it). */
export const lineOf = (text, needle) => {
	const k = text.split("\n").findIndex((l) => l.includes(needle));
	if (k < 0) throw new Error(`no line has ${needle}`);
	return k;
};

/**
 * Every level: the booklet's opening, a module with its notice and two module tabs, an activity that joins a tab and has its own tabs,
 * a page tree, `***` sections, a group with a question, a row, a bare activity after the module, a data section and the records.
 */
export const FULL = bookletAround(
	[
		"Welcome to the booklet.", // 8
		"",
		"> [!tip] Start here",
		"> A reading callout in the booklet's opening.",
		"",
		"> [!module|money] Money", // 13
		"",
		"Words in the module's opening.",
		"",
		"> [!notice]",
		"> license: Free to share.",
		"",
		"> [!tab|now] This month", // 21
		"",
		"Shown above this month's activities.",
		"",
		"> [!tab|learn] Learn", // 25
		"",
		"> [!activity|spending tab:now repeat] Spending", // 27
		"> half an hour",
		"",
		"What you spent.",
		"",
		"> [!text|spent] What did you spend?", // 32
		"",
		"> [!hint]- Think of today",
		"> Start with the biggest.",
		"",
		"> [!activity|why tab:learn] Why a budget helps", // 38
		"",
		"> [!tab|read] Reading", // 40
		"",
		"> [!page|map icon:footprints] The map", // 42
		"",
		"Where things are.",
		"",
		"***", // 46
		"",
		"A second part.",
		"",
		"> [!page|parent:map] Choosing", // 50
		"",
		"> [!tab|do] Doing", // 52
		"",
		"> [!group] Step one", // 54
		"> Say what you did.",
		">",
		"> > [!choice|did] Did you?", // 57
		"> - [ ] Yes",
		"> - [ ] No",
		"",
		"> [!row]", // 61
		"",
		"### Left",
		"",
		"> [!text|left] Left?",
		"",
		"### Right",
		"",
		"Words on the right.",
		"",
		"> [!row|end]", // 71
		"",
		"> [!module|money end] End of Money", // 73
		"",
		"> [!activity|bare] A bare activity", // 75
		"",
		"> [!number|n1] How many?", // 77
		"",
		"> [!data|money] Data for Money", // 79
		"",
		"```booklet data",
		'{ "fields": { "label": "Label" }, "rows": [ { "label": "one" } ] }',
		"```",
		"^rows",
		"",
		"%%",
		"> [!records|money] Money",
		"",
		"```booklet answers",
		'{ "spent": "a lot" }',
		"```",
		"%%",
		"",
	].join("\n"),
);

/** A module of one activity, with a module tab that has nothing to show on (the linter warns). */
export const ONE_ACTIVITY = bookletAround(
	["> [!module|solo] Solo", "", "> [!tab|only] Only tab", "", "> [!activity|a] The one activity", "", "> [!text|q] A question", "", "> [!module|solo end]", ""].join("\n"),
);

/** Bare activities only: no module fence. */
export const BARE = bookletAround(["> [!activity|one] One", "", "> [!text|a] A", "", "> [!activity|two repeat] Two", "", "> [!scale|s] How much?", "", "0. None", "1. Lots", ""].join("\n"));

/** No module and no activity line: one activity, with a tab and pages of its own. */
export const IMPLICIT = bookletAround(["Some words.", "", "> [!text|q1] A question", "", "> [!tab|b] Second", "", "> [!page|p1] A page", "", "Page words.", ""].join("\n"));

/** A booklet with an activity that holds only pages, no tabs. */
export const PAGES_ONLY = bookletAround(["> [!activity|a] Wiki", "", "Opening.", "", "> [!page|home] Home", "", "Words.", "", "> [!page|parent:home] Child", "", "More.", ""].join("\n"));

/** Text the view cannot read or that stands where it does no work. Each is drawn as written. */
export const UNREAD = bookletAround(
	[
		"A question before any module or activity:", // 8
		"",
		"> [!text|early] Too early", // 10
		"",
		"> [!tab|loose] A tab outside everything", // 12
		"",
		"> [!module|m] Module", // 14
		"",
		"> [!choice|opening] A question in the module's opening", // 16
		"- [ ] A",
		"",
		"> [!page|nowhere] A page in a module's opening", // 19
		"",
		"> [!activity|act] Activity", // 21
		"",
		"> [!page|early-page] A page above the first tab", // 23
		"",
		"> [!tab|t1] First tab", // 25
		"",
		"> [!notice]", // 27
		"> license: late",
		"",
		"> [!row]", // 30: never closed
		"",
		"A row's words.",
		"",
		"> [!tab|t2] Second tab", // 34
		"",
		"> [!bad", // 36: starts like a Booklet line, cannot be read
		"",
		"> [!group] A group",
		"> > [!page|in-group] Structure inside a group",
		"",
		"> [!row|end]", // 41: closes nothing
		"",
		"> [!module|m end]",
		"",
		"> [!module|m end]", // 45: closed twice
		"",
	].join("\n"),
);

/** The same notes written with Windows line endings. */
export const crlf = (text) => text.replace(/\n/g, "\r\n");

/** A note with no final newline. */
export const NO_EOL = BARE.replace(/\n+$/, "");

/** Notes the reading has to survive: nothing, only front matter, only blank lines, a fence that never closes. */
export const ODD = {
	empty: "",
	blank: "\n\n",
	frontOnly: '---\nbooklet: "0.20"\n---\n',
	frontUnclosed: '---\nbooklet: "0.20"\ntitle: T\n',
	fenceOpen: bookletAround("> [!activity|a] A\n\n```booklet data\n{ }\n"),
	comment: bookletAround("> [!activity|a] A\n\n<!--\n\n> [!text|hidden] Not a question\n\n-->\n\n> [!text|q] Q\n"),
	lonelyBreak: bookletAround("> [!activity|a] A\n\nWords\n---\n\n***\n\nMore\n"),
};

export const ALL = { FULL, ONE_ACTIVITY, BARE, IMPLICIT, PAGES_ONLY, UNREAD, FULL_CRLF: crlf(FULL), UNREAD_CRLF: crlf(UNREAD), NO_EOL, ...ODD };
