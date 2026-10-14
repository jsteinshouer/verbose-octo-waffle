const WIKI_LINK_PATTERN = /\[\[([^\]\n]+)\]\]/g;

export function extractWikiLinks(markdown) {
  const links = [];
  const seen = new Set();
  for (const match of markdown.matchAll(WIKI_LINK_PATTERN)) {
    const title = match[1].trim();
    const key = title.toLocaleLowerCase();
    if (title && !seen.has(key)) {
      seen.add(key);
      links.push(title);
    }
  }
  return links;
}

export function createMarkdownRenderer({ markdownit, highlighter, purifier }) {
  if (typeof markdownit !== "function" || !highlighter || !purifier) {
    throw new Error("The local Markdown preview libraries did not load.");
  }

  const markdown = markdownit({
    html: false,
    linkify: true,
    typographer: true,
    highlight(code, language) {
      if (language && highlighter.getLanguage(language)) {
        return `<pre><code class="hljs language-${escapeHtml(language)}">${highlighter.highlight(code, { language }).value}</code></pre>`;
      }
      return `<pre><code class="hljs">${highlighter.highlightAuto(code).value}</code></pre>`;
    },
  });
  const renderFence = markdown.renderer.rules.fence;
  markdown.renderer.rules.fence = (tokens, index, options, environment, self) => {
    if (tokens[index].info.trim().toLocaleLowerCase() === "mermaid") {
      return `<pre class="mermaid">${escapeHtml(tokens[index].content)}</pre>\n`;
    }
    return renderFence(tokens, index, options, environment, self);
  };

  markdown.inline.ruler.before("link", "wiki_link", (state, silent) => {
    const start = state.pos;
    if (state.src.slice(start, start + 2) !== "[[") return false;
    const end = state.src.indexOf("]]", start + 2);
    if (end < 0) return false;

    const title = state.src.slice(start + 2, end).trim();
    if (!title || title.includes("[")) return false;
    if (!silent) {
      const token = state.push("wiki_link_open", "a", 1);
      const target = state.env.notes.find((note) => note.title.trim().toLocaleLowerCase() === title.toLocaleLowerCase());
      token.attrSet("href", "#");
      token.attrSet("class", target ? "wiki-link" : "wiki-link wiki-link-missing");
      token.attrSet("data-note-title", title);
      if (target) token.attrSet("data-note-id", target.id);
      const text = state.push("text", "", 0);
      text.content = title;
      state.push("wiki_link_close", "a", -1);
    }

    state.pos = end + 2;
    return true;
  });

  markdown.renderer.rules.wiki_link_open = (tokens, index, options, environment, self) =>
    self.renderToken(tokens, index, options);
  markdown.renderer.rules.wiki_link_close = (tokens, index, options, environment, self) =>
    self.renderToken(tokens, index, options);
  markdown.renderer.rules.image = (tokens, index) =>
    `<span class="offline-image-message">Image omitted from the offline preview: ${escapeHtml(tokens[index].content)}</span>`;

  return {
    render(source, notes) {
      const markup = markdown.render(source, { notes });
      return purifier.sanitize(markup, { USE_PROFILES: { html: true } });
    },
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
