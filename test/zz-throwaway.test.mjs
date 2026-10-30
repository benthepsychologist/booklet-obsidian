import { test } from "node:test";
import assert from "node:assert/strict";

test("throwaway: a deliberately failing test", () => {
	assert.equal(1, 2);
});
