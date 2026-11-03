// The Obsidian plugin directory's linter (eslint-plugin-obsidianmd), with its recommended set, over src/.
// Run it with: npm run lint
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "node_modules/**", "test/**", "e2e/**", "test-vault/**", "*.mjs"] },
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
]);
