// Read a Claude Code session back to yourself.
//
// The transcripts on disk are a firehose: thinking blocks, tool calls, tool
// results, attachments, subagent sidechains. Almost none of that is worth
// hearing. This keeps the two things that are — what you asked, and the prose
// Claude answered with — and drops everything else.

import { readFile, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { proseSegments, speakableParagraphs } from '../speakable.js';

const PROJECTS = path.join(homedir(), '.claude', 'projects');

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  // Only plain text blocks: thinking is internal, tool_use/tool_result are
  // machine chatter, and images have nothing to say out loud.
  return content.filter((b) => b?.type === 'text').map((b) => b.text || '').join('\n\n');
}

// Injected wrappers that appear inside user turns but were never typed by you.
const NOT_TYPED = /<(system-reminder|command-name|command-message|local-command-stdout|user-prompt-submit-hook)/;

function parseLines(raw) {
  return raw.split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

/** Every session for a project directory, newest first. */
export async function listSessions(projectDir) {
  const dir = projectDir || (await pickProject());
  const files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl'));
  const sessions = await Promise.all(files.map(async (f) => {
    const full = path.join(dir, f);
    const info = await stat(full);
    const events = parseLines(await readFile(full, 'utf8'));
    const titled = [...events].reverse().find((e) => e.type === 'custom-title' || e.type === 'ai-title');
    const firstPrompt = events.find(
      (e) => e.type === 'user' && !e.isSidechain && typeof textOf(e.message?.content) === 'string'
        && textOf(e.message.content).trim() && !NOT_TYPED.test(textOf(e.message.content))
    );
    const turns = events.filter((e) => e.type === 'assistant' && !e.isSidechain).length;
    return {
      id: f.replace(/\.jsonl$/, ''),
      file: full,
      modified: info.mtime,
      turns,
      title: (titled?.title || titled?.content || '').toString().trim()
        || textOf(firstPrompt?.message?.content || '').split('\n')[0].slice(0, 70)
        || 'Untitled session',
    };
  }));
  return sessions.sort((a, b) => b.modified - a.modified);
}

export async function listProjects() {
  const dirs = await readdir(PROJECTS);
  return dirs.filter((d) => !d.startsWith('.')).map((d) => ({ name: d, dir: path.join(PROJECTS, d) }));
}

async function pickProject() {
  // Default to the project this tool lives in, which is almost always the one
  // you were just talking to Claude about.
  const projects = await listProjects();
  const here = process.cwd().replace(/\//g, '-');
  const match = projects.find((p) => here.startsWith(p.name)) || projects[0];
  if (!match) throw new Error(`no Claude projects found under ${PROJECTS}`);
  return match.dir;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

export async function claudeEpisode(sessionFile, { includePrompts = true, code = 'mention' } = {}) {
  const events = parseLines(await readFile(sessionFile, 'utf8'));
  const segments = [];
  const notes = [];
  let answers = 0;
  let pendingPrompt = null;

  for (const e of events) {
    if (e.isSidechain) continue;                       // subagent transcripts

    if (e.type === 'user') {
      const text = textOf(e.message?.content).trim();
      if (text && !NOT_TYPED.test(text)) pendingPrompt = text;
      continue;
    }

    if (e.type !== 'assistant') continue;
    const body = textOf(e.message?.content).trim();
    if (!body) continue;                               // pure tool-call turn

    if (includePrompts && pendingPrompt) {
      const asked = speakableParagraphs(pendingPrompt, { code: 'skip' }).join(' ').slice(0, 300);
      if (asked) {
        segments.push({ say: `You asked. ${asked}`, voice: 'en_slow' });
        segments.push({ pause: 0.8 });
        notes.push(`\nQ: ${pendingPrompt.split('\n')[0].slice(0, 200)}`);
      }
      pendingPrompt = null;
    }

    segments.push(...proseSegments(body, { voice: 'narrator', code }));
    segments.push({ pause: 0.7 });
    notes.push(speakableParagraphs(body, { code: 'skip' }).join(' ').slice(0, 400));
    answers++;
  }

  if (!answers) throw new Error('no readable answers in that session — it may be all tool calls');

  const when = events.find((e) => e.timestamp)?.timestamp;
  const date = when ? new Date(when) : new Date();
  const spoken = `A Claude session from ${MONTHS[date.getMonth()]} ${date.getDate()}. ${answers} ${answers === 1 ? 'answer' : 'answers'}. Close your eyes.`;

  return {
    show: 'claude',
    segments: [{ say: spoken, voice: 'narrator' }, { pause: 1 }, ...segments],
    answers,
    date,
    notes: notes.join('\n'),
  };
}
