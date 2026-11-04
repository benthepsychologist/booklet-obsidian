# Releasing Booklet 1.0.0: the steps, from the repository as it is

> **Superseded in part (2026-11-03).** The workflow no longer publishes only pre-releases: a plain `x.y.z` tag is now a real release and `x.y.z-<suffix>` is a pre-release for BRAT. `docs/release-flow.md` is the current procedure. The text below is the 1.0.0 record as it was written, and its "PRE-RELEASE" statements and open question describe the workflow before that change.

Written 2026-11-03 from `package.json`, `version-bump.mjs`, `release-check.mjs`, `.github/workflows/release.yml`, `manifest.json`, `versions.json`, `.npmrc` and the README's "Releasing" and "Install a test build with BRAT" sections. Nothing here has been run: no bump, no tag, no release.

## What a release is

A release is made by pushing a plain `x.y.z` tag. The workflow `.github/workflows/release.yml` (it runs on any pushed tag, `on.push.tags: "*"`) checks the tag, builds, tests, attests three files and publishes them as a GitHub release.

> **The workflow publishes a PRE-RELEASE.** `.github/workflows/release.yml` line 58 is `gh release create "$GITHUB_REF_NAME" --title "$GITHUB_REF_NAME" --prerelease --generate-notes \` (the file list is on line 59). The header comment on lines 1 to 3 says the same. Nothing in the workflow makes a full release afterwards, so the maintainer either edits the release on GitHub by hand or changes line 58 (see the open question at the end).

## Which files carry the version

| File | Field | Now | Written by |
| --- | --- | --- | --- |
| `package.json` | `version` | `0.13.0` | `npm version` itself |
| `manifest.json` | `version` | `0.13.0` | `version-bump.mjs` |
| `versions.json` | key `"<version>"`, value the manifest's `minAppVersion` | last key `"0.13.0": "1.11.7"` | `version-bump.mjs` |

- `package-lock.json` also carries the version in its own `version` fields; `npm version` updates it when it runs. After the bump, check that `git diff` shows it changed with the others.
- `minAppVersion` is in `manifest.json` (now `1.11.7`). `version-bump.mjs` copies it into `versions.json` as the new version's value; it does not change it.
- The built `main.js` carries no version of its own. The copies in `test-vault/.obsidian/plugins/booklet/` (`main.js`, `manifest.json`, `styles.css`) are what CI compares against a fresh build, so a bump to `manifest.json` also means those copies change (see step 2).

## The steps

1. **Start from the right place.** The 1.0.0 work is on this branch family (`feat/100-release`, with the fix-round lanes merged). The tag has to end up on `main` (the workflow refuses a tag that is not an ancestor of `origin/main`, lines 34 to 37), so the branch is merged to `main` first, by pull request, with CI green.
2. **Bump the version, on the branch that is going to be merged:**
   ```
   npm version 1.0.0
   ```
   The `version` script in `package.json` is `node version-bump.mjs && git add manifest.json versions.json`. `npm version` writes `package.json` (and the lockfile), then runs `version-bump.mjs`, which reads the new version from `npm_package_version`, refuses anything that is not a plain `x.y.z`, writes it into `manifest.json` and adds `"1.0.0": "<minAppVersion>"` to `versions.json`. `.npmrc` has `git-tag-version=false`, so npm makes no commit and no tag; commit the changed files yourself.
3. **Rebuild the vault copies and commit them:** `npm run build` (it type-checks, then runs `node esbuild.config.mjs production`, and copies `main.js`, `manifest.json` and `styles.css` into `test-vault/.obsidian/plugins/booklet/`). CI's last step fails if those copies differ from a fresh build, and the `manifest.json` copy now has the new version.
4. **Test:** `npm test`, and the real-Obsidian suite (`e2e/plugin-check.js`, 59 checks; `e2e/README.md`) on 1.14.5 and 1.11.7 if the code changed since the last full run. Merge to `main` once CI (`.github/workflows/ci.yml`) is green.
5. **Check before tagging, by hand:** `node release-check.mjs 1.0.0` (below) should print `release-check: 1.0.0 is the version everywhere`. It is the same check the workflow runs first.
6. **Tag `main` and push the tag:**
   ```
   git checkout main && git pull --ff-only
   git tag -a 1.0.0 -m 1.0.0
   git push origin 1.0.0
   ```
   The tag is exactly `1.0.0`, with no leading `v`: Obsidian wants the tag to match the manifest's `version`, and `release-check.mjs` compares the tag to the version as written.
7. **Watch the workflow** (Actions tab, "Release"). It runs these steps, in order:
   - `node release-check.mjs "$GITHUB_REF_NAME"`, then `git merge-base --is-ancestor "$GITHUB_SHA" origin/main` (not on `main`: stops);
   - `npm ci`, `npm run build`, `npm test` (the corpus tests skip on the runner, which has no Booklet repository);
   - `actions/attest@v4` over `main.js`, `manifest.json` and `styles.css` (a build-provenance attestation);
   - `gh release create ... --prerelease --generate-notes main.js manifest.json styles.css`.

## What `release-check.mjs` verifies

Given the tag as its one argument, it reads `manifest.json`, `package.json` and `versions.json` and exits 1 with one message per problem if any of these fails:

- the tag is a plain `x.y.z` (`^\d+\.\d+\.\d+$`);
- `manifest.json` `version` equals the tag;
- `package.json` `version` equals the tag;
- `versions.json[tag]` equals the manifest's `minAppVersion`.

It does not check that the three release files exist (the workflow's `gh release create` fails without them), that the lockfile agrees, or that the test-vault copies are current.

## What to check on the release page afterwards

On `https://github.com/benthepsychologist/booklet-obsidian/releases`:

- the release is named and tagged `1.0.0`, and its state is what you meant. **It will be marked Pre-release** unless you change it.
- exactly three attached assets, besides the source archives: `main.js`, `manifest.json`, `styles.css`;
- the attached `manifest.json` says `"version": "1.0.0"` and `"minAppVersion": "1.11.7"` (download it; compare it with the repository's);
- the notes (generated) are what you want to show, or are edited;
- the attestation: `gh attestation verify main.js --repo benthepsychologist/booklet-obsidian` on a downloaded `main.js`;
- BRAT: in a scratch vault, BRAT installs the newest release for `benthepsychologist/booklet-obsidian` (README, "Install a test build with BRAT"), and Booklet turns on and opens a booklet note.

## Open question: does Obsidian's directory accept a release marked pre-release?

**Not answered.** Two Obsidian documentation pages were fetched on 2026-11-03:

- `https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions`
- `https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin`

Neither mentions a pre-release. The first mentions only a draft release ("The workflow has created a draft GitHub release and uploaded the required assets as binary attachments", as the page text came back from the fetch tool); the second says the release's tag must match the manifest's version. Both pages are drawn by script, so only a text extract could be read, not the page source; the quotes are the extract's, not checked against the raw page. So the docs neither allow nor forbid a pre-release, and this repository has no other evidence. It is item 27 of `docs/directory-checklist-100.md` and stays open. Before the directory submission, either ask Obsidian (the plugin review team, or the `obsidian-releases` repository's guidelines) or make the 1.0.0 release a full release: drop `--prerelease` from `release.yml` line 58 before tagging, or untick "Set as a pre-release" on the finished release's page. Until it is answered, do not assume either way.

## Not done here

No bump, tag, release or push was made while writing this file. The directory submission itself (a pull request to `obsidianmd/obsidian-releases`) is not covered: `docs/directory-checklist-100.md` is the list for that.
