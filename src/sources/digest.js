// An edited script becomes an episode.
//
// The editor hands back speaker-tagged lines; each speaker maps to a voice
// role, so a two-host dialogue renders as an actual conversation between two
// different voices rather than one narrator reading both parts.

export function digestEpisode(script, { show = 'digest', sourceNote = '' } = {}) {
  const segments = [];
  let previousSpeaker = null;

  for (const line of script.lines) {
    // A slightly longer beat when the speaker changes — that gap is most of
    // what makes a two-voice script sound like people talking.
    const gap = previousSpeaker && previousSpeaker !== line.speaker ? 0.35 : 0.5;
    if (segments.length) segments.push({ pause: gap });
    segments.push({ say: line.text, voice: line.speaker });
    previousSpeaker = line.speaker;
  }

  const transcript = script.lines
    .map((l) => (script.format === 'dialogue' ? `${l.speaker === 'host' ? 'A' : 'B'}: ${l.text}` : l.text))
    .join('\n\n');

  return {
    show,
    title: script.title,
    description: [script.blurb, sourceNote, '', transcript].filter(Boolean).join('\n').slice(0, 8000),
    segments,
  };
}
