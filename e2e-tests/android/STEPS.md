# Running Booklet on Android, in an emulator on your Mac

This runs the real Obsidian Android app (version 1.15.0 by default, and the plugin's minimum version in a second run) inside an Android emulator on your Mac, puts Booklet and a small made-up vault into it, runs seven checks and one observation, and writes a report with screenshots. You type one command, then the same command again for the minimum version. Everything is made-up content.

It was written on a Linux server that cannot run an emulator, so **the emulator part has never been run by anyone**. Your first run is the real test. If it stops with an error, send the result folder anyway (see section 5): the error names the step that failed and where the screenshot is.

Commands marked **(not verified)** could not be tried where this was written. Commands marked **(verified)** were checked as described in section 7.

## 1. One-time setup on the Mac

You need about 4 GB of free disk and 15 to 30 minutes, mostly downloads. The Mac is Apple silicon (arm64); the emulator uses Apple's Hypervisor framework, which needs nothing installed.

**1a. Node 22.23.4 or newer** (24.22.1 or newer also works). Check with `node --version`. If it is older or missing: `brew install node@22` **(not verified)** and, because that package is "keg-only" (not put on your PATH by itself), `echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc` and open a new Terminal window **(not verified)**; or install Node from nodejs.org.

**1b. Java 17 or newer.** Check with `java -version`. If it says no Java runtime: `brew install --cask temurin@17` **(not verified)**, then open a new Terminal window and check again.

**1c. Android command-line tools.** These commands follow Google's documented folder layout **(not verified: run on a Mac for the first time)**. The zip file and its name exist on Google's server **(verified)**.

```sh
mkdir -p ~/Library/Android/sdk/cmdline-tools
cd ~/Library/Android/sdk/cmdline-tools
curl -LO https://dl.google.com/android/repository/commandlinetools-mac_arm64-16111833_latest.zip
unzip commandlinetools-mac_arm64-16111833_latest.zip
mv cmdline-tools latest
rm commandlinetools-mac_arm64-16111833_latest.zip
```

If Google has since replaced that file, get the current "Command line tools only" Mac (Apple silicon) zip from developer.android.com/studio and unpack it the same way, so that `~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager` exists. If you already have Android Studio, you already have an SDK at `~/Library/Android/sdk`; install "Android SDK Command-line Tools (latest)" from Studio's SDK Manager and skip the commands above.

**1d. Tell Terminal where the SDK is.** Add these two lines to `~/.zshrc`, then open a new Terminal window **(not verified)**:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

**1e. Install the Android pieces and accept the licences.** The package names exist in Google's package index **(verified)**; the commands themselves are **(not verified)**. The big one is the phone's system image, about 1.9 GB.

`sdkmanager --licenses` is interactive: it shows each licence and waits; type `y` and press Return at every prompt.

```sh
sdkmanager --licenses
sdkmanager "platform-tools" "emulator" "build-tools;36.0.0" "platforms;android-36" "system-images;android-36;google_apis;arm64-v8a"
```

Why that system image: Android 16 (API 36), Google APIs (no Play Store), arm64. It is the same Android version and image flavour that the test tool's own sample project uses in its automated tests (those use the x86_64 build on Linux; on your Apple-silicon Mac the arm64 build is the one that runs at full speed). Use `--api` to try another level.

**1f. The plugin repository.** In the `booklet-obsidian` folder:

```sh
npm ci
npm run build
npm run e2e:android:setup
```

The last command installs the test tool (Appium and the community tool `wdio-obsidian-service`) into `e2e-tests/android/`, kept apart from the plugin's own packages. It takes about a minute **(verified on Linux)**.

**1g. Check the setup.** This starts nothing and tells you what is still missing:

```sh
npm run e2e:android -- --check
```

## 2. The command

```sh
npm run e2e:android
```

The same thing: `node e2e-tests/android/run.mjs`. It tests the Booklet build in the repository folder (the `main.js`, `manifest.json` and `styles.css` that `npm run build` made). Useful variations:

| To do this | Add |
| - | - |
| The plugin's minimum version (second run) | `-- --obsidian min` |
| 1.15.0, then the minimum, in one go | `-- --obsidian both` |
| Another Obsidian version | `-- --obsidian 1.14.4` |
| Test a published release | `-- --release 1.0.1` |
| Test a build in another folder | `-- --plugin-dir /path/to/folder` |
| See what it would do, change nothing | `-- --dry-run` |
| Slow Mac, waits time out | `-- --timeout-scale 2` |
| No emulator window | `-- --headless` |
| Silence the emulator | `-- --mute` (audio may then not play) |
| Skip the lock observation | `-- --skip-lock` |
| Run one check | `-- --only now-playing` |

**Do two runs.** The first (no flags) tests the app at 1.15.0, the latest Android release. The second tests the app at the plugin's `minAppVersion` from its `manifest.json` (1.11.7 today): `npm run e2e:android -- --obsidian min`. Its Android APK exists: the test tool's version list names it and `Obsidian-1.11.7.apk` (15.5 MB) is on Obsidian's releases page **(verified)**. Both runs use the same phone (`booklet-android`); the second reinstalls Obsidian at the older version first, which removes the app's data, so it starts clean. `-- --obsidian both` does the two runs in one command with one emulator boot, into two result folders, and exits non-zero if either has a FAIL. Plain two commands are the more careful way: each can be sent back on its own.

Put `--` once after `npm run e2e:android`, then any flags. `node e2e-tests/android/run.mjs --help` lists everything.

**Two warnings about `--reuse-emulator`** (use it only to run on an emulator you started yourself): the script changes global settings on that emulator (animations off, screen stays on, 30-minute screen timeout), and the test tool removes Obsidian, with its data, and installs the requested version if the installed one is different. Without the flag the script refuses to touch an emulator that is already running on its port.

You do not need to touch the emulator while it runs. During the audio checks it plays a quiet tone through the Mac's speakers for a minute or so in all; `--mute` stops that.

## 3. What it does, and how long it takes

My estimate, never timed on a Mac: **the first run 20 to 40 minutes** (it downloads the Obsidian app, 14.5 MB, and a matching ChromeDriver, creates the phone, and cold-boots it, which can take several minutes). **Later runs 10 to 15 minutes.** The script prints `[ 123s] ...` progress lines and a "Step n/6" heading, and every wait has a time limit, so it never hangs without saying where.

1. Gets the plugin build, builds a vault from the repository's `test-vault` plus two made-up notes and a two-minute quiet tone, and downloads the Obsidian Android app from `github.com/obsidianmd/obsidian-releases` (kept in `e2e-tests/android/.cache/`, never committed).
2. Creates the phone (an "Android Virtual Device" named `booklet-android`, Pixel profile) if it does not exist, and starts it.
3. Starts Appium and the test tool, which installs the app, the vault and Booklet and opens the vault.
4. Runs the checks below.
5. Forces the phone idle and locks it, and writes down what happened (observation only).
6. Writes the result, stops the emulator and Appium, and zips the result folder.

## 4. What it checks

Each check is PASS or FAIL with a screenshot. LIMIT means the emulator could not do what the check needs (not a fault in Booklet). OBSERVED is written down and never graded.

| Check | What it does |
| - | - |
| plugin-loads | Booklet is loaded and enabled; switches off and on again |
| booklet-view | The test-vault Check-in note opens in the Booklet view |
| pages-menu | A made-up wiki shows its Pages button; the menu opens; no sideways scroll |
| allow-card | The Allow list button opens the card; Close closes it |
| now-playing | A tone plays; the now-playing bar stays through Next and Back |
| answers-kept | Typed answer is still there after force-stop and reopen |
| page-kept | The open page is still open after force-stop and reopen |
| lock-observation | Forced idle and lock with the bar present; what it did |

Notes on the two awkward ones:

- **now-playing** presses Play on the tone like a finger would. If the web view refuses to start audio, or the emulator has no sound device (for example you used `--mute`), the check says LIMIT and why. Try once without `--mute` before accepting a LIMIT.
- **answers-kept and page-kept** share one procedure: type an answer, press Next, wait until the note's file and Obsidian's saved layout show it (it records how long that took), run `adb shell am force-stop md.obsidian`, start Obsidian again, and read what is there. Reading the app again after a restart is the least certain part of the script **(not verified)**: if the first Appium session cannot switch back, the script starts a second one and says so in the notes.

## 5. What comes out, and how to send it back

The script prints the folder at the end. It is `e2e-tests/android/results/<date>T<time>Z-obsidian-<version>/` (one per version run) and holds:

- `results.md`, the report: verdict, what was run (Booklet version and file hashes, Obsidian version, phone), one section per check with its screenshots, and the limits.
- `results.json`, the same in machine-readable form.
- `screenshots/`, whole-phone pictures numbered in order, including one at every failure.
- `run.log`, `appium.log`, `emulator.log`, for working out what went wrong.

It also makes `<that folder>.zip` next to it (with `zip`, or `ditto` on a Mac). **Send the zip back** (both zips, after two runs). The results contain only made-up content and nothing about you; `run.log` contains your Mac's user name in folder paths.

If the run stops early, the report still gets written, with a check called `setup` that says which step failed.

## 6. Cleaning up

```sh
adb -s emulator-5554 emu kill                 # only if an emulator is still running
avdmanager delete avd -n booklet-android      # the phone
rm -rf e2e-tests/android/.cache e2e-tests/android/results e2e-tests/android/node_modules
sdkmanager --uninstall "system-images;android-36;google_apis;arm64-v8a"   # optional, frees 1.9 GB
```

Nothing else was changed on the Mac: the script only writes inside `e2e-tests/android/` and the Android folders (`~/.android`, the SDK). The script does not touch any other emulator you may have.

Leftovers inside the phone: the test tool, run as a plain script, does not delete the copy of the vault it puts in Obsidian's storage on the phone (a folder ending `-wdio-copy`), and a run that is stopped leaves the app installed. Deleting the AVD (the `avdmanager delete` line above) removes all of that. On the Mac, the tool's temporary copy of the vault is put in `e2e-tests/android/.cache/tmp/` and the script removes it at the end of each run; if a run is killed hard (not Ctrl-C), that folder may stay and can be deleted by hand.

## 7. The honest limits

- **Each run tests one app version.** A run on 1.15.0 says nothing about the plugin's minimum supported Obsidian, 1.11.7; that is what the second run (`--obsidian min`) is for. The Obsidian version is in each report's "Obsidian app" line. Whether the test tool's own helper works with an app as old as 1.11.7 is not verified (the tool's source says it supports from 1.0.3; nobody has run it). If Obsidian published no APK for a patch release, the script tests the earlier APK the version list points to and says so in the report (for example, 1.14.5 uses the 1.14.4 APK).
- **No emulator answers real lock or background audio.** Forced idle (Doze) and a screen-off key press are not what a phone maker's battery manager, a real lock screen, Bluetooth or a phone call do. The observation is for the report; your real phone is the judge.
- **iOS is not covered.** Nothing here runs Obsidian on an iPhone.
- It is one Android version on one screen size, with touch sent by the test tool, not by a finger.
- The two-minute tone and the tap timings assume a normal speed; a very slow Mac can make the bar check fail by running out of tone. Use `--timeout-scale` and say so when you send the result.

**What was and was not checked where this was written (a Linux server with no virtualization):**

| Thing | State |
| - | - |
| The test tool supports Android | Read in its README and source (verified) |
| Obsidian-1.15.0.apk exists, 14.5 MB | Downloaded here (verified) |
| Obsidian-1.11.7.apk exists, 15.5 MB | Address answers 200 here (verified) |
| The APK holds arm64-v8a libraries | Listed here (verified) |
| The system image id exists for arm64 | In Google's index (verified) |
| Appium starts, finds its Android driver | Run here (verified) |
| The tool builds the session request | Run here, stopped at the device |
| The helpers and checks' Node logic | 62 unit tests pass (verified) |
| Emulator boot, install, every check | Never run (not verified) |
| The idle-and-lock commands | Never run (not verified) |
| Where Obsidian keeps its phone layout | `workspace-mobile.json` per review; not seen |
| The code that runs inside Obsidian | Never run (not verified) |
| Brew and sdkmanager commands above | Never run (not verified) |
| Timings in section 3 | Estimates |

If something is wrong, send the zip (it has `results.md` in it) and the script gets fixed. A fault found in Booklet itself is a separate decision for you: fix it before submitting, or list it as a known quirk.
