# Notes

A local-first Markdown notebook for personal notes and ideas. Notes are stored in this browser; the app does not use accounts or a server.

## Run locally

Serve this folder over HTTP so browser storage and offline caching work:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. After the first successful load, the app shell and its Markdown, code, diagram, and font assets are cached locally for offline use.

## Use

- Create a note, enter a title, and write Markdown. Changes save automatically to this browser.
- Add comma-separated tags and search across titles, tags, and note text.
- Type `[[` in a note to search existing note titles or create a linked note.
- Switch to **Preview** to read Markdown, highlighted code, and rendered Mermaid diagrams.
- Use the links panel to follow outgoing links and backlinks.

Notes are local to this browser profile and origin. Clearing this browser's site data can remove them; this version does not include sync, backups, or import/export. A local static server is needed to access the app, including when offline.

## Tests

```sh
node --test tests/*.test.mjs
```

Third-party licenses for locally bundled browser assets are listed in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
