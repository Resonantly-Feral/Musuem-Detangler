// Simulates what OCR off a phone photo looks like (a partial view, with
// character errors and broken spacing) and checks the matcher picks the
// right sign, and refuses text that isn't from any sign.
//
//   node museum/test/match.test.mjs

import { readFileSync } from 'node:fs';
import { buildIndex, rank, decide } from '../match.js';

const { signs } = JSON.parse(readFileSync(new URL('../signs.json', import.meta.url)));
const index = buildIndex(signs);

let seed = Number(process.env.SEED) || 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (a) => a[Math.floor(rand() * a.length)];

// Typical Tesseract confusions plus plain random damage.
const CONFUSE = { l: '1', i: 'l', o: '0', e: 'c', a: 'o', m: 'rn', n: 'h', u: 'v', s: '5', b: 'h', t: 'f' };
function corrupt(text, rate) {
  let out = '';
  for (const ch of text) {
    const r = rand();
    if (r < rate * 0.4) out += CONFUSE[ch.toLowerCase()] ?? ch; // confusion
    else if (r < rate * 0.6) continue;                           // dropped
    else if (r < rate * 0.8) out += ch + pick('.,\'|~ ');        // junk inserted
    else if (r < rate && ch === ' ') continue;                   // words merged
    else out += ch;
  }
  return out;
}

function window(text, words) {
  const w = text.split(/\s+/);
  const start = Math.floor(rand() * Math.max(1, w.length - words));
  return w.slice(start, start + words).join(' ');
}

let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL', msg); };

// Positives: random partial views at increasing noise levels.
for (const rate of [0, 0.1, 0.2, 0.3]) {
  for (const words of [8, 15, 30]) {
    let right = 0, wrong = 0, unsure = 0, trials = 0;
    for (const sign of signs) {
      for (let k = 0; k < 40; k++) {
        trials++;
        const d = decide(rank(index, corrupt(window(sign.text_ms, words), rate)));
        if (d.kind === 'match') d.best.sign.id === sign.id ? right++ : wrong++;
        else if (d.kind === 'ambiguous' && d.candidates.some((c) => c.sign.id === sign.id)) unsure++;
        else if (d.kind === 'ambiguous') wrong++;
      }
    }
    const missed = trials - right - wrong - unsure;
    console.log(`noise ${rate * 100}%  ${String(words).padStart(2)} words:  ` +
      `match ${right}/${trials}  pick-list ${unsure}  no-read ${missed}  WRONG ${wrong}`);
    // A confident wrong answer is the one outcome we can't accept.
    if (wrong > 0) fail(`${wrong} wrong answers at noise ${rate}, ${words} words`);
    if (rate <= 0.2 && words >= 15 && right / trials < 0.9) fail(`weak recall at noise ${rate}, ${words} words`);
  }
}

// Whole board through heavy noise -> must match.
for (const sign of signs) {
  const d = decide(rank(index, corrupt(`${sign.heading_ms} ${sign.text_ms}`, 0.3)));
  if (d.kind !== 'match' || d.best.sign.id !== sign.id) fail(`full board ${sign.id} -> ${d.kind} ${d.best?.sign.id}`);
}

// Negatives: things a camera might see that aren't a sign.
const negatives = {
  english: signs[5].text_en,
  otherMalay: 'Sila jangan menyentuh bahan pameran. Dilarang mengambil gambar dengan lampu kilat di dalam galeri ini. Terima kasih atas kerjasama anda.',
  garbage: 'ii|l ,. ~~ 1l1 ;: oO0 __ |i ll. ,, ii ~ ',
  tooShort: 'Tentera Darat',
};
for (const [name, text] of Object.entries(negatives)) {
  const d = decide(rank(index, text));
  console.log(`negative ${name.padEnd(10)} -> ${d.kind} (best ${d.best.score.toFixed(2)} ${d.best.sign.id})`);
  if (d.kind === 'match') fail(`negative ${name} matched ${d.best.sign.id}`);
}

console.log(failures ? `\n${failures} failure(s)` : '\nall good');
process.exit(failures ? 1 : 0);
