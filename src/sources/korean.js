// Korean lessons, shaped for listening with your eyes shut.
//
// Each card runs English prompt -> gap -> slow Korean -> a gap sized to the
// phrase itself -> Korean at speed. The prompt comes first on purpose: you get
// a beat to try producing the phrase before you hear it, which is worth far
// more on a commute than hearing it read at you.

import { parseDeck } from './decks.js';

export async function koreanEpisode(file, { mode = 'learn', repeats = 1 } = {}) {
  const deck = await parseDeck(file);
  if (!deck.count) throw new Error(`no cards found in ${file}`);

  const segments = [];
  const say = (text, voice) => segments.push({ say: text, voice });
  const pause = (p, extra) => segments.push(extra === undefined ? { pause: p } : { pause: p, extra });

  say(`Korean. ${deck.title}.`, 'narrator');
  pause(0.4);
  say(
    mode === 'review'
      ? `${deck.count} phrases. You'll hear the Korean first. Say what it means, then listen for the answer.`
      : `${deck.count} phrases. You'll hear the English, then the Korean slowly. Repeat it in the gap, then hear it at normal speed.`,
    'narrator'
  );
  pause(1);

  for (const section of deck.sections) {
    if (section.title) {
      say(`${section.title}.`, 'narrator');
      pause(0.6);
    }
    if (section.note) {
      say(section.note, 'narrator');
      pause(0.6);
    }

    for (const [korean, english] of section.cards) {
      if (mode === 'review') {
        say(korean, 'ko');
        pause('match-previous', 0.8);   // your turn to translate
        say(english, 'en');
        pause(0.7);
        continue;
      }

      say(english, 'en');
      pause(0.5);
      say(korean, 'ko_slow');
      pause('match-previous', 0.4);     // your turn to repeat
      for (let i = 0; i < repeats; i++) {
        say(korean, 'ko');
        pause(i + 1 < repeats ? 0.5 : 0.8);
      }
    }
  }

  say('End of lesson. Well done.', 'narrator');

  // Romanization stays out of the audio — an English voice reading
  // "keo-pi ju-se-yo" teaches the wrong sounds — but it belongs in the notes.
  const notes = deck.sections
    .flatMap((s) => s.cards.map(([ko, en, romaji]) => `${ko} — ${en}${romaji ? ` (${romaji})` : ''}`))
    .join('\n');

  return {
    show: 'korean',
    title: `Korean: ${deck.title}${mode === 'review' ? ' (review)' : ''}`,
    description: `${deck.count} phrases.${deck.description ? ` ${deck.description}` : ''}\n\n${notes}`,
    segments,
  };
}
