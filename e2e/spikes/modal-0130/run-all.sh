#!/bin/bash
# Runs measure.js for every build on both Obsidian versions, one Obsidian at a time (ports 9351..9359), results into <out>/.
#   PLAYWRIGHT=<node_modules path> bash run-all.sh <folder from build-variants.sh> <folder holding obsidian-1.14.5/ and obsidian-1.8.10/> <out>
set -u
PLUGINS=${1:?plugins folder}; APPS=${2:?apps folder}; OUT=${3:?out folder}
cd "$(dirname "$0")"
mkdir -p "$OUT"
port=9351
for v in 1.14.5 1.8.10; do
	OB="$APPS/obsidian-$v/obsidian"
	for b in hand modal modal-plain modal-regain; do
		only=""; [ "$b" = modal-plain ] && only="--only a11y,opening --no-phone"; [ "$b" = modal-regain ] && only="--only opening,open-on-note-open,blur-at-open --no-phone"
		echo "== $b $v"
		timeout 900 node measure.js --obsidian "$OB" --plugin "$PLUGINS/$b" --label "$b-$v" --out "$OUT" --port $port $only > "$OUT/$b-$v.log" 2>&1
		echo "rc=$?"
	done
	echo "== bare $v"
	timeout 900 node measure.js --obsidian "$OB" --bare --label "bare-$v" --out "$OUT" --port $port > "$OUT/bare-$v.log" 2>&1
	echo "rc=$?"
done
