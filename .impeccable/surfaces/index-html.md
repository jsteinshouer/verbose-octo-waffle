---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

## SCOPE AND MODE
Build the complete responsive notes workspace as a static, no-build-step web app. Operate surface, code-led. Implement the first-run and populated states of the same app.

## AUDIENCE, JOB, ACTION, CONTENT, CONSTRAINTS
Individuals capture, organize, and revisit personal notes and ideas. They write and preview Markdown, search and filter by tags, and follow `[[Note title]]` links. Include syntax-highlighted code and rendered Mermaid in preview. Store notes in browser storage behind a replaceable storage boundary. No runtime network access; dependencies are local. Do not add accounts, server sync, folders, Markdown import/export, or fabricated sample notes.

## SELECTED DIRECTION
The Writing Desk (direction seed `5b5d1f3a`, assigned direction selected). A calm personal workspace uses a warm light ground, botanical green, ink text, and restrained warm accents. Keep the expression in useful color roles, compact metadata, and considered typography; do not simulate a physical desk or paper.

## FIRST VIEWPORT
At desktop widths, show familiar navigation and tag filters on the left, a searchable note list beside it, and a focused Markdown editor with Write/Preview controls. Keep related-note references discoverable. On mobile, selecting a note opens a focused editor with a clear back-to-list action. Autosave continuously and identify saving, saved, and failure states.

## SIGNATURE INTERACTION AND MOTION
Typing `[[` opens a keyboard-operable note-title suggestion list; choosing an item inserts a wiki link. In preview, activating an existing linked note navigates to it; missing-note links remain visibly distinct and createable. Keep motion quiet and functional; honor reduced-motion preferences.

## STATES, SCOPE, AND OPEN DECISIONS
Cover an empty first-run state, populated notes, search with no matches, tag filtering, missing link targets, and storage failure/recovery. Support note creation, editing, deletion, title, tags, search, and link navigation. Server sync is a future possibility, not included. Product name, brand assets, and future sync behavior remain undecided.
