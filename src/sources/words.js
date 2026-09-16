// Vocabulary drills: word, a silence long enough to actually try recalling it,
// then the definition and a sentence that puts it in context.

import { parseDeck } from './decks.js';

export async function wordsEpisode(file, { recall = 2.2 } = {}) {
  const deck = await parseDeck(file);
  if (!deck.count) throw new Error(`no cards found in ${file}`);

  const segments = [];
  const say = (text, voice) => segments.push({ say: text, voice });
  const pause = (p) => segments.push({ pause: p });

  say(`${deck.title}.`, 'narrator');
  pause(0.4);
  say(`${deck.count} words. Each one comes with a pause — try to define it before I do.`, 'narrator');
  pause(1);

  for (const section of deck.sections) {
    if (section.title) {
      say(`${section.title}.`, 'narrator');
      pause(0.6);
    }
    for (const [word, definition, example] of section.cards) {
      say(`${word}.`, 'en_slow');
      pause(recall);
      say(definition, 'narrator');
      pause(0.4);
      if (example) {
        say(`For example. ${example}`, 'en');
        pause(0.8);
      }
    }
  }

  say('That is the set. See you tomorrow.', 'narrator');

  const notes = deck.sections
    .flatMap((s) => s.cards.map(([w, d, ex]) => `${w} — ${d}${ex ? `\n    "${ex}"` : ''}`))
    .join('\n');

  return {
    show: 'words',
    title: deck.title,
    description: `${deck.count} words.${deck.description ? ` ${deck.description}` : ''}\n\n${notes}`,
    segments,
  };
}
