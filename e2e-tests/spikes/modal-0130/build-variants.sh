#!/bin/bash
# Builds the plugin three ways into <out>/{hand,modal,modal-plain,modal-regain}/ (main.js, manifest.json, styles.css) and leaves the worktree as it was.
#   hand         the shipped, hand-built card (src/allow-card.ts as committed)
#   modal        e2e-tests/spikes/modal-0130/allow-card.modal.ts: Obsidian's Modal, the card's role/aria attributes added by hand, no focus timers
#   modal-plain  the same with the role/aria attributes left out: what the Modal exposes by itself
#   modal-regain the same as `modal` with the hand-built card's focus-regain timers kept
# Run from the worktree root: bash e2e-tests/spikes/modal-0130/build-variants.sh <out folder>
set -e
OUT=${1:?need an output folder}
SPIKE=e2e-tests/spikes/modal-0130
restore() { git checkout -- src/allow-card.ts src/view.ts test-vault; }
trap restore EXIT
build() {   # name, ADD_ARIA, ADD_REGAIN
	mkdir -p "$OUT/$1"
	if [ "$1" != hand ]; then
		sed -e "s/^const ADD_ARIA = .*/const ADD_ARIA = $2;/" -e "s/^const ADD_REGAIN = .*/const ADD_REGAIN = $3;/" $SPIKE/allow-card.modal.ts > src/allow-card.ts
		git apply $SPIKE/view-app.patch
	fi
	npm run build >/dev/null
	cp main.js manifest.json styles.css "$OUT/$1/"
	restore
}
build hand false false
build modal true false
build modal-plain false false
build modal-regain true true
echo built into "$OUT"
