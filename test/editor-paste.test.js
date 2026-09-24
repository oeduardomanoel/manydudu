import test from "node:test";
import assert from "node:assert/strict";
import { plainTextToHtml } from "../public/editor.js";

test("plain text keeps paragraphs and line breaks instead of collapsing into one block", () => {
  assert.equal(plainTextToHtml("Primeira linha\nsegunda linha\n\nOutro parágrafo"),
    "<p>Primeira linha<br>segunda linha</p><p>Outro parágrafo</p>");
});

test("markdown headings, lists, quotes and dividers become real blocks", () => {
  assert.equal(plainTextToHtml("# Título\n### Sub\n- um\n- dois\n> citação\n---"),
    "<h2>Título</h2><h3>Sub</h3><ul><li>um</li><li>dois</li></ul><blockquote>citação</blockquote><hr>");
});

test("numbered list separated by blank lines stays one list and keeps its start number", () => {
  assert.equal(plainTextToHtml("1. a\n\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  assert.equal(plainTextToHtml("3. c\n4. d"), '<ol start="3"><li>c</li><li>d</li></ol>');
});

test("bold/italic apply outside links and never break a URL with underscores", () => {
  assert.equal(plainTextToHtml("**Skill**: veja https://x.com/a_b_c."),
    '<p><strong>Skill</strong>: veja <a href="https://x.com/a_b_c" target="_blank" rel="noopener">https://x.com/a_b_c</a>.</p>');
});

test("raw HTML in pasted text is escaped, not interpreted", () => {
  assert.equal(plainTextToHtml("<img src=x onerror=alert(1)>"), "<p>&lt;img src=x onerror=alert(1)&gt;</p>");
});

test("fenced code keeps its lines without markdown parsing", () => {
  assert.equal(plainTextToHtml("```\n# not a title\nnpx add\n```"), "<p># not a title<br>npx add</p>");
});
