// Making written notation survive being spoken.
//
// The neural voice is only as good as the text handed to it. Everything here
// was found by phonemizing real report text and reading back what espeak
// actually produced — not by guessing. The failures were consistent and ugly:
//
//   "$9.69"   -> "dollar nine point six nine"     (symbol read first)
//   "$3.7bn"  -> "dollar three point seven bee-en"
//   "24/7"    -> "twenty four slash seven"
//   "1,800 sqm" -> "one thousand eight hundred ess-cue-em"
//   "71-77"   -> "seventy one dash seventy seven"
//   "—"       -> "dash"
//   "vs"      -> "vee ess"
//   "WA"      -> "wah"        "NSW" -> "en ess double-you"
//   "YoY"     -> "yo why"     "IPO" -> "aye-poh"
//
// The trick is to rewrite the *notation*, not to spell out every number.
// espeak reads plain integers and decimals correctly on its own, so "$3.7bn"
// only has to become "3.7 billion dollars" and the voice does the rest.

/**
 * Proper nouns and initialisms the phonemizer gets wrong. The value is a
 * respelling, not a phoneme string — we are steering espeak's own letter
 * rules, which is more robust than hand-writing IPA.
 *
 * Extend this in config.json under "lexicon" for names in your own material.
 */
export const LEXICON = {
  Revo: 'Reevo',            // was "ruh-VOH"; wanted "REE-vo"
  EBITDA: 'ee bit dah',     // was "eb-it-duh"
  IPO: 'I P O',
  YoY: 'year on year',
  YOY: 'year on year',
  MoM: 'month on month',
  ARPU: 'ar poo',
  SaaS: 'sass',
  ASX: 'A S X',
  OAIC: 'O A I C',
  ACCC: 'A C C C',
};

/** Australian state codes, which espeak reads as words ("wah", "sah"). */
export const STATES = {
  WA: 'Western Australia',
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  SA: 'South Australia',
  NT: 'the Northern Territory',
  ACT: 'the A C T',
  TAS: 'Tasmania',
};

const SCALE = { k: 'thousand', m: 'million', b: 'billion', bn: 'billion', t: 'trillion' };

const UNITS = [
  [/\bsq\s?m\b|\bsqm\b|m²/gi, 'square metres'],
  [/\bsq\s?ft\b|\bsqft\b/gi, 'square feet'],
  [/\bkm\b/g, 'kilometres'],
  [/\bkg\b/g, 'kilograms'],
  [/\bhrs?\b/gi, 'hours'],
];

const PHRASES = [
  [/\bvs\.?\b/gi, 'versus'],
  [/\bi\.e\.\s*/gi, 'that is, '],
  [/\betc\b\.?/gi, 'et cetera'],
  [/\bapprox\.?\b/gi, 'approximately'],
  [/\bFY\s?(\d)/g, 'financial year $1'],
  [/\bp\.a\.\b/gi, 'per year'],
  [/\bYTD\b/g, 'year to date'],
  [/\bR&D\b/g, 'R and D'],
  [/\bM&A\b/g, 'mergers and acquisitions'],
  [/&/g, ' and '],
];

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0-99 in words. Only needed for years, so it stops there. */
function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t} ${ONES[n % 10]}` : t;
}

/**
 * 2026 -> "twenty twenty six". espeak's own "two thousand twenty six" is stiff,
 * and it is worth spelling this out rather than leaving digits: the same text
 * becomes the episode description, where "twenty 26" would look sloppy.
 */
function yearWords(n) {
  if (n >= 2000 && n <= 2009) return n === 2000 ? 'two thousand' : `two thousand ${ONES[n - 2000]}`;
  if (n >= 1910 && n <= 2099) {
    const hiWord = Math.floor(n / 100) === 20 ? 'twenty' : 'nineteen';
    const lo = n % 100;
    if (lo === 0) return `${hiWord} hundred`;
    return `${hiWord} ${lo < 10 ? `oh ${ONES[lo]}` : twoDigits(lo)}`;
  }
  return String(n);
}

const isYear = (n) => n >= 1900 && n <= 2099;

/**
 * Rewrite notation into something speakable. Order matters: scaled currency
 * has to run before plain currency, and both before bare ranges.
 */
export function pronounceable(text, { lexicon = {}, states = true } = {}) {
  let s = text;

  // — and – read as the word "dash". A comma gives the pause that was meant.
  s = s.replace(/\s*[—–]\s*/g, ', ');

  // ~8,590 -> "about 8,590". Has to allow a currency symbol in between,
  // because "~$3.7bn" is the form these reports actually use.
  s = s.replace(/~\s*(?=[$£€]?\d)/g, 'about ');

  // $3.7bn / $250k / $1.6m -> "3.7 billion dollars"
  s = s.replace(/\$\s?([\d,]+(?:\.\d+)?)\s?(bn|[kmbt])\b/gi,
    (_, n, sc) => `${n} ${SCALE[sc.toLowerCase()]} dollars`);

  // $9.69 -> "9 dollars 69"; $51 -> "51 dollars"
  s = s.replace(/\$\s?([\d,]+)\.(\d{2})\b/g, '$1 dollars $2');
  s = s.replace(/\$\s?([\d,]+(?:\.\d+)?)/g, '$1 dollars');

  // 3.7bn with no symbol, where the scale word was written as a suffix
  s = s.replace(/\b([\d,]+(?:\.\d+)?)\s?bn\b/gi, '$1 billion');

  // 24/7 -> "24 seven" (espeak: "twenty four seven")
  s = s.replace(/\b24\/7\b/g, '24 seven');

  // 35x -> "35 times"
  s = s.replace(/\b(\d+(?:\.\d+)?)\s?x\b/gi, '$1 times');

  // Ranges. Years get spoken as years; everything else just needs "to".
  s = s.replace(/\b(\d{4})\s?[-–—]\s?(\d{2,4})\b/g, (m, a, b) => {
    const y = Number(a);
    if (!isYear(y)) return m.replace(/[-–—]/, ' to ');
    const end = b.length === 2 ? Number(String(a).slice(0, 2) + b) : Number(b);
    return `${yearWords(y)} to ${isYear(end) ? yearWords(end) : b}`;
  });
  s = s.replace(/\b(\d+(?:\.\d+)?)\s?[-–]\s?(\d+(?:\.\d+)?)\b/g, '$1 to $2');

  // Remaining bare years -> "twenty twenty six"
  s = s.replace(/\b(19|20)\d{2}\b/g, (m) => yearWords(Number(m)));

  for (const [re, to] of UNITS) s = s.replace(re, to);
  for (const [re, to] of PHRASES) s = s.replace(re, to);

  // Word-level substitutions, longest first so "NSW" beats "SA".
  const table = { ...LEXICON, ...(states ? STATES : {}), ...lexicon };
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  if (keys.length) {
    const re = new RegExp(`\\b(${keys.map(escape).join('|')})\\b`, 'g');
    s = s.replace(re, (m) => table[m] ?? m);
  }

  // Tidy up whatever the rewrites left behind.
  return s
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
