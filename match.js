// Fuzzy matcher: noisy OCR text -> which sign is this?
//
// Text is reduced to lowercase a–z/0–9 with ALL whitespace removed, then cut
// into character 4-grams. Dropping spaces makes OCR's split/joined words
// ("TenteraDarat", "tahun1963", "Tent era") irrelevant. Each 4-gram is
// weighted by how rare it is across the signs (IDF), so shared filler like
// "yang"/"telah" counts for little and "gestapu"/"kalabakan" counts for a lot.
//
// score(sign) = weight of OCR 4-grams found in the sign / weight of all OCR 4-grams
//
// It's a containment score, not a similarity score: a photo usually shows only
// part of a board, so we ask "how much of what I read is in this sign?".

// 4, not 3: with trigrams, generic Malay (e.g. a "no flash photography"
// notice) scored close enough to a sign to be offered as a candidate. 4-grams
// reject it cleanly and still survive ~20–30% OCR damage (see test/).
const N = 4;

export function normalize(s) {
  return (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function grams(s) {
  const out = new Set();
  for (let i = 0; i + N <= s.length; i++) out.add(s.slice(i, i + N));
  return out;
}

// Everything on the wall that belongs to a sign: heading, body, and any
// extra printed text (e.g. the English half of a bilingual board).
function signText(sign) {
  return [sign.heading_ms, sign.text_ms, ...(sign.match_extra || [])].join(' ');
}

export function buildIndex(signs) {
  const entries = signs.map((sign) => ({ sign, grams: grams(normalize(signText(sign)))}));
  const df = new Map();
  for (const e of entries) for (const g of e.grams) df.set(g, (df.get(g) || 0) + 1);
  const idf = new Map();
  for (const [g, n] of df) idf.set(g, Math.log(1 + entries.length / n));
  return { entries, idf, unseen: Math.log(1 + entries.length) };
}

export function rank(index, ocrText) {
  const norm = normalize(ocrText);
  const q = grams(norm);
  let total = 0;
  for (const g of q) total += index.idf.get(g) ?? index.unseen;
  const results = index.entries.map(({ sign, grams: sg }) => {
    let hit = 0;
    if (total > 0) for (const g of q) if (sg.has(g)) hit += index.idf.get(g);
    return { sign, score: total > 0 ? hit / total : 0 };
  });
  results.sort((a, b) => b.score - a.score);
  return { results, chars: norm.length };
}

// Turn a ranking into a decision the UI can show.
//   'match'     – confident, show it
//   'ambiguous' – plausible, but let the visitor pick from the top few
//   'none'      – didn't read enough of any sign
export const THRESHOLDS = { minChars: 25, match: 0.35, margin: 0.1, plausible: 0.25 };

export function decide({ results, chars }, t = THRESHOLDS) {
  const [best, second] = results;
  if (chars < t.minChars || !best || best.score < t.plausible) {
    return { kind: 'none', best, candidates: [] };
  }
  const candidates = results.filter((r) => r.score >= t.plausible).slice(0, 3);
  if (best.score >= t.match && best.score - (second?.score ?? 0) >= t.margin) {
    return { kind: 'match', best, candidates };
  }
  return { kind: 'ambiguous', best, candidates };
}

// Tesseract happily "reads" glare, wood grain and noise as junk like
// "aa a A '!!'!", and every junk 4-gram dilutes the score. Keep only words it
// was fairly sure of that look like words (3+ letters in a row).
export function confidentText(words, minConfidence = 60) {
  return (words || [])
    .filter((w) => w.confidence >= minConfidence && /[a-z]{3}/i.test(w.text))
    .map((w) => w.text)
    .join(' ');
}

// Rank both the filtered and the raw reading; keep whichever is more decisive.
const STRENGTH = { match: 2, ambiguous: 1, none: 0 };
export function bestDecision(index, rawText, words) {
  const tries = [rawText, confidentText(words)].map((text) => {
    const ranking = rank(index, text);
    return { text, ranking, decision: decide(ranking) };
  });
  tries.sort((a, b) =>
    STRENGTH[b.decision.kind] - STRENGTH[a.decision.kind] ||
    (b.decision.best?.score ?? 0) - (a.decision.best?.score ?? 0));
  return tries[0];
}
