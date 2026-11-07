# Release flow: a pre-release for BRAT, and a real release

Written 2026-11-03 for 1.0.1, from `.github/workflows/release.yml` and `release-check.mjs` as they stand after this change. Nothing here has been run on GitHub: no tag has been pushed with this workflow. `docs/release-checklist-100.md` is the older 1.0.0 step list; where it says the workflow publishes only pre-releases, this file replaces it.

## The rule

The workflow runs when any tag is pushed. The tag decides what is published:

| Tag | Published as | Where the tag may be | Example |
| --- | --- | --- | --- |
| plain `x.y.z` | a real release, marked latest | on `main` only | `1.0.1` |
| `x.y.z-<suffix>` | a pre-release | any branch | `1.0.2-beta.1` |
| anything else | refused | | `v1.0.1`, `1.0`, `1.0.1-`, `1.0.1+b2`, `01.0.1`, `1.0.1-01` |

In both cases the `x.y.z` part of the tag has to be the version in `package.json`, `manifest.json` and `versions.json` (and `versions.json` gives it the manifest's `minAppVersion`). The tag follows semver: no leading zeros in x, y, z or in a numeric part of the suffix (`1.0.1-0` is fine, `1.0.1-01` is not). The suffix after the hyphen is only a name for the test build: it is not written in any file. `node release-check.mjs <tag>` runs that check by hand, and tells you which kind the tag is.

Both kinds are built and tested the same way (`npm ci`, `npm run build`, `npm test`), and both attach `main.js`, `manifest.json` and `styles.css` with a build-provenance attestation.

## Why it is shaped this way

- **The directory sees only real releases.** It takes a plain `x.y.z` for the manifest and the tag. GitHub's "latest release" ignores releases marked pre-release, so a `-beta` tag does not become the latest and does not disturb the directory. (Confirmed: the GitHub rule. Not confirmed: that Obsidian's directory reads GitHub's "latest release" rather than something else; its pages (docs.obsidian.md, "Release your plugin with GitHub Actions" and "Submit your plugin") were fetched on 2026-11-03 and say only that the tag must match the manifest's version.)
- **The base version must equal the files**, even for a pre-release, because the three files are what the test build is built from and what BRAT installs. A pre-release of 1.0.2 is built from a branch where `npm version 1.0.2` has been run.
- **BRAT and the pre-release.** BRAT's developer guide (`github.com/TfTHacker/obsidian42-brat`, `BRAT-DEVELOPER-GUIDE.md`, fetched 2026-11-03) says: for latest-version tracking BRAT downloads "the latest available release or pre-release, prioritizing by semantic version number"; a frozen install downloads the exact version "regardless of whether it's marked as a pre-release"; if the release tag and `manifest.json` disagree, BRAT treats the tag as correct and overrides the manifest's version to match; and from BRAT v1.1.0 on it ignores a `manifest-beta.json` in the repository root. So this repository needs no `manifest-beta.json` and has none. By semver `1.0.2-beta.1` is below `1.0.2`, so a vault on the pre-release is offered the real `1.0.2` when it is published, and the next test build of the same version has to be `1.0.2-beta.2`, not a re-used tag.
- **A real release must be on main** (the same guard as before), so nothing reaches the directory that was not merged. A pre-release may be on any branch, so a branch can be tried in BRAT before it is merged. Anyone who can push a tag could already publish a release; the pre-release path adds no new permission.

## When to try a pre-release in BRAT first

Ben, 2026-11-06, on 1.1.1: *"merge 28 and tag 1.1.1 and write that rule into docs/release-flow.md yes."* The rule is set by what the release touches, because the test suite and a BRAT install see different things.

**What the suite sees.** The real desktop app on 1.14.5 and 1.11.7, the 61 checks of `e2e-tests/plugin-check.js`, the accessibility scripts, and before and after screenshots that can be compared byte for byte. For a change that only moves how something is drawn, that is stronger evidence than one install on one device.

**What it does not see.**
- **Phones.** Everything runs as desktop Obsidian under a virtual display, and phone mode is emulated (`docs/floor-0130.md`). Android has never been tried. Real touch, the on-screen keyboard and the real safe area are outside the suite.
- **A real vault.** The suite uses made-up vaults and the stock look, not a synced vault, community themes or snippets.
- **The install.** The release workflow builds, tests and attests the files, but only a BRAT install exercises "someone installs this release into a vault".

**Skip the BRAT round** when all of these hold: the change is a patch or a small minor, the whole suite passes (the known intermittent check 10 on 1.11.7 aside, see `docs/floor-0130.md`), before and after screenshots show no change or only a change that is explained, nothing touches layout on a phone, and no new Obsidian API is used. 1.1.1 (the `:has` selectors) is the example.

**Do the BRAT round first** (a pre-release, `x.y.z-beta.1`, below) when the release has any of these: a new look or theme, a new feature, a layout change that reaches a phone, media or audio, a new Obsidian API, a change to `minAppVersion`, or a change to the release workflow. 1.1.0 (the first themes) is the example.

**Review the rule.** After the first few releases that skip BRAT, check it. If one of them ships a phone or install problem that the suite could not see, put BRAT back for minor releases.

## Cut a pre-release for BRAT

On the branch you want to try (it need not be merged). Say the next real release will be 1.0.2:

1. `npm version 1.0.2` (writes `package.json`, the lockfile, `manifest.json` and `versions.json`; `.npmrc` stops npm from committing or tagging). Skip this if the branch already carries 1.0.2.
2. `npm run build`, then commit the changed files, including `test-vault/.obsidian/plugins/booklet/` (CI compares those copies against a fresh build).
3. `npm test`. Optionally `node release-check.mjs 1.0.2-beta.1`: it should print `release-check: 1.0.2-beta.1 is a pre-release of 1.0.2, the version everywhere`.
4. Tag and push the tag only (push the branch too if you want it on GitHub, but the tag is what publishes):
   ```
   git tag -a 1.0.2-beta.1 -m 1.0.2-beta.1
   git push origin 1.0.2-beta.1
   ```
5. Watch Actions, "Release". When it is green the release page shows `1.0.2-beta.1` marked Pre-release, with the three files.
6. In the vault: BRAT, add the beta plugin `benthepsychologist/booklet-obsidian` (or "check for updates" if it is already there). BRAT takes the highest semver among releases and pre-releases, so `1.0.2-beta.1` beats `1.0.1`. For another build of the same version, tag `1.0.2-beta.2` and update in BRAT.

## Cut the real release

1. On the branch that carries the change: `npm version 1.0.1` (plain `x.y.z`; `version-bump.mjs` refuses anything else), `npm run build`, commit including the test-vault copies, `npm test`, and the real-Obsidian suite (`e2e-tests/`) if the code changed since its last full run.
2. Merge to `main` by pull request with CI green.
3. Check, then tag `main` and push the tag:
   ```
   git checkout main && git pull --ff-only
   node release-check.mjs 1.0.1
   git tag -a 1.0.1 -m 1.0.1
   git push origin 1.0.1
   ```
   The tag is exactly `1.0.1`, with no leading `v`.
4. Watch Actions, "Release". It checks the tag, checks it is on `main`, builds, tests, attests and publishes a normal release (not marked pre-release, marked latest) with `main.js`, `manifest.json` and `styles.css`.
5. On the release page: the name and tag are `1.0.1`; it is not marked Pre-release; three assets; the attached `manifest.json` says `"version": "1.0.1"`; `gh attestation verify main.js --repo benthepsychologist/booklet-obsidian` passes on a downloaded `main.js`.

## What was not checked

- The workflow has not run on GitHub with these changes. The YAML parses and `release-check.mjs` is covered by `test/release-check.test.mjs` (plain, pre-release, mismatched, malformed tags, and the script run as the workflow runs it); the `if:` condition, the `kind` output hand-off and `gh release create ... --latest` / `--prerelease` are read, not run.
- What BRAT writes into the installed `manifest.json` for a pre-release was not tried: its guide says it takes the tag as the version.
- Whether Obsidian's directory submission accepts or ignores a repository that also has pre-releases was not checked (see above); real releases are what it reads.
