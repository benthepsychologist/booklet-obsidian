// Where the e2e scripts get their made-up notes: from test/fixtures.mjs, written into a temporary vault, never read from the repository's
// test-vault (which holds only the built plugin in .obsidian/) and never written into it.
//   const fv = require("./fixture-vault");
//   await fv.load();                                  // once, at the start (fixtures.mjs is an ES module, so it is imported)
//   const src = await fv.makeSourceVault(opt.vault, path.join(WORK, "source-vault"));
//                                                     // a copy of --vault (its .obsidian) plus the notes the old test-vault held at its root
//   fv.text("page-notes/Keyboard walk.booklet.md")    // one fixture's text, by the path it has in a vault
//   fv.writeNotes(vault, fv.inFolder("page-notes"))   // write chosen fixtures into a vault, keeping their layout
//   fv.asset("page-notes", "Screen reader walk", "media", "tone.wav")   // a media file kept in test/page-notes (not a booklet)
const fs = require("fs"), path = require("path");
const { pathToFileURL } = require("url");

const REPO = path.join(__dirname, "..");
let fixtures = null;   // [{ path, text }]

/** Imports test/fixtures.mjs. Idempotent; every other function here needs it to have finished. */
async function load() {
  if (!fixtures) fixtures = (await import(pathToFileURL(path.join(REPO, "test", "fixtures.mjs")).href)).fixtureFiles();
  return fixtures;
}
const loaded = () => { if (!fixtures) throw new Error("fixture-vault: call `await load()` before using the fixtures"); return fixtures; };

/** The text of the fixture at `rel` (its path in a vault, e.g. "Study quiz.booklet.md" or "page-notes/Copy callout.booklet.md"). */
function text(rel) {
  const f = loaded().find(x => x.path === rel);
  if (!f) throw new Error("fixture-vault: no fixture at " + rel + " (there are " + loaded().map(x => x.path).join(", ") + ")");
  return f.text;
}

// Filters for writeNotes: the notes at the vault's root (what the old test-vault held), and those under a folder of the old layout.
const atRoot = f => !f.path.includes("/");
const inFolder = dir => f => f.path.startsWith(dir + "/");

/** Writes the fixtures `pick` keeps (those at the root when it is not given) into `vault`, in the layout they have there. */
function writeNotes(vault, pick = atRoot) {
  for (const f of loaded().filter(pick)) {
    const to = path.join(vault, f.path);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, f.text);
  }
  return vault;
}

/**
 * A copy of `srcVault` (the repository's test-vault: only .obsidian/ with the built plugin) at `dest`, with the root notes written into it.
 * It is the vault a script copies for each session, so a check that compares a note with "the source" reads it from here.
 */
async function makeSourceVault(srcVault, dest) {
  await load();
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(srcVault, dest, { recursive: true });
  return writeNotes(dest);
}

/** A path inside test/page-notes, where the media and picture files (not booklets) the demos need are kept. */
const asset = (...parts) => path.join(REPO, "test", "page-notes", ...parts);

module.exports = { load, text, atRoot, inFolder, writeNotes, makeSourceVault, asset };
