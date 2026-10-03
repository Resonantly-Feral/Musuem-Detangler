// Cache everything up front so the reader works with no signal inside the
// museum. Bump VERSION whenever any file here changes.
const VERSION = 'board-reader-v1';
const FILES = [
  './',
  './index.html',
  './match.js',
  './signs.json',
  './manifest.webmanifest',
  './vendor/tesseract.min.js',
  './vendor/worker.min.js',
  './vendor/core/tesseract-core-simd-lstm.wasm.js',
  './vendor/core/tesseract-core-lstm.wasm.js',
  './vendor/lang/msa.traineddata.gz',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
