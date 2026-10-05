// Cache everything up front so the reader works with no signal inside the
// museum. Bump VERSION whenever any file here changes.
const VERSION = 'board-reader-v2';
const FILES = [
  './',
  './index.html',
  './match.js',
  './signs.json',
  './manifest.webmanifest',
  './vendor/tesseract.min.js',
  './vendor/worker.min.js',
  './vendor/lang/msa.traineddata.gz',
];

// Tesseract ships two ~4 MB engines and each phone only ever loads one:
// the SIMD build on phones that support it, the plain build otherwise.
// Same check Tesseract itself uses (wasm-feature-detect's `simd`), so we
// cache exactly the file it will ask for.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
function coreFile() {
  let simd = false;
  try { simd = WebAssembly.validate(SIMD_PROBE); } catch {}
  return simd ? './vendor/core/tesseract-core-simd-lstm.wasm.js' : './vendor/core/tesseract-core-lstm.wasm.js';
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([...FILES, coreFile()])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first. Anything same-origin that wasn't precached (e.g. the other
// engine, if detection ever disagreed) is stored the first time it loads.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  })));
});
