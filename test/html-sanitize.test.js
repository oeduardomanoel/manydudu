import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtml } from "../src/util/html.js";

test("strips a javascript: link hidden behind a tab character (confirmed sanitizer bypass)", () => {
  const output = sanitizeHtml('<a href="java\tscript:alert(document.domain)">clique aqui</a>');
  assert.ok(!/javascript:/i.test(output), `href with a scheme-splitting tab should be stripped, got: ${output}`);
  assert.equal(output, "<a>clique aqui</a>");
});

test("strips a javascript: link hidden behind a newline or carriage return", () => {
  assert.equal(sanitizeHtml('<a href="java\nscript:alert(1)">x</a>'), "<a>x</a>");
  assert.equal(sanitizeHtml('<a href="java\rscript:alert(1)">x</a>'), "<a>x</a>");
});

test("keeps a legitimate https link", () => {
  const output = sanitizeHtml('<a href="https://exemplo.com/material.pdf">baixar</a>');
  assert.equal(output, '<a href="https://exemplo.com/material.pdf">baixar</a>');
});

test("keeps a legitimate mailto link", () => {
  const output = sanitizeHtml('<a href="mailto:contato@exemplo.com">e-mail</a>');
  assert.equal(output, '<a href="mailto:contato@exemplo.com">e-mail</a>');
});

test("strips a data: URI href", () => {
  const output = sanitizeHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
  assert.ok(!output.includes("href="), `data: URI should be stripped, got: ${output}`);
});

test("removes script tags entirely", () => {
  assert.equal(sanitizeHtml('<p>oi</p><script>alert(1)</script>'), "<p>oi</p>");
});
