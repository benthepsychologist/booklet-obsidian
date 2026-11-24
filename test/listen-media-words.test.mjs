/*
 * `mediaWords` (core/listen.ts): a listen's media said as plain words, its name and its address, for a drawing that must load nothing
 * (the Design view's canvas draws a listen with it, design-stage5-listen.test.mjs).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { core } from "./helpers.mjs";

test("a listen's media is said as its name, and as its address when it has one, in plain words that load nothing", () => {
	const said = (m) => core.mediaWords(m);
	assert.equal(said("![[ep1.mp3]]"), "ep1.mp3", "a local embed: the file's name");
	assert.equal(said("![[Audio/ep1.mp3|300]]"), "Audio/ep1.mp3", "a size or an alias is not part of the name");
	assert.equal(said("![Second episode](https://media.example.org/e2.m4a)"), "Second episode (https://media.example.org/e2.m4a)", "a remote embed: its words and its address");
	assert.equal(said('![](https://media.example.org/e2.m4a "A title")'), "https://media.example.org/e2.m4a", "no words: the address alone, without the title");
	assert.equal(said("![Local](Audio/ep1.mp3)"), "Local (Audio/ep1.mp3)");
	assert.equal(said("[Watch the lecture](https://video.example.org/watch/overview)"), "Watch the lecture (https://video.example.org/watch/overview)", "a link");
	assert.equal(said("<https://video.example.org/watch/overview>"), "https://video.example.org/watch/overview", "an autolink");
	assert.equal(said("https://video.example.org/watch/overview"), "https://video.example.org/watch/overview", "a bare address");
	assert.equal(said("![Words][ref]"), "Words", "a reference form: its words only (the definition is elsewhere, and nothing is looked up)");
	assert.equal(said("![ref]"), "ref");
	assert.equal(said("[Words][ref]"), "Words");
});
