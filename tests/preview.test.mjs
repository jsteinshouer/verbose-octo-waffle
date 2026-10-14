import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { createMarkdownRenderer, extractWikiLinks } from "../src/preview.mjs";

const require = createRequire(import.meta.url);
const markdownit = require("../vendor/markdown-it.min.js");
const highlighter = require("../vendor/highlight.min.js");
const purifier = { sanitize: (html) => html };
const renderer = createMarkdownRenderer({ markdownit, highlighter, purifier });

test("renders Markdown, syntax-highlighted code, and Mermaid source locally", () => {
  const html = renderer.render([
    "# A small idea",
    "",
    "A **useful** note.",
    "",
    "```javascript",
    "const answer = 42;",
    "```",
    "",
    "```mermaid",
    "graph TD; A-->B;",
    "```",
  ].join("\n"), []);

  assert.match(html, /<h1>A small idea<\/h1>/);
  assert.match(html, /<strong>useful<\/strong>/);
  assert.match(html, /class="hljs language-javascript"/);
  assert.match(html, /<pre class="mermaid">graph TD; A--&gt;B;/);
});

test("renders existing and unresolved wiki links as distinct safe targets", () => {
  const html = renderer.render("[[Garden notes]] and [[Unwritten thought]]", [
    { id: "garden", title: "Garden notes" },
  ]);

  assert.match(html, /class="wiki-link" data-note-title="Garden notes" data-note-id="garden"/);
  assert.match(html, /class="wiki-link wiki-link-missing" data-note-title="Unwritten thought"/);
});

test("does not execute raw HTML or load remote images from Markdown", () => {
  const html = renderer.render('<img src=x onerror="alert(1)">\n\n![remote](https://example.invalid/picture.png)', []);

  assert.doesNotMatch(html, /<img(?:\s|>)/);
  assert.match(html, /&lt;img/);
  assert.match(html, /Image omitted from the offline preview: remote/);
  assert.doesNotMatch(html, /https:\/\/example\.invalid\/picture\.png/);
});

test("extracts unique wiki links while preserving display spelling", () => {
  assert.deepEqual(
    extractWikiLinks("See [[Garden notes]], then [[garden Notes]] and [[Reading]]."),
    ["Garden notes", "Reading"],
  );
});
