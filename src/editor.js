// The editorial layer: raw material in, a script worth hearing out.
//
// Reading markdown aloud produces something technically correct and completely
// unlistenable. This runs the source through the `claude` CLI already installed
// on this Mac — no API key, no extra subscription, it uses the Claude Code
// login you already have — and asks for a spoken script instead: an opening
// that says why you should care, prose in a talking register, and an ending.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const CLAUDE = process.env.CLAUDE_BIN || 'claude'; // Claude Code CLI on PATH, or set CLAUDE_BIN

// Claude Code loads project settings, MCP servers and CLAUDE.md by default,
// which is all irrelevant here and costs seconds per call. Strip it back to a
// plain text-in, text-out request.
const LEAN = [
  '--print',
  '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}',
  '--disable-slash-commands',
  '--disallowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task',
];

const WORDS_PER_MINUTE = 150;   // unhurried spoken delivery, not reading pace

const VOICE_RULES = `
How it has to sound:
- Spoken English. Contractions, short sentences, one idea per sentence.
- No markdown, no bullet characters, no headings, no URLs, no file paths, no code.
- Never say a symbol out loud. Write "about fifteen hundred", not "~1,483". Write
  "the config file", not "config.json". Write "the parser", not "parser.js".
- Signpost before you list: "there are three things going on here — first...".
- No stage directions, no sound effects, no "[laughs]", no speaker names inside
  the text itself.
- Do not invent anything. Everything you say must come from the source. If the
  source is thin, produce a short episode rather than padding it.
- Lead with the conclusion, then explain how it was reached. Someone half-awake
  on a train should get the point in the first twenty seconds.
- No sign-off pleasantries beyond one short closing line. Never mention podcasts,
  subscribing, ratings, or "that's all for today's episode".`;

const FORMATS = {
  brief: {
    speakers: ['host'],
    system: `You are an editor who turns written material into a short spoken briefing for one narrator.

Your listener is commuting. Their eyes are closed. They cannot scroll back, they
cannot see a screen, and they will lose the thread if you ramble.

Open by saying what this is and why it matters, in one or two sentences. Then
walk through the substance in a natural talking voice. Close with the single
thing worth remembering.
${VOICE_RULES}`,
  },
  dialogue: {
    speakers: ['host', 'guest'],
    system: `You are writing a two-person conversation that explains written material out loud.

HOST drives: asks the questions a smart listener would ask, pushes for
specifics, moves things along when an answer runs long.
GUEST explains: knows the material, answers in plain language, gives concrete
examples rather than abstractions.

Make it a real conversation. The host should interrupt with "wait, why?" and
"so what does that actually mean", and the guest should occasionally say "the
surprising part is...". Alternate frequently — no speech longer than about
seventy words. Never have them agree three times in a row; let the host be
mildly skeptical.

Open with the host framing the topic in one sentence. Close with the host
summarising the one thing worth remembering.
${VOICE_RULES}`,
  },
  lesson: {
    speakers: ['host'],
    system: `You are a patient tutor turning written material into a spoken lesson.

Teach it. Start from what the listener already knows, introduce one idea at a
time, and check understanding by restating the hard parts a second way. Use
concrete examples. Where something is genuinely difficult, say so.
${VOICE_RULES}`,
  },
};

export const FORMAT_NAMES = Object.keys(FORMATS);

/** Ask claude for JSON and get an object back, tolerating chatty wrappers. */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

async function ask({ system, prompt, model, maxBuffer = 32 * 1024 * 1024 }) {
  const { stdout } = await run(
    CLAUDE,
    [...LEAN, '--model', model, '--system-prompt', system, prompt],
    { maxBuffer, timeout: 15 * 60 * 1000 }
  );
  return stdout;
}

/**
 * Very long sources (a 3000-turn session) don't fit one pass and don't deserve
 * one either. Condense in parallel chunks first, then write from the notes.
 */
async function condense(source, model) {
  const CHUNK = 45000;
  const chunks = [];
  for (let i = 0; i < source.length; i += CHUNK) chunks.push(source.slice(i, i + CHUNK));

  const notes = await Promise.all(chunks.map(async (chunk, i) => {
    const out = await ask({
      model,
      system: 'You take notes for a writer who will turn them into a spoken briefing. '
        + 'Be dense and specific: what was decided, what was built, what broke, what was learned, '
        + 'and any concrete numbers or names. Skip pleasantries, tool output and boilerplate. '
        + 'Plain prose, no markdown, no preamble.',
      prompt: `Notes for part ${i + 1} of ${chunks.length} of a longer transcript:\n\n${chunk}`,
    });
    return out.trim();
  }));

  return notes.join('\n\n');
}

/**
 * @param {string} source        the raw material
 * @param {object} opts
 * @param {'brief'|'dialogue'|'lesson'} opts.format
 * @param {number} opts.minutes  target episode length
 * @returns {{title:string, blurb:string, lines:{speaker:string,text:string}[]}}
 */
export async function editToScript(source, { format = 'brief', minutes = 8, model = 'sonnet', context = '', onStage } = {}) {
  const spec = FORMATS[format];
  if (!spec) throw new Error(`unknown format "${format}" — try ${FORMAT_NAMES.join(', ')}`);

  let material = source.trim();
  if (!material) throw new Error('nothing to work with');

  if (material.length > 60000) {
    onStage?.(`condensing ${Math.round(material.length / 1000)}k characters`);
    material = await condense(material, 'haiku');
  }

  const words = Math.round(minutes * WORDS_PER_MINUTE);
  onStage?.(`writing a ${minutes} minute ${format}`);

  const speakers = spec.speakers.map((s) => `"${s}"`).join(' or ');
  const prompt = `${context ? `${context}\n\n` : ''}Turn the source below into a spoken script of roughly ${words} words — about ${minutes} minutes out loud.

Reply with ONLY a JSON object, no commentary before or after:
{
  "title": "a short, specific episode title — under 60 characters, no colons",
  "blurb": "one sentence of show notes",
  "lines": [{"speaker": ${speakers}, "text": "what they say"}]
}

Each "text" is one spoken paragraph. Keep them under about seventy words so the
delivery has somewhere to breathe.

--- SOURCE BEGINS ---
${material}
--- SOURCE ENDS ---`;

  const raw = await ask({ system: spec.system, prompt, model });
  const script = extractJson(raw);

  if (!Array.isArray(script.lines) || !script.lines.length) {
    throw new Error('the model returned no script lines');
  }

  // Never trust the speaker labels blindly — a stray name would silently fall
  // back to the narrator voice and the dialogue would collapse to one person.
  const allowed = new Set(spec.speakers);
  script.lines = script.lines
    .filter((l) => l && typeof l.text === 'string' && l.text.trim())
    .map((l) => ({
      speaker: allowed.has(l.speaker) ? l.speaker : spec.speakers[0],
      text: l.text.trim(),
    }));

  script.title = (script.title || 'Untitled').toString().trim().slice(0, 70);
  script.blurb = (script.blurb || '').toString().trim();
  script.format = format;
  return script;
}

/** Is the claude CLI usable right now? */
export async function editorAvailable() {
  try {
    await run(CLAUDE, ['--version'], { timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}
