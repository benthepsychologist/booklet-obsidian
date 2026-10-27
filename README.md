# Booklet for Obsidian

An Obsidian plugin for [Booklet](https://github.com/benthepsychologist/booklet) notes: a Markdown note whose front matter says `booklet: "0.15"` opens in a view of its own, drawn with Obsidian's own elements and theme, and the answers given there are written into the note's records section at the end of the file, and nowhere else.

This first commit carries the plugin over from the spike that proved the approach (choice, scale and text questions). The README is completed as the features land.

```
npm install
npm run build    # type-checks, builds main.js, copies main.js, manifest.json and styles.css into test-vault/.obsidian/plugins/booklet/
npm test         # bundles src/core with esbuild, then runs node --test over test/*.test.mjs
```
