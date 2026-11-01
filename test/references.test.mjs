import test from 'node:test';
import assert from 'node:assert/strict';
import {core} from './helpers.mjs';
const text = `---
booklet: "0.16"
title: Example
---

> [!module|one] One

> [!activity|a] A

![First][pic]

[pic]: one.png

> [!module|one end]

> [!module|two] Two

> [!activity|b] B

![Second][pic]

[pic]: two.png

> [!module|two end]

> [!data|one] One data

[pic]: one-data.png

> [!data] Shared

[pic]: shared.png
`;
test('references isolate modules and order module fence, named data, shared', () => {
 const book=core.parseBooklet(text);
 assert.equal(core.referenceContext(book.references,'one'), '[pic]: one.png\n[pic]: one-data.png\n[pic]: shared.png');
 assert.equal(core.referenceContext(book.references,'two'), '[pic]: two.png\n[pic]: shared.png');
 assert.equal(core.referenceContext(book.references,null), '[pic]: shared.png');
 assert.equal(JSON.stringify(book.activities).includes('[pic]: one.png'),false);
});
test('definitions reflect changed source and retain multi-line titles',()=>{
 const source=text.replace('[pic]: one.png','[pic]: <one image.png>\n  "Title"');
 const book=core.parseBooklet(source);
 assert.ok(core.referenceContext(book.references,'one').includes('[pic]: <one image.png>\n  "Title"'));
 assert.ok(!core.referenceContext(core.parseBooklet(text).references,'one').includes('one image.png'));
});
test('bare activity definitions are isolated from named modules; shared definitions remain visible',()=>{
 const source=`---\nbooklet: "0.16"\n---\n\n> [!activity|bare] Bare\n\n![bare][pic]\n\n[pic]: bare.png\n\n> [!module|named] Named\n\n> [!activity|a] A\n\n![named][pic]\n\n[pic]: named.png\n\n> [!module|named end]\n\n> [!data] Shared\n\n[shared]: shared.png\n`;
 const book=core.parseBooklet(source);
 assert.equal(core.referenceContext(book.references,''),'[pic]: bare.png\n[shared]: shared.png');
 assert.equal(core.referenceContext(book.references,'named'),'[pic]: named.png\n[shared]: shared.png');
 assert.equal(core.referenceContext(book.references,null),'[shared]: shared.png');
});

const head = '---\nbooklet: "0.16"\ntitle: Example\n---\n\n';
const closeOne = '> [!module|one end]\n\n> [!data] Data\n\n[pic]: shared.png\n';
/** A note with one module and one activity whose prose is `body`, then a shared data section. */
const inOne = (body) => head + `> [!module|one] One\n\n> [!activity|a] A\n\nOutside ![x][pic]\n\n${body}\n\n` + closeOne;
const proseOf = (book) => JSON.stringify(book.activities);
test('a definition in a group or a reading callout belongs to its module; the other words stay', () => {
 for (const [body, defined, kept] of [
  ['> [!group] Group\n> ![x][pic]\n>\n> [pic]: group.png\n>   "Group title"', '[pic]: group.png\n  "Group title"', 'x'],
  ['> [!tip] Tip\n> Before\n>\n> [pic]: callout.png\n>   "Title"\n>\n> After', '[pic]: callout.png\n  "Title"', 'After'],
 ]) {
  const book = core.parseBooklet(inOne(body));
  assert.equal(core.referenceContext(book.references, 'one'), defined + '\n[pic]: shared.png');
  assert.ok(proseOf(book).includes(kept));
  assert.ok(!proseOf(book).includes('[pic]: '));
 }
});

test('structure lines inside a comment stay live, as at 0.9.0; a definition inside one is no definition', () => {
 // 0.9.0 read no comments at all: a module or activity line is a line wherever it stands, and the plugin keeps that
 for (const [open, close] of [['%%', '%%'], ['<!--', '-->']]) {
  const book = core.parseBooklet(head + `${open}\n\n> [!activity|x] Hidden?\n\n${close}\n\n> [!activity|a] A\n\nWords.\n`);
  assert.deepEqual(book.activities.map(a => a.id), ['x', 'a']);
 }
 const wrapped = core.parseBooklet(head + '<!--\n\n> [!module|fake] Fake\n\n> [!module|fake end]\n\n-->\n\n> [!activity|a] A\n\nWords.\n');
 assert.deepEqual(wrapped.modules.map(m => m.id), ['fake']);
 const inline = core.parseBooklet(head + '> [!module|one] One <!-- note -->\n\n> [!activity|a] A\n\nHello\n\n[pic]: one.png\n\n> [!module|one end]\n');
 assert.deepEqual(inline.modules.map(m => m.id), ['one']);
 assert.equal(core.referenceContext(inline.references, 'one'), '[pic]: one.png');
 for (const [open, close] of [['%%', '%%'], ['<!--', '-->']]) {
  const book = core.parseBooklet(inOne(`${open}\n[pic]: hidden.png\n${close}`));
  assert.equal(core.referenceContext(book.references, 'one'), '[pic]: shared.png');
  assert.ok(proseOf(book).includes('[pic]: hidden.png'));
 }
});

test('a comment mark in code does not start a comment, so no later line is lost', () => {
 const spots = [
  'Write `<!--` to start a comment.',
  'Write ``a ` <!-- b`` to start a comment.',
  'Write `%%` to start a comment.',
  '    <!-- code',
  '> [!tip] How\n> ```html\n> <!-- x\n> ```',
  '- item\n  ```html\n  <!-- x\n  ```',
  '```html\n<!-- x\n```',
 ];
 for (const spot of spots) {
  const book = core.parseBooklet(`${head}> [!module|one] One\n\n> [!activity|a] A\n\n${spot}\n\n> [!module|one end]\n\n> [!module|two] Two\n\n> [!activity|b] B\n\nHi\n\n> [!module|two end]\n\n> [!data|two] Data\n\n[pic]: two.png\n`);
  assert.equal(book.ok, true, spot);
  assert.deepEqual(book.modules.map(m => m.id), ['one', 'two'], spot);
  assert.equal(core.referenceContext(book.references, 'two'), '[pic]: two.png', spot);
 }
});

test('a definition-looking line in a quoted or listed code fence stays in the words', () => {
 for (const body of ['> [!tip] How\n> ```md\n> [pic]: images/a.png\n> ```\n> after', '> [!tip] How\n>\n> ```md\n> [pic]: images/a.png\n> ```', '- item\n  ```md\n  [pic]: images/a.png\n  ```']) {
  const book = core.parseBooklet(inOne(body));
  assert.equal(core.referenceContext(book.references, 'one'), '[pic]: shared.png', body);
  assert.ok(proseOf(book).includes('images/a.png'), body);
 }
});

test('a definition after code, an unclosed fence in a quote or a lone %% in a line is still a definition', () => {
 for (const body of [
  '> [!tip] T\n> ```md\n> code\n> ```\n>\n> [pic]: images/a.png',
  'Half of it is 50%% done.\n\n[pic]: images/a.png\n\n%%\nnote\n%%',
  '`<!--` and `%%`\n\n[pic]: images/a.png',
 ]) {
  const book = core.parseBooklet(inOne(body));
  assert.ok(core.referenceContext(book.references, 'one').includes('[pic]: images/a.png'), body);
 }
 // a fence left open in a quote ends where the quote does, so the data section after it is read
 const open = core.parseBooklet(inOne('> [!tip] T\n> ```md\n> code'));
 assert.equal(core.referenceContext(open.references, 'one'), '[pic]: shared.png');
});

test('a definition cannot interrupt a paragraph, and a label of white space is no label', () => {
 for (const body of ['Some words\n[pic]: images/a.png', '> quote\n> [pic]: images/a.png', '- item\n[pic]: images/a.png', '[ ]: images/a.png', '[\t ]: images/a.png']) {
  const book = core.parseBooklet(inOne(body));
  assert.equal(core.referenceContext(book.references, 'one'), '[pic]: shared.png', body);
  assert.ok(proseOf(book).includes('images/a.png'), body);
 }
 // after a blank line, a heading, a callout line, a fence, another definition or at the start of a block, it is one
 for (const body of ['Some words\n\n[pic]: images/a.png', '# Head\n[pic]: images/a.png', '[other]: images/b.png\n[pic]: images/a.png', '```\ncode\n```\n[pic]: images/a.png', '[other]: images/b.png\n  "Title"\n[pic]: images/a.png']) {
  const book = core.parseBooklet(inOne(body));
  assert.ok(core.referenceContext(book.references, 'one').includes('[pic]: images/a.png'), body);
 }
});

test('a definition goes to the data section\'s module, the opening, or no one', () => {
 const note = head + 'Opening ![o][pic]\n\n[pic]: opening.png\n\n> [!module|one] One\n\n> [!activity|a] A\n\nWords\n\n> [!module|one end]\n\n[pic]: between.png\n\n> [!data|ghost] G\n\n[pic]: ghost.png\n\n> [!data|one] One\n\n[pic]: one.png\n';
 const book = core.parseBooklet(note);
 // the opening's definition is the home screen's alone; a data section for a module the file does not open, and text between
 // modules, give theirs to no one (a reference is never looked up in another module's section, and only the plain data section is shared)
 assert.equal(core.referenceContext(book.references, null), '[pic]: opening.png');
 assert.equal(core.referenceContext(book.references, 'one'), '[pic]: one.png');
 assert.ok(!book.references.some(r => /ghost|between/.test(r.text)));
});
