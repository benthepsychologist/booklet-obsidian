// The made-up notes of checks 86 to 93 (stage 4 of the Design view): one small booklet for each control family, each with the awkward shapes the
// controls must keep. Plain strings, no Obsidian: a check writes one into its own copy of the vault, and the reference linter can be run on each of
// them on its own. Every word is made up.
const front = name => ["---", "booklet: \"0.20\"", `id: booklet-test/stage4-${name}`, `title: Stage four ${name}`, "lang: en", "---", ""];

/** 86 and 89: the fold switch of a callout and of a group, a hint nested in a group, and a question with no blank line before its solution. */
const folds = name => [
  ...front(name),
  "> [!module|m] Week", "",
  "> [!activity|a] The week", "",
  "Plain words of the activity.", "",
  "> [!tip]- A folded tip", "> Words of the tip.", "",
  "> [!note] A plain note", "> Note words.", "",
  "> [!note]+ An open note", "> Open words.", "",
  "> [!group] Step one", "> Setup words.", ">", "> > [!choice|c1] Pick?", "> - [ ] A", "> - [ ] B", ">", "> > [!hint]-", "> > Words that help.", "",
  "> [!group]- A folded group", "> Inside words.", "",
  "> [!text|q long] Why?", "> Think about it.", "> [!solution]- Model answer", "> Because.", "",
  "> [!choice|bare] A bare question?", "- [ ] One", "- [ ] Two", "",
  "> [!text|why long] Why again?", "> Say more.", "",
  "> [!hint]- Hint", "> Look at the moon.", "",
  "> [!solution]- Model answer", "> Because.", "> Really.", "",
  "> [!choice|lst] A question whose hint is a list?", "- [ ] One", "- [ ] Two", "",
  "> [!hint]- Help", "> - first", "> - second", "",
  "> [!module|m end]", "",
].join("\n");

/** 87: an activity's tab and a page's parent (a tab that is not there, a parent that is not a page, a loop already in the note). */
const structure = (name, { loop = false } = {}) => [
  ...front(name),
  "> [!module|m] Week", "",
  "> [!tab|learn] Learn", "",
  "> [!tab] This month", "",
  "> [!activity|alpha tab:learn] Alpha", "",
  "Words of alpha.", "",
  "> [!activity|beta tab:gone] Beta", "",
  "Words of beta.", "",
  "> [!activity|gamma] Gamma", "",
  "Words of gamma.", "",
  "> [!activity|delta repeat] Delta", "",
  "Words of delta.", "",
  "> [!activity|epsilon repeat entries:open] Epsilon", "",
  "Words of epsilon.", "",
  "> [!activity|pages] Pages", "",
  "> [!tab|t1] One tab", "",
  "> [!page|p1" + (loop ? " parent:p3" : "") + "] First", "",
  "Words of the first page.", "",
  "> [!page|p2 parent:p1] Second", "",
  "Words of the second page.", "",
  "> [!page|p3 parent:p2] Third", "",
  "Words of the third page.", "",
  "> [!page|p4] Fourth", "",
  "Words of the fourth page.", "",
  "> [!page|p5 parent:ghost] Fifth", "",
  "Words of the fifth page.", "",
  "> [!tab|t2] Two tabs", "",
  "> [!page|q1] Other tab", "",
  "Words of the other tab.", "",
  "> [!module|m end]", "",
].join("\n");

/** 88: a copy button's list, with a word the picker cannot offer ("gone") and a hint and a solution to copy. */
const copy = name => [
  ...front(name),
  "> [!module|m] Week", "",
  "> [!activity|a] The week", "",
  "> [!text|why long] Why?", "> Think about it.", "",
  "> [!hint]- Hint", "> Look at the moon.", "",
  "> [!solution]- Model answer", "> Because.", "",
  "> [!choice|pick] Which?", "- [ ] One", "- [ ] Two", "",
  "> [!number|n] How many?", "",
  "> [!copy|go of:why,gone] Copy for my tutor", "> Please mark.", "",
  "> [!module|m end]", "",
].join("\n");

/** 90: a module's notice (an unknown line among the four), and a second module's notice with only one line. */
const notice = name => [
  ...front(name),
  "> [!module|m] Week", "",
  "> [!notice]", "> license: Free to copy and share.", "> author: Kept as written", "> source: example.org/check-in", "",
  "> [!activity|a] The week", "",
  "Words of the week.", "",
  "> [!module|m end]", "",
  "> [!module|n] Other", "",
  "> [!notice]", "> license: Share alike.", "",
  "> [!activity|b] Elsewhere", "",
  "Words.", "",
  "> [!module|n end]", "",
].join("\n");

/** 91: a reference-style picture (its place is a definition line elsewhere), an inline one and a file embed. */
const pictures = name => [
  ...front(name),
  "> [!module|m] Week", "",
  "> [!activity|a] The week", "",
  "The harbour at low water:", "",
  "![The harbour at low water][harbour]", "",
  "![Boats](images/boats.png)", "",
  "![Gone][gone]", "",
  "More words after the pictures.", "",
  "[harbour]: images/harbour.jpg", "",
  "> [!module|m end]", "",
].join("\n");

/** 92: two figure embeds in one sentence, a diagram of the module and the shared one, and a diagram of the other module that this page cannot see. */
const figures = name => [
  ...front(name),
  "> [!module|m] Week", "",
  "> [!activity|a] The week", "",
  "Here is the cycle: ![[#^own]] and the other one ![[#^shared]] and a missing one ![[#^nowhere]].", "",
  "> [!data|m] Data", "",
  "```mermaid", "graph LR; A --> B", "```", "^own", "",
  "> [!module|m end]", "",
  "> [!module|n] Other", "",
  "> [!activity|b] Elsewhere", "",
  "Words.", "",
  "> [!data|n] Data of the other", "",
  "```mermaid", "graph LR; X --> Y", "```", "^theirs", "",
  "> [!module|n end]", "",
  "> [!data] Shared", "",
  "```mermaid", "graph LR; S --> T", "```", "^shared", "",
].join("\n");

/** 93: a citation in the source pattern, one outside it, and a second mark of the first. */
const citation = name => [
  ...front(name),
  "> [!module|m] Week", "",
  "> [!activity|a] The week", "",
  "Most harbours see two high tides.[^atlas] Other words.[^plain] Lost.[^lost]", "",
  "[^atlas]: *The Harbour Tide Atlas*, 2nd edition (2019), p. 12: \"The tide rises and falls twice in each lunar day.\" Verified 2026-09-20.", "",
  "[^plain]: Just words, not in the pattern.", "",
  "> [!module|m end]", "",
].join("\n");

module.exports = { folds, structure, copy, notice, pictures, figures, citation };
