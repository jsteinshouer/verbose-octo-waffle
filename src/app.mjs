import { LocalNotesRepository, NotesStorageError, makeNote, normalizeTags } from "./notes-store.mjs";
import { createMarkdownRenderer, extractWikiLinks } from "./preview.mjs";

const byId = (id) => document.getElementById(id);
const appShell = byId("app-shell");
const noteList = byId("note-list");
const listEmpty = byId("list-empty");
const searchInput = byId("search-input");
const mobileTagFilters = byId("mobile-tag-filters");
const tagFilterList = byId("tag-filter-list");
const emptyEditor = byId("empty-editor");
const noteEditor = byId("note-editor");
const titleInput = byId("title-input");
const tagsInput = byId("tags-input");
const markdownInput = byId("markdown-input");
const previewPane = byId("markdown-preview");
const writingSurface = byId("writing-surface");
const suggestionList = byId("link-suggestions");
const outgoingLinks = byId("outgoing-links");
const backlinks = byId("backlinks");
const storageAlert = byId("storage-alert");
const storageAlertMessage = byId("storage-alert-message");
const retryStorageButton = byId("retry-storage-button");
const saveStatus = byId("save-status");
const saveStatusText = byId("save-status-text");

const pendingWrites = new Map();
const pendingDeletes = new Set();
let notes = [];
let activeNoteId = null;
let activeTag = null;
let editorMode = "write";
let storageReady = false;
let storageIssue = null;
let repository = null;
let saveTimer = 0;
let suggestionStart = -1;
let suggestionItems = [];
let highlightedSuggestion = 0;
let previewRevision = 0;
let markdownRenderer = null;
let mermaidPromise = null;
let notesLoaded = false;
let rendererLibraryPromise = null;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function noteTitle(note) {
  return note.title.trim() || "Untitled note";
}

function sortedNotes() {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function titleMatches(a, b) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

function setSaveState(state, message) {
  saveStatus.classList.toggle("is-saving", state === "saving");
  saveStatus.classList.toggle("is-error", state === "error");
  saveStatusText.textContent = message;
}

function showStorageIssue(issue) {
  storageIssue = issue;
  storageAlert.hidden = !issue;
  if (issue) {
    storageAlertMessage.textContent = issue.action === "load"
      ? "Local notes couldn't be opened. Stored data is untouched, and editing is paused so nothing gets overwritten."
      : "A change couldn't be saved. Your work remains in this tab; retry before closing the page.";
    retryStorageButton.textContent = issue.action === "load" ? "Try again" : "Retry save";
    setSaveState("error", issue.action === "load" ? "Storage unavailable" : "Not saved");
  }
  renderStorageControlState();
}

function renderStorageControlState() {
  const disabled = !storageReady;
  byId("new-note-button").disabled = disabled;
  byId("empty-create-button").disabled = disabled;
  titleInput.disabled = disabled;
  tagsInput.disabled = disabled;
  markdownInput.disabled = disabled;
  byId("delete-note-button").disabled = disabled;
}

function setActiveNote(id) {
  activeNoteId = id;
  suggestionList.hidden = true;
  byId("delete-confirmation").hidden = true;
  appShell.classList.toggle("is-mobile-note-open", Boolean(id));
  render();
}

function render() {
  renderSidebar();
  renderNoteList();
  renderEditor();
  renderStorageControlState();
}

function renderSidebar() {
  const allNotes = byId("all-notes-button");
  allNotes.classList.toggle("is-active", activeTag === null);
  allNotes.setAttribute("aria-current", activeTag === null ? "page" : "false");
  byId("all-notes-count").textContent = String(notes.length);

  const tagCounts = new Map();
  for (const note of notes) {
    for (const tag of note.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.keys()].sort((a, b) => a.localeCompare(b));
  byId("tag-empty-note").hidden = tags.length > 0;

  tagFilterList.replaceChildren();
  mobileTagFilters.replaceChildren();
  for (const [index, tag] of tags.entries()) {
    const count = tagCounts.get(tag);
    const colorClass = `color-${index % 3}`;
    const desktopButton = document.createElement("button");
    desktopButton.type = "button";
    desktopButton.className = `tag-filter${activeTag === tag ? " is-active" : ""}`;
    desktopButton.dataset.tag = tag;
    desktopButton.setAttribute("aria-pressed", String(activeTag === tag));
    desktopButton.innerHTML = `<span class="tag-dot ${colorClass}" aria-hidden="true"></span><span>${escapeHtml(tag)}</span><span class="tag-filter-count">${count}</span>`;
    tagFilterList.append(desktopButton);

    const mobileButton = document.createElement("button");
    mobileButton.type = "button";
    mobileButton.className = `mobile-tag-button${activeTag === tag ? " is-active" : ""}`;
    mobileButton.dataset.tag = tag;
    mobileButton.setAttribute("aria-pressed", String(activeTag === tag));
    mobileButton.innerHTML = `<span class="tag-dot ${colorClass}" aria-hidden="true"></span>${escapeHtml(tag)}`;
    mobileTagFilters.append(mobileButton);
  }
}

function renderNoteList() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filtered = sortedNotes().filter((note) => {
    const matchesTag = !activeTag || note.tags.some((tag) => titleMatches(tag, activeTag));
    const haystack = `${note.title}\n${note.content}\n${note.tags.join(" ")}`.toLocaleLowerCase();
    return matchesTag && (!query || haystack.includes(query));
  });

  byId("collection-title").textContent = activeTag ? `# ${activeTag}` : "All notes";
  byId("collection-count").textContent = String(filtered.length);
  noteList.replaceChildren();

  for (const note of filtered) {
    const row = document.createElement("div");
    row.className = "note-row-wrap";
    row.setAttribute("role", "listitem");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `note-row${activeNoteId === note.id ? " is-active" : ""}`;
    button.dataset.noteId = note.id;
    button.setAttribute("aria-current", activeNoteId === note.id ? "true" : "false");
    const excerpt = note.content
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/[`*_~>#\[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const tags = note.tags.slice(0, 3).map((tag, index) =>
      `<span class="note-row-tag color-${index % 3}">${escapeHtml(tag)}</span>`).join("");
    button.innerHTML = `
      <span class="note-row-title-line">
        <span class="note-row-title">${escapeHtml(noteTitle(note))}</span>
        <time class="note-row-date" datetime="${escapeHtml(note.updatedAt)}">${escapeHtml(formatRelativeDate(note.updatedAt))}</time>
      </span>
      <span class="note-row-excerpt">${escapeHtml(excerpt || "No text yet")}</span>
      ${tags ? `<span class="note-row-tags">${tags}</span>` : ""}
    `;
    row.append(button);
    noteList.append(row);
  }

  const noNotes = notes.length === 0 && !activeTag && !query;
  const noMatches = filtered.length === 0 && !noNotes;
  listEmpty.hidden = !noNotes && !noMatches;
  if (noNotes) {
    listEmpty.innerHTML = `<h2>No notes yet</h2><p>Start a notebook of your own, one thought at a time.</p><button class="text-button" type="button" data-create-note>Create your first note</button>`;
  } else if (noMatches) {
    const message = query ? `No notes match “${escapeHtml(searchInput.value.trim())}”.` : `No notes have the tag “${escapeHtml(activeTag)}” yet.`;
    listEmpty.innerHTML = `<h2>Nothing here yet</h2><p>${message}</p>${query || activeTag ? '<button class="text-button" type="button" data-clear-filters>Clear filters</button>' : ""}`;
  }
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  const difference = Math.floor((today.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000);
  if (difference === 1) return "Yesterday";
  if (difference > 1 && difference < 7) return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function renderEditor() {
  const note = notes.find((item) => item.id === activeNoteId);
  emptyEditor.hidden = Boolean(note);
  noteEditor.hidden = !note;
  if (!note) return;

  if (titleInput.value !== note.title) titleInput.value = note.title;
  if (tagsInput.dataset.noteId !== note.id) {
    tagsInput.value = note.tags.join(", ");
    tagsInput.dataset.noteId = note.id;
  }
  if (markdownInput.value !== note.content) markdownInput.value = note.content;
  byId("write-button").classList.toggle("is-active", editorMode === "write");
  byId("preview-button").classList.toggle("is-active", editorMode === "preview");
  byId("write-button").setAttribute("aria-pressed", String(editorMode === "write"));
  byId("preview-button").setAttribute("aria-pressed", String(editorMode === "preview"));
  writingSurface.hidden = editorMode !== "write";
  previewPane.hidden = editorMode !== "preview";
  renderConnections(note);
  if (editorMode === "preview") void renderPreview(note);
}

function renderConnections(note) {
  const outgoing = extractWikiLinks(note.content);
  const incoming = notes.filter((other) =>
    other.id !== note.id
    && note.title.trim()
    && extractWikiLinks(other.content).some((title) => titleMatches(title, note.title)));

  outgoingLinks.replaceChildren();
  if (outgoing.length === 0) {
    outgoingLinks.innerHTML = '<p class="connection-empty">Links you add will appear here.</p>';
  } else {
    for (const title of outgoing) {
      const linked = notes.find((other) => titleMatches(other.title, title));
      const button = connectionButton(title, linked?.id ?? "", !linked);
      outgoingLinks.append(button);
    }
  }

  backlinks.replaceChildren();
  if (incoming.length === 0) {
    backlinks.innerHTML = '<p class="connection-empty">No notes link here yet.</p>';
  } else {
    for (const linked of incoming) {
      const button = connectionButton(noteTitle(linked), linked.id, false);
      const date = document.createElement("span");
      date.className = "connection-date";
      date.textContent = `Updated ${formatRelativeDate(linked.updatedAt)}`;
      button.append(date);
      backlinks.append(button);
    }
  }
}

function connectionButton(title, id, missing) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `connection-link${missing ? " is-missing" : ""}`;
  button.dataset.noteTitle = title;
  if (id) button.dataset.noteId = id;
  button.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#icon-link"></use></svg><span>${escapeHtml(title)}${missing ? " · create note" : ""}</span>`;
  return button;
}

async function renderPreview(note) {
  const revision = ++previewRevision;
  previewPane.textContent = "Preparing preview…";
  if (!markdownRenderer) {
    try {
      await loadRendererLibraries();
      if (revision !== previewRevision) return;
      markdownRenderer = createMarkdownRenderer({
        markdownit: window.markdownit,
        highlighter: window.hljs,
        purifier: window.DOMPurify,
      });
    } catch (error) {
      previewPane.textContent = "Markdown preview isn't available because a local rendering library failed to load. Try opening Preview again.";
      console.error("Markdown preview setup failed.", error);
      return;
    }
  }

  const html = markdownRenderer.render(note.content, notes);
  previewPane.innerHTML = html || '<p class="connection-empty">This note is empty.</p>';
  const diagrams = [...previewPane.querySelectorAll(".mermaid")];
  if (diagrams.length === 0) return;

  const sources = diagrams.map((diagram) => diagram.textContent);
  try {
    await loadMermaid();
    if (revision !== previewRevision) return;
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: '"DM Sans", sans-serif',
      themeVariables: {
        primaryColor: "#e7eee7",
        primaryTextColor: "#27352d",
        primaryBorderColor: "#8ca28d",
        lineColor: "#647a68",
        secondaryColor: "#f2e9df",
        tertiaryColor: "#f5f3eb",
        fontSize: "14px",
      },
    });
    await window.mermaid.run({ nodes: diagrams });
  } catch (error) {
    if (revision !== previewRevision) return;
    console.error("A Mermaid diagram could not be rendered.", error);
    diagrams.forEach((diagram, index) => {
      diagram.classList.add("mermaid-error");
      diagram.textContent = `This diagram couldn't be rendered. Check its Mermaid syntax.\n\n${sources[index]}`;
    });
  }
}

function loadMermaid() {
  if (window.mermaid) return Promise.resolve();
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./vendor/mermaid.min.js";
    script.onload = () => window.mermaid
      ? resolve()
      : reject(new Error("The local Mermaid library did not initialize."));
    script.onerror = () => {
      mermaidPromise = null;
      reject(new Error("The local Mermaid library could not be loaded."));
    };
    document.head.append(script);
  });
  return mermaidPromise;
}

function loadRendererLibraries() {
  if (!rendererLibraryPromise) {
    rendererLibraryPromise = Promise.all([
      loadScript("./vendor/markdown-it.min.js", "markdownit"),
      loadScript("./vendor/highlight.min.js", "hljs"),
      loadScript("./vendor/purify.min.js", "DOMPurify"),
    ]).catch((error) => {
      rendererLibraryPromise = null;
      throw error;
    });
  }
  return rendererLibraryPromise;
}

function loadScript(source, globalName) {
  if (window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.onload = () => window[globalName]
      ? resolve()
      : reject(new Error(`The local ${globalName} library did not initialize.`));
    script.onerror = () => reject(new Error(`The local ${globalName} library could not be loaded.`));
    document.head.append(script);
  });
}

function updateNoteFromField(field, value) {
  const note = notes.find((item) => item.id === activeNoteId);
  if (!note) return;
  if (field === "title") note.title = value;
  if (field === "tags") note.tags = normalizeTags(value.split(","));
  if (field === "content") note.content = value;
  note.updatedAt = new Date().toISOString();
  pendingDeletes.delete(note.id);
  pendingWrites.set(note.id, { ...note, tags: [...note.tags] });
  setSaveState("saving", "Saving…");
  renderNoteList();
  renderConnections(note);
  if (editorMode === "preview") void renderPreview(note);
  scheduleSave();
}

function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flushPendingChanges(), 450);
}

async function flushPendingChanges() {
  if (!repository || !storageReady || storageIssue?.action === "load") return;
  const deletes = [...pendingDeletes];
  const writes = [...pendingWrites.values()];
  try {
    for (const id of deletes) {
      await repository.remove(id);
      pendingDeletes.delete(id);
    }
    for (const note of writes) {
      await repository.save(note);
      if (pendingWrites.get(note.id)?.updatedAt === note.updatedAt) pendingWrites.delete(note.id);
    }
  } catch (error) {
    console.error("A note change could not be saved.", error);
    showStorageIssue({ action: "save", error });
    return;
  }

  if (pendingDeletes.size || pendingWrites.size) {
    scheduleSave();
  } else {
    showStorageIssue(null);
    setSaveState("saved", "Saved locally");
  }
}

async function retryStorage() {
  retryStorageButton.disabled = true;
  retryStorageButton.textContent = "Checking…";
  try {
    if (storageIssue?.action === "load") {
      repository = new LocalNotesRepository(window.localStorage);
      notes = await repository.list();
      storageReady = true;
      notesLoaded = true;
      showStorageIssue(null);
      setSaveState("saved", "Saved locally");
      render();
    } else {
      await flushPendingChanges();
    }
  } catch (error) {
    console.error("Browser storage retry failed.", error);
    showStorageIssue({ action: "load", error });
  } finally {
    retryStorageButton.disabled = false;
    if (storageIssue) retryStorageButton.textContent = storageIssue.action === "load" ? "Try again" : "Retry save";
  }
}

function createNewNote(title = "") {
  if (!storageReady) return;
  const note = makeNote(title);
  notes.push(note);
  activeTag = null;
  editorMode = "write";
  setActiveNote(note.id);
  updateNoteFromField("title", note.title);
  window.setTimeout(() => titleInput.focus(), 0);
}

function deleteActiveNote() {
  if (!activeNoteId) return;
  const removedId = activeNoteId;
  notes = notes.filter((note) => note.id !== removedId);
  pendingWrites.delete(removedId);
  pendingDeletes.add(removedId);
  activeNoteId = null;
  appShell.classList.remove("is-mobile-note-open");
  byId("delete-confirmation").hidden = true;
  setSaveState("saving", "Saving…");
  render();
  scheduleSave();
}

function parseLinkQuery() {
  const cursor = markdownInput.selectionStart;
  const beforeCursor = markdownInput.value.slice(0, cursor);
  const match = beforeCursor.match(/\[\[([^\]\n]*)$/);
  if (!match) return null;
  return {
    start: beforeCursor.length - match[0].length,
    query: match[1].trim(),
  };
}

function renderSuggestions() {
  const match = parseLinkQuery();
  if (!match) {
    suggestionList.hidden = true;
    markdownInput.setAttribute("aria-expanded", "false");
    return;
  }
  suggestionStart = match.start;
  const query = match.query.toLocaleLowerCase();
  const otherNotes = sortedNotes().filter((note) => note.id !== activeNoteId);
  const matches = otherNotes.filter((note) => noteTitle(note).toLocaleLowerCase().includes(query)).slice(0, 6);
  suggestionItems = matches.map((note) => ({ title: noteTitle(note), id: note.id, create: false }));
  const exact = otherNotes.some((note) => titleMatches(note.title, match.query));
  if (match.query && !exact && !notes.some((note) => titleMatches(note.title, match.query))) {
    suggestionItems.push({ title: match.query, id: "", create: true });
  }

  if (suggestionItems.length === 0) {
    suggestionList.hidden = true;
    markdownInput.setAttribute("aria-expanded", "false");
    return;
  }
  highlightedSuggestion = Math.min(highlightedSuggestion, suggestionItems.length - 1);
  suggestionList.innerHTML = suggestionItems.map((item, index) => `
    <button class="suggestion-option${index === highlightedSuggestion ? " is-current" : ""}" type="button" role="option" aria-selected="${index === highlightedSuggestion}" data-suggestion-index="${index}">
      <svg class="icon" aria-hidden="true"><use href="#icon-${item.create ? "plus" : "link"}"></use></svg>
      <span>${item.create ? `Create note “${escapeHtml(item.title)}”` : escapeHtml(item.title)}</span>
      ${index === highlightedSuggestion ? '<span class="suggestion-hint">Enter</span>' : ""}
    </button>
  `).join("");
  suggestionList.hidden = false;
  markdownInput.setAttribute("aria-expanded", "true");
}

function chooseSuggestion(index) {
  const suggestion = suggestionItems[index];
  if (!suggestion || suggestionStart < 0) return;
  const sourceNoteId = activeNoteId;
  const prefix = markdownInput.value.slice(0, suggestionStart);
  const cursor = markdownInput.selectionStart;
  const remainder = markdownInput.value.slice(cursor);
  const start = suggestionStart;
  const insertion = `[[${suggestion.title}]]`;
  const nextValue = `${prefix}${insertion}${remainder}`;
  suggestionList.hidden = true;
  markdownInput.setAttribute("aria-expanded", "false");
  if (suggestion.create) {
    const sourceNote = notes.find((note) => note.id === sourceNoteId);
    if (sourceNote) {
      sourceNote.content = nextValue;
      sourceNote.updatedAt = new Date().toISOString();
      pendingWrites.set(sourceNote.id, { ...sourceNote, tags: [...sourceNote.tags] });
      renderNoteList();
      renderConnections(sourceNote);
      scheduleSave();
    }
    const linkedNote = makeNote(suggestion.title);
    notes.push(linkedNote);
    activeTag = null;
    editorMode = "write";
    setActiveNote(linkedNote.id);
    updateNoteFromField("title", linkedNote.title);
    window.setTimeout(() => titleInput.focus(), 0);
    return;
  }
  markdownInput.value = nextValue;
  const nextCursor = start + insertion.length;
  markdownInput.focus();
  markdownInput.setSelectionRange(nextCursor, nextCursor);
  updateNoteFromField("content", nextValue);
}

function setEditorMode(mode) {
  editorMode = mode;
  renderEditor();
}

async function initialize() {
  try {
    repository = new LocalNotesRepository(window.localStorage);
    notes = await repository.list();
    storageReady = true;
    notesLoaded = true;
    setSaveState("saved", "Saved locally");
  } catch (error) {
    console.error("Local notes could not be loaded.", error);
    showStorageIssue({ action: "load", error });
  }
  render();
  if (!notesLoaded) return;
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js")
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        document.documentElement.classList.add("offline-ready");
        byId("offline-status").textContent = "Stored here · ready offline";
      })
      .catch((error) => {
        byId("offline-status").textContent = "Stored here · offline setup failed";
        console.error("Offline app caching could not be enabled.", error);
      });
  }
}

byId("new-note-button").addEventListener("click", () => createNewNote());
byId("empty-create-button").addEventListener("click", () => createNewNote());
byId("all-notes-button").addEventListener("click", () => {
  activeTag = null;
  render();
});
searchInput.addEventListener("input", renderNoteList);
tagFilterList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  if (!button) return;
  activeTag = titleMatches(activeTag ?? "", button.dataset.tag) ? null : button.dataset.tag;
  render();
});
mobileTagFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tag]");
  if (!button) return;
  activeTag = titleMatches(activeTag ?? "", button.dataset.tag) ? null : button.dataset.tag;
  render();
});
noteList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-note-id]");
  if (button) setActiveNote(button.dataset.noteId);
});
listEmpty.addEventListener("click", (event) => {
  if (event.target.closest("[data-create-note]")) createNewNote();
  if (event.target.closest("[data-clear-filters]")) {
    activeTag = null;
    searchInput.value = "";
    render();
  }
});
titleInput.addEventListener("input", () => updateNoteFromField("title", titleInput.value));
tagsInput.addEventListener("input", () => updateNoteFromField("tags", tagsInput.value));
tagsInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    markdownInput.focus();
  }
});
markdownInput.addEventListener("input", () => {
  updateNoteFromField("content", markdownInput.value);
  renderSuggestions();
});
markdownInput.addEventListener("click", renderSuggestions);
markdownInput.addEventListener("keyup", (event) => {
  if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) return;
  renderSuggestions();
});
markdownInput.addEventListener("keydown", (event) => {
  if (suggestionList.hidden) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    highlightedSuggestion = (highlightedSuggestion + 1) % suggestionItems.length;
    renderSuggestions();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    highlightedSuggestion = (highlightedSuggestion - 1 + suggestionItems.length) % suggestionItems.length;
    renderSuggestions();
  } else if (event.key === "Enter" && suggestionItems.length) {
    event.preventDefault();
    chooseSuggestion(highlightedSuggestion);
  } else if (event.key === "Escape") {
    suggestionList.hidden = true;
    markdownInput.setAttribute("aria-expanded", "false");
  }
});
suggestionList.addEventListener("mousedown", (event) => event.preventDefault());
suggestionList.addEventListener("click", (event) => {
  const option = event.target.closest("[data-suggestion-index]");
  if (option) chooseSuggestion(Number(option.dataset.suggestionIndex));
});
byId("write-button").addEventListener("click", () => setEditorMode("write"));
byId("preview-button").addEventListener("click", () => setEditorMode("preview"));
byId("back-to-list-button").addEventListener("click", () => appShell.classList.remove("is-mobile-note-open"));
byId("delete-note-button").addEventListener("click", () => {
  byId("delete-confirmation").hidden = false;
  byId("cancel-delete-button").focus();
});
byId("cancel-delete-button").addEventListener("click", () => {
  byId("delete-confirmation").hidden = true;
  byId("delete-note-button").focus();
});
byId("confirm-delete-button").addEventListener("click", deleteActiveNote);
retryStorageButton.addEventListener("click", () => void retryStorage());
previewPane.addEventListener("click", (event) => {
  const link = event.target.closest("[data-note-title]");
  if (!link) return;
  event.preventDefault();
  const target = notes.find((note) => note.id === link.dataset.noteId)
    ?? notes.find((note) => titleMatches(note.title, link.dataset.noteTitle));
  if (target) setActiveNote(target.id);
  else createNewNote(link.dataset.noteTitle);
});
outgoingLinks.addEventListener("click", (event) => handleConnectionClick(event));
backlinks.addEventListener("click", (event) => handleConnectionClick(event));

function handleConnectionClick(event) {
  const button = event.target.closest("[data-note-title]");
  if (!button) return;
  const target = notes.find((note) => note.id === button.dataset.noteId);
  if (target) setActiveNote(target.id);
  else createNewNote(button.dataset.noteTitle);
}

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "n") {
    event.preventDefault();
    createNewNote();
    return;
  }
  if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey
    && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});

window.addEventListener("storage", async (event) => {
  if (!repository || event.key !== repository.key) return;
  try {
    const refreshed = await repository.list();
    const dirty = new Set([...pendingWrites.keys(), ...pendingDeletes]);
    notes = [...refreshed.filter((note) => !dirty.has(note.id)), ...notes.filter((note) => dirty.has(note.id))];
    render();
  } catch (error) {
    console.error("Notes changed in another tab but couldn't be refreshed.", error);
    showStorageIssue({ action: "save", error });
  }
});

window.addEventListener("beforeunload", (event) => {
  if (pendingWrites.size === 0 && pendingDeletes.size === 0) return;
  event.preventDefault();
  event.returnValue = "";
});

void initialize();
