# Board Reader: Muzium Tentera Darat, Port Dickson

Point a phone at a board and read it in English.

camera → grey + flatten lighting + invert → Tesseract (Malay, on-device) → fuzzy-match against `text_ms` in `signs.json` → show `text_en`

- `index.html`: the app (live camera, photo upload, or browse the list by hand)
- `match.js`: matcher (4-gram containment with IDF weighting; confident words only)
- `signs.json`: the boards. `text_ms` matches the wall exactly, typos included.
- `sw.js`: caches everything, so after one visit with signal it works offline
- `vendor/`: tesseract.js 5.1.1, its core, and `msa` traineddata (Apache-2.0)

## Run

The page has to be served over HTTP; `file://` won't work. The live camera needs HTTPS (or localhost). Over plain HTTP on a LAN, "Take or choose a photo" still works.

- GitHub Pages: Settings → Pages → Deploy from branch `main`, folder `/ (root)`. Then open https://resonantly-feral.github.io/Musuem-Detangler/
- Locally: `npx serve .` and open http://localhost:3000

Open it once with signal before the visit so it caches.

## Test

    node test/match.test.mjs

## Adding a board

Add an entry to `signs.json`. Any other printed text on the same board (e.g. the English half of a bilingual board) can go in an optional `match_extra: ["..."]` array. Bump `VERSION` in `sw.js` so phones pick it up.
