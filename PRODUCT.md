# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML, CSS, and JavaScript with no build step. Rendering dependencies must be bundled locally so the app works offline.

## Users

Individuals keeping personal notes and ideas.

## Product Purpose

A simple notetaking app for capturing, organizing, and revisiting personal knowledge. Success means users can comfortably write Markdown notes and find or follow connections between them without relying on a network connection.

## Positioning

A private, local-first notebook that works offline. Notes stay in the user's browser in the initial version.

## Operating Context

Users create and edit notes, search across them, organize them with tags, and move between related notes using wiki-style links.

## Capabilities and Constraints

- Plain Markdown editing with a rendered preview.
- Render Mermaid diagrams and syntax-highlight fenced code blocks in the preview.
- Link notes using `[[Note title]]`, with autocomplete and navigation.
- Search notes and organize them with tags; folders are not in the initial scope.
- Persist notes locally in the browser. Keep the storage boundary replaceable to allow possible server sync in the future; sync is not part of the initial version.
- Do not require network access at runtime. Dependencies must be available locally.
- Markdown import/export is not part of the initial version.

## Evidence on Hand

The repository contains no product-specific content, customer evidence, demonstrations, or brand assets. Do not fabricate them.

## Product Principles

- Keep personal notes private and local by default.
- Make the core writing and reading experience work offline.
- Keep note capture and retrieval straightforward.
- Make connections between notes easy to create and follow.
