/* Obsidian-flavoured Markdown definitions and comment spans, read from the current text. */
import { unified } from "unified";
import remarkObsidian from "@quartz-community/remark-obsidian";

export interface ReferenceDefinition { text: string; module: string | null; section: "content" | "data"; }
export interface ReferenceSource { definitions: Map<number, { end: number; text: string }>; comments: Set<number>; }
const parser = unified().use(remarkObsidian, { parseComments: false });

/** Find actual Markdown definition blocks and comments; source offsets preserve the author's spelling. */
export function referenceSource(text: string): ReferenceSource {
 const definitions: ReferenceSource["definitions"] = new Map();
 const comments = new Set<number>();
 // Definitions need `]:`; comments also need parsing to keep structural markers inside them inert.
 if (!text.includes("]:") && !text.includes("<!--") && !text.includes("%%")) return { definitions, comments };
 const tree = parser.runSync(parser.parse(text), text);
 type Node = { type: string; value?: string; position?: {start: {line:number;column:number;offset?:number};end:{line:number;column:number;offset?:number}};children?: Node[] };
 function visit(n: Node): void {
  const p = n.position;
  if (p && (n.type === "comment" || (n.type === "html" && n.value?.trimStart().startsWith("<!--")))) {
   for (let i = p.start.line - 1; i < p.end.line; i++) {
    const prefix = i === p.start.line - 1 ? text.slice(text.lastIndexOf("\n", (p.start.offset ?? 0) - 1) + 1, p.start.offset) : "";
    if (!prefix.trim()) comments.add(i);
   }
   return;
  }
  if (p && n.type === "definition" && p.start.offset !== undefined && p.end.offset !== undefined) {
   definitions.set(p.start.line - 1, {end: p.end.line - 1, text: text.slice(p.start.offset, p.end.offset)});
   return;
  }
  for (const c of n.children ?? []) visit(c);
 }
 visit(tree as Node);
 return { definitions, comments };
}

/** Definitions ordered so Obsidian resolves the current module before shared data. */
export function referenceContext(defs: readonly ReferenceDefinition[], scope: string | null): string {
 const own = scope !== null ? defs.filter(d => d.module === scope && d.section === "content") : [];
 const data = scope !== null ? defs.filter(d => d.module === scope && d.section === "data") : [];
 const shared = defs.filter(d => d.module === null);
 return [...own, ...data, ...shared].map(d => d.text).join("\n");
}
