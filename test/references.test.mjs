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
test('comments and fenced code cannot introduce module boundaries or definitions',()=>{
 const source=`---\nbooklet: "0.16"\n---\n\n%%\n\n> [!module|fake] Fake\n\n[pic]: fake.png\n\n%%\n\n\`\`\`\n[pic]: code.png\n\`\`\`\n\n> [!data] Data\n\n[pic]: good.png\n`;
 const book=core.parseBooklet(source);
 assert.equal(book.modules.length,0);
 assert.equal(core.referenceContext(book.references,null),'[pic]: good.png');
});
test('definitions reflect changed source and retain multi-line titles',()=>{
 const source=text.replace('[pic]: one.png','[pic]: <one image.png>\n  "Title"');
 const book=core.parseBooklet(source);
 assert.ok(core.referenceContext(book.references,'one').includes('[pic]: <one image.png>\n  "Title"'));
 assert.ok(!core.referenceContext(core.parseBooklet(text).references,'one').includes('one image.png'));
});
test('inline comments on structure lines preserve the module and comments hide fake structure',()=>{
 const source=`---\nbooklet: "0.16"\n---\n\n> [!module|one] One <!-- note -->\n\n> [!activity|a] A\n\nHello\n\n%%\n\n> [!module|fake] Fake\n\n%%\n\n[pic]: one.png\n\n> [!module|one end]\n`;
 const book=core.parseBooklet(source);
 assert.deepEqual(book.modules.map(m=>m.id),['one']);
 assert.equal(core.referenceContext(book.references,'one'),'[pic]: one.png');
});
test('bare activity definitions are isolated from named modules; shared definitions remain visible',()=>{
 const source=`---\nbooklet: "0.16"\n---\n\n> [!activity|bare] Bare\n\n![bare][pic]\n\n[pic]: bare.png\n\n> [!module|named] Named\n\n> [!activity|a] A\n\n![named][pic]\n\n[pic]: named.png\n\n> [!module|named end]\n\n> [!data] Shared\n\n[shared]: shared.png\n`;
 const book=core.parseBooklet(source);
 assert.equal(core.referenceContext(book.references,''),'[pic]: bare.png\n[shared]: shared.png');
 assert.equal(core.referenceContext(book.references,'named'),'[pic]: named.png\n[shared]: shared.png');
 assert.equal(core.referenceContext(book.references,null),'[shared]: shared.png');
});
test('a definition inside a group belongs to its module and is available to other prose',()=>{
 const source=`---\nbooklet: "0.16"\n---\n\n> [!module|one] One\n\n> [!activity|a] A\n\nOutside ![x][pic]\n\n> [!group] Group\n> ![x][pic]\n>\n> [pic]: group.png\n>   "Group title"\n\n> [!module|one end]\n\n> [!data] Data\n\n[pic]: shared.png\n`;
 const book=core.parseBooklet(source);
 assert.equal(core.referenceContext(book.references,'one'),'[pic]: group.png\n  "Group title"\n[pic]: shared.png');
 assert.ok(!JSON.stringify(book.activities).includes('[pic]: group.png'));
});
test('definitions in ordinary reading callouts are scoped and surrounding prose survives',()=>{
 const source=`---\nbooklet: "0.16"\n---\n\n> [!module|one] One\n\n> [!activity|a] A\n\nOutside ![x][pic]\n\n> [!tip] Tip\n> Before\n>\n> [pic]: callout.png\n>   "Title"\n>\n> After\n\n> [!module|one end]\n\n> [!data] Data\n\n[pic]: shared.png\n`;
 const book=core.parseBooklet(source);
 assert.equal(core.referenceContext(book.references,'one'),'[pic]: callout.png\n  "Title"\n[pic]: shared.png');
 const prose=JSON.stringify(book.activities);
 assert.ok(prose.includes('Before')); assert.ok(prose.includes('After')); assert.ok(!prose.includes('[pic]: callout.png'));
});

test('commented module markers stay inert when a definition is added or removed',()=>{
 for (const [open, close] of [['%%','%%'], ['<!--','-->']]) {
  const source=`---\nbooklet: "0.16"\n---\n\n${open}\n\n> [!module|fake] Fake\n\n${close}\n\n> [!activity|a] A\n\nWords.\n`;
  for (const suffix of ['', '\n> [!data] Data\n\n[pic]: image.png\n']) {
   const book=core.parseBooklet(source+suffix);
   assert.deepEqual(book.modules.map(m=>m.id),[]);
   assert.deepEqual(book.activities.map(a=>a.id),['a']);
  }
 }
});
