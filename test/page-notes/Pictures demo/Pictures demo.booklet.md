---
booklet: "0.16"
id: booklet-test/pictures-demo
title: Pictures demo
lang: en
---

<!-- A made-up note for trying pictures in the Booklet view. Everything here is invented. -->

> [!activity|forms] Picture forms

Each line below should show a small picture, not the text in square brackets.

A file in a subfolder: ![The harbour][harbour]

A file with a space in its name, written inside angle brackets: ![A boat][boat]

A file beside this note, collapsed form: ![dot][]

A file in a subfolder, shortcut form: ![wave]

An inline drawing in the note itself: <svg width="40" height="24" viewBox="0 0 40 24"><rect width="40" height="24" fill="#cfe3f3"/><circle cx="20" cy="12" r="8" fill="#e07b39"/></svg>

A file that is not there (expect a broken picture, drawn with its words): ![Gone][gone]

Obsidian's own forms work too: ![[dot.png]] and ![A boat](my%20boat.png)

> [!activity|links] Links and selection

A link to another note: [[Other note]]. Click it, or Ctrl/Cmd+click for a new pane, or hold Ctrl/Cmd over it for the preview.

Select this sentence with the mouse or by pressing and holding on a phone, then copy it.

> [!choice|mood] How is this going?
- [ ] Fine
- [ ] Not sure

> [!data] Data

[harbour]: images/shape.svg "A made-up shape"
[boat]: <my boat.png>
[dot]: dot.png
[wave]: images/wave.png
[gone]: nothere.png
