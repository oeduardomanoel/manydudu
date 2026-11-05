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

test("a `>` inside a quoted attribute value never truncates the tag early", () => {
  const output = sanitizeHtml('<a href="https://x.com/a?b=1&c=2" title="x>y">clique</a>');
  assert.equal(output, '<a href="https://x.com/a?b=1&amp;c=2">clique</a>');
});

test("forces rel=noopener on target=_blank links, regardless of input", () => {
  assert.equal(sanitizeHtml('<a href="https://x.com" target="_blank">x</a>'), '<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>');
  assert.equal(sanitizeHtml('<a href="https://x.com" target="_blank" rel="nofollow">x</a>'), '<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>');
});

test("drops a duplicate attribute instead of keeping every occurrence", () => {
  assert.equal(sanitizeHtml('<a href="https://safe.com" href="https://also-safe.com">x</a>'), '<a href="https://safe.com">x</a>');
});

test("treats the HTML abbreviated-comment quirk (<!--> and <!--->) the way a real parser does", () => {
  assert.equal(sanitizeHtml("<!-->conteúdo real<p>oi</p>"), "conteúdo real<p>oi</p>");
  assert.equal(sanitizeHtml("<!--->conteúdo real<p>oi</p>"), "conteúdo real<p>oi</p>");
});

test("markup hidden inside a raw-text element body never reaches the output", () => {
  const output = sanitizeHtml('<script>var x = "<a href=1>";</script><p>depois</p>');
  assert.equal(output, "<p>depois</p>");
});

test("a tag swallowing a nested '<' up to the next real '>' still drops unknown tag names", () => {
  assert.equal(sanitizeHtml("<p>antes</p><naotag<p>depois</p>"), "<p>antes</p>depois</p>");
});

test("keeps a numeric start on ordered lists and drops anything else", () => {
  assert.equal(sanitizeHtml('<ol start="3"><li>a</li></ol>'), '<ol start="3"><li>a</li></ol>');
  assert.equal(sanitizeHtml('<ol start="3 onclick=x" type="a"><li>a</li></ol>'), "<ol><li>a</li></ol>");
});

test("keeps prompt blocks (pre/code) without any attributes", () => {
  assert.equal(sanitizeHtml('<pre class="x"><code onclick="y">linha 1\nlinha 2</code></pre>'), "<pre><code>linha 1\nlinha 2</code></pre>");
});

test("keeps https images with alt text and drops anything else on them", () => {
  assert.equal(sanitizeHtml('<img src="https://cdn.x.com/a.png" alt="Print" onerror="alert(1)" width="9">'), '<img src="https://cdn.x.com/a.png" alt="Print">');
});

test("drops images that aren't https (data:, javascript:, relative, unquoted)", () => {
  assert.equal(sanitizeHtml('<img src="data:image/png;base64,AAA">'), "");
  assert.equal(sanitizeHtml('<img src="javascript:alert(1)">'), "");
  assert.equal(sanitizeHtml('<img src="/api/backup">'), "");
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>'), "");
  assert.equal(sanitizeHtml('<img src="http://x.com/a.png">'), "");
});
