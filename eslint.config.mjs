// The Obsidian plugin directory's linter (eslint-plugin-obsidianmd), with its recommended set, over the repository root:
// src/ (the code), manifest.json (validate-manifest: required keys, the description's form, no forbidden words), package.json
// (banned dependencies) and LICENSE (validate-license). Run it with: npm run lint
// The directory's bot runs a stricter set than `recommended`: `prefer-active-doc` is off in `recommended` and on here.
// Not linted: the tests, the e2e scripts and the build scripts (*.mjs), which are not plugin code and are not in the tsconfig.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

// validate-license reads a file as a list of Line tokens (a text file has no JavaScript in it): this reads LICENSE that way.
const plainText = {
	meta: { name: "plain-text" },
	parse(text) {
		const tokens = [];
		let offset = 0;
		text.split("\n").forEach((line, i) => {
			tokens.push({
				type: "Line",
				value: line,
				range: [offset, offset + line.length],
				loc: { start: { line: i + 1, column: 0 }, end: { line: i + 1, column: line.length } },
			});
			offset += line.length + 1;
		});
		return {
			type: "Program",
			body: [],
			comments: [],
			tokens,
			sourceType: "script",
			range: [0, text.length],
			loc: { start: { line: 1, column: 0 }, end: { line: Math.max(tokens.length, 1), column: 0 } },
		};
	},
};

export default defineConfig([
	{ ignores: ["main.js", "node_modules/**", "test/**", "e2e-tests/**", "test-vault/**", "*.mjs"] },
	...obsidianmd.configs.recommended,
	{
		rules: { "obsidianmd/prefer-active-doc": "warn" },
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*", "manifest.json"],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: [".json"],
			},
		},
	},
	{
		// ESLint only reads a file some block names; the recommended set names no manifest.json, so it is named here (read as
		// JSON by the TypeScript parser, which is how validate-manifest wants it: one object).
		files: ["manifest.json"],
		plugins: { obsidianmd },
		languageOptions: { parser: tseslint.parser },
		rules: { "obsidianmd/validate-manifest": "warn" },
	},
	{
		files: ["LICENSE"],
		plugins: { obsidianmd },
		languageOptions: { parser: plainText },
		rules: { "obsidianmd/validate-license": "warn" },
	},
]);
