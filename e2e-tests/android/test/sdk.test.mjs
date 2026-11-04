import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { EventEmitter } from "node:events";
import { sdkCandidates, waitForBoot, findSdk, sdkTool, javaInfo, nodeOk, versionAtLeast, preflight, patchAvdConfig, AVD_SETTINGS, emulatorArgs } from "../lib/sdk.mjs";

const has = (...paths) => (p) => paths.includes(p);

test("sdkCandidates: flag first, then the environment, then the usual Mac places", () => {
	const c = sdkCandidates({ sdk: "/a", env: { ANDROID_HOME: "/b", ANDROID_SDK_ROOT: "/c" }, home: "/Users/ben" });
	assert.deepEqual(c.slice(0, 3), ["/a", "/b", "/c"]);
	assert.ok(c.includes("/Users/ben/Library/Android/sdk"));
	assert.ok(c.includes("/opt/homebrew/share/android-commandlinetools"));
});

test("findSdk takes the first candidate that has SDK folders", () => {
	const env = { ANDROID_HOME: "/b" };
	assert.equal(findSdk({ env, home: "/h" }, has("/b/platform-tools")), "/b");
	assert.equal(findSdk({ env: {}, home: "/h" }, has("/h/Library/Android/sdk/cmdline-tools")), "/h/Library/Android/sdk");
	assert.equal(findSdk({ env: {}, home: "/h" }, () => false), null);
});

test("sdkTool: adb and emulator are fixed places; avdmanager is under cmdline-tools/latest or a version folder", () => {
	assert.equal(sdkTool("/s", "adb", has("/s/platform-tools/adb")), "/s/platform-tools/adb");
	assert.equal(sdkTool("/s", "emulator", () => false), null);
	assert.equal(sdkTool("/s", "avdmanager", has("/s/cmdline-tools/latest/bin/avdmanager")), "/s/cmdline-tools/latest/bin/avdmanager");
	assert.equal(sdkTool("/s", "sdkmanager", has("/s/cmdline-tools/12.0/bin/sdkmanager"), () => ["11.0", "12.0"]), "/s/cmdline-tools/12.0/bin/sdkmanager");
	assert.equal(sdkTool("/s", "sdkmanager", () => false, () => { throw new Error("nope"); }), null);
});

test("javaInfo reads the major version, old and new styles", () => {
	const j = (text) => javaInfo(() => ({ status: 0, stderr: text, stdout: "" }));
	assert.equal(j('openjdk version "17.0.9" 2023-10-17').version, 17);
	assert.equal(j('openjdk version "21" 2023-09-19').ok, true);
	assert.equal(j('java version "1.8.0_391"').version, 8);
	assert.equal(j('java version "1.8.0_391"').ok, false);
	assert.equal(javaInfo(() => ({ error: new Error("ENOENT"), status: null })).ok, false);
	assert.equal(j("garbage").ok, false);
});

test("versions", () => {
	assert.equal(versionAtLeast("22.23.4", "22.23.4"), true);
	assert.equal(versionAtLeast("22.23.2", "22.23.4"), false);
	assert.equal(versionAtLeast("v24.1.0", "22.23.4"), true);
	assert.equal(nodeOk("22.23.4"), true);
	assert.equal(nodeOk("22.23.2"), false);
	assert.equal(nodeOk("24.22.1"), true);
	assert.equal(nodeOk("23.0.0"), false);
	assert.equal(nodeOk("20.20.2"), true);
});

test("preflight lists each missing thing with a fix; Node 22.23.2 warns but does not block", () => {
	const image = "system-images;android-36;google_apis;arm64-v8a";
	const good = preflight({ sdk: "/s", image, node: "22.23.4", java: { ok: true, text: "Java 17" }, exists: () => true, toolFinder: (s, n) => `${s}/${n}` });
	assert.ok(good.every((p) => p.ok));
	const old = preflight({ sdk: "/s", image, node: "22.23.2", java: { ok: true, text: "Java 17" }, exists: () => true, toolFinder: (s, n) => `${s}/${n}` });
	assert.ok(old.every((p) => p.ok));
	assert.match(old[0].what, /should still work/);
	const bad = preflight({ sdk: "/s", image, node: "18.0.0", java: { ok: false, text: "java was not found on the PATH" }, exists: () => false, toolFinder: () => null });
	const fixes = bad.filter((p) => !p.ok).map((p) => p.fix);
	assert.ok(fixes.some((f) => /Node 22/.test(f)));
	assert.ok(fixes.some((f) => /sdkmanager "platform-tools"/.test(f)));
	assert.ok(fixes.some((f) => f === `sdkmanager "${image}"`));
	assert.ok(fixes.some((f) => f === 'sdkmanager "build-tools;36.0.0"'));
	assert.equal(preflight({ sdk: null, image, node: "22.23.4", java: { ok: true, text: "x" } }).filter((p) => !p.ok).length, 1);
});

test("patchAvdConfig replaces keys, keeps other lines, appends the absent ones", () => {
	const text = "avd.ini.displayname=Pixel\nhw.ramSize=2048\nhw.keyboard=no\nimage.sysdir.1=system-images/x/\n";
	const out = patchAvdConfig(text, AVD_SETTINGS);
	assert.match(out, /^avd\.ini\.displayname=Pixel$/m);
	assert.match(out, /^hw\.ramSize=3072$/m);
	assert.match(out, /^hw\.keyboard=yes$/m);
	assert.match(out, /^image\.sysdir\.1=system-images\/x\/$/m);
	assert.match(out, /^disk\.dataPartition\.size=6G$/m);
	assert.equal((out.match(/hw\.ramSize/g) || []).length, 1);
	assert.ok(out.endsWith("\n") && !out.endsWith("\n\n"));
	assert.equal(patchAvdConfig(out, AVD_SETTINGS), out, "patching twice changes nothing");
});

test("emulatorArgs", () => {
	assert.deepEqual(emulatorArgs({ avd: "a", port: 5554 }), ["-avd", "a", "-port", "5554", "-no-snapshot", "-no-boot-anim", "-gpu", "auto"]);
	const h = emulatorArgs({ avd: "a", port: 5556, headless: true, mute: true });
	assert.ok(h.includes("-no-window") && h.includes("-no-audio") && h.includes("5556"));
});

test("waitForBoot stops at once, with the real message, when the emulator process has died", async () => {
	const child = Object.assign(new EventEmitter(), { exitCode: 1 }); // already exited when we start looking
	const adb = { env: process.env, shell: async () => "" };
	const t0 = Date.now();
	await assert.rejects(waitForBoot(adb, process.execPath, { emuChild: child }), (e) => /exited early \(code 1\); see emulator.log/.test(e.message) && !/not done within/.test(e.message));
	assert.ok(Date.now() - t0 < 5000, "did not wait out the 7-minute limit");
});

test("waitForBoot also stops when the exit event arrives while waiting", async () => {
	const child = Object.assign(new EventEmitter(), { exitCode: null });
	let calls = 0;
	const adb = { env: process.env, shell: async () => { if (++calls === 1) child.emit("exit", 9, null); return ""; } };
	await assert.rejects(waitForBoot(adb, process.execPath, { emuChild: child, scale: 0.01 }), /exited early \(code 9/);
});
