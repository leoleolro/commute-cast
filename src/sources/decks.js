// Parser for the two study-deck formats.
//
// A deck is plain markdown you can edit on your phone: `#` starts a section,
// `>` adds a description, and every other line is one card whose fields are
// separated by pipes. Nothing else to learn.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function parseDeck(file) {
  const raw = await readFile(file, 'utf8');
  const deck = {
    title: path.basename(file).replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
    description: '',
    sections: [],
  };
  let section = null;
  let sawTitle = false;

  for (const line of raw.replace(/\r\n/g, '\n').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('//')) continue;

    const heading = text.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      // The first heading names the whole deck; later ones split it up.
      if (!sawTitle && heading[1] === '#') {
        deck.title = heading[2].trim();
        sawTitle = true;
      } else {
        section = { title: heading[2].trim(), cards: [] };
        deck.sections.push(section);
      }
      continue;
    }

    if (text.startsWith('>')) {
      const note = text.replace(/^>\s?/, '').trim();
      if (section) section.note = note;
      else deck.description = deck.description ? `${deck.description} ${note}` : note;
      continue;
    }

    const fields = text.replace(/^\s*[-*+]\s+/, '').split('|').map((f) => f.trim());
    if (fields.length < 2 || !fields[0]) continue;
    if (!section) {
      section = { title: null, cards: [] };
      deck.sections.push(section);
    }
    section.cards.push(fields);
  }

  deck.sections = deck.sections.filter((s) => s.cards.length);
  deck.count = deck.sections.reduce((n, s) => n + s.cards.length, 0);
  return deck;
}

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
export const ordinal = (n) => ORDINALS[n] || `number ${n}`;
