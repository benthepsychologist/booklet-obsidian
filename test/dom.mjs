/*
 * A jsdom document with the element helpers Obsidian adds to the DOM (createEl, createDiv, setAttr, toggleClass,
 * empty, setText, instanceOf …), installed as globals, for running the Booklet view in Node (test/view.test.mjs).
 * Import this before the view's bundle.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const w = dom.window;

function apply(el, o) {
	const info = typeof o === "string" ? { cls: o } : o ?? {};
	if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(" ") : info.cls;
	if (info.text !== undefined) el.textContent = String(info.text);
	if (info.type !== undefined) el.type = info.type;
	if (info.value !== undefined) el.value = info.value;
	if (info.placeholder !== undefined) el.setAttribute("placeholder", info.placeholder);
	if (info.title !== undefined) el.setAttribute("title", info.title);
	for (const [k, v] of Object.entries(info.attr ?? {})) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
	return el;
}

const P = w.HTMLElement.prototype;
P.createEl = function (tag, o, cb) {
	const el = apply(this.ownerDocument.createElement(tag), o);
	this.appendChild(el);
	cb?.(el);
	return el;
};
P.createDiv = function (o, cb) {
	return this.createEl("div", o, cb);
};
P.createSpan = function (o, cb) {
	return this.createEl("span", o, cb);
};
P.setAttr = function (k, v) {
	if (v === null || v === undefined) this.removeAttribute(k);
	else this.setAttribute(k, String(v));
};
P.addClass = function (...c) {
	this.classList.add(...c);
};
P.removeClass = function (...c) {
	this.classList.remove(...c);
};
P.toggleClass = function (c, on) {
	this.classList.toggle(c, on);
};
P.empty = function () {
	while (this.firstChild) this.removeChild(this.firstChild);
};
P.setText = function (t) {
	this.textContent = t;
};
P.appendText = function (t) {
	this.appendChild(this.ownerDocument.createTextNode(t));
};
w.Node.prototype.instanceOf = function (T) {
	return this instanceof T;
};

for (const k of ["window", "document", "Node", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLButtonElement", "Event", "KeyboardEvent", "FocusEvent"])
	globalThis[k] = k === "window" ? w : w[k];

export { w as window };
