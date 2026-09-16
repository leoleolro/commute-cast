// Turn written text into text worth hearing.
//
// Prose written for the eye is full of things that sound terrible read aloud:
// markdown syntax, bare URLs, emoji, forty-line code blocks. This strips the
// noise and leaves paragraphs, so an episode sounds like someone talking
// rather than someone reciting a file.

import { pronounceable } from './pronounce.js';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

// Set by the caller before a render so notation is normalised with whatever
// extra names live in config.json. Empty is a perfectly good default.
let lexicon = {};
export function setLexicon(extra) { lexicon = extra || {}; }

function inline(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')             // images say nothing
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')          // keep link text, drop URL
    .replace(/`([^`]+)`/g, '$1')                      // inline code reads fine
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(EMOJI, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Markdown stripped, then notation rewritten so the voice reads it correctly. */
function spoken(text) {
  return pronounceable(inline(text), { lexicon });
}

/**
 * @param {string} md
 * @param {{ code?: 'mention'|'skip' }} opts  how to treat fenced code blocks
 * @returns {string[]} paragraphs, in the order they should be spoken
 */
export function speakableParagraphs(md, { code = 'mention' } = {}) {
  const out = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let buffer = [];

  const flush = () => {
    if (!buffer.length) return;
    const text = spoken(buffer.join(' '));
    if (text) out.push(text);
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    if (/^\s*```/.test(line)) {
      flush();
      let count = 0;
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { count++; i++; }
      if (code === 'mention') {
        out.push(count === 1 ? 'One line of code here.' : `A ${count} line code block here.`);
      }
      continue;
    }

    if (/^\s*(\|.*\||[-*_]{3,})\s*$/.test(line)) { flush(); continue; } // tables, rules
    if (!line.trim()) { flush(); continue; }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      flush();
      const text = spoken(heading[2]);
      if (text) out.push(/[.!?]$/.test(text) ? text : `${text}.`);
      continue;
    }

    // Bullets and numbered items each become their own sentence, so the
    // listener gets a beat between them instead of one run-on paragraph.
    //
    // A wrapped bullet's continuation lines have to be pulled in here. Left to
    // the paragraph buffer they become a separate utterance, which puts a full
    // stop and a pause in the middle of a sentence — "Every Revo member." …
    // "is essentially taken from a competitor."
    const bullet = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flush();
      const parts = [bullet[1]];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (!next.trim()) break;                                    // blank ends it
        if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(next)) break;           // next bullet
        if (/^\s{0,3}(?:#{1,6}\s|```)/.test(next)) break;           // heading or fence
        if (!/^\s+\S/.test(next)) break;                            // not indented
        parts.push(next.trim());
        i++;
      }
      const text = spoken(parts.join(' '));
      if (text) out.push(/[.!?:]$/.test(text) ? text : `${text}.`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) line = line.replace(/^\s*>\s?/, '');
    buffer.push(line.trim());
  }
  flush();
  return out;
}

/** Paragraphs plus a short breath between them, ready for the renderer. */
export function proseSegments(md, { voice = 'narrator', gap = 0.45, code = 'mention' } = {}) {
  const segments = [];
  for (const p of speakableParagraphs(md, { code })) {
    segments.push({ say: p, voice });
    segments.push({ pause: gap });
  }
  return segments;
}

/** Rough listening time, used for descriptions before anything is rendered. */
export function estimateSeconds(text, wpm = 178) {
  return (text.split(/\s+/).filter(Boolean).length / wpm) * 60;
}
