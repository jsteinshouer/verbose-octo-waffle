const CACHE_NAME = "writing-desk-shell-v1";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./favicon.svg",
  "./src/app.mjs",
  "./src/notes-store.mjs",
  "./src/preview.mjs",
  "./vendor/markdown-it.min.js",
  "./vendor/highlight.min.js",
  "./vendor/highlight-github.min.css",
  "./vendor/purify.min.js",
  "./vendor/mermaid.min.js",
  "./vendor/fonts/dm-sans-latin.woff2",
  "./vendor/fonts/source-serif-4-latin.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
