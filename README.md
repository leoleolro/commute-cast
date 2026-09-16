# Commute Cast

> Install: `git clone https://github.com/leoleolro/commute-cast.git && cd commute-cast && cp config.example.json config.json && ./bin/pod setup`. Requires Node 18+ and macOS (Piper TTS runs offline; iPhone sync uses iCloud Drive). Edit `config.json` for voices, port and the sync folder.


Turn anything into a private podcast you can listen to on the way to work —
Claude sessions, articles, notes, Korean lessons, vocabulary drills.

Everything runs on this Mac. No API keys, no subscriptions, no accounts,
nothing uploaded. Once set up it works with the wifi off.

## Setup, once

```bash
cd commute-cast
./bin/pod setup
```

`pod` is also installed at `~/.local/bin/pod`, so after opening a new terminal you
can just type `pod` from anywhere — no `cd`, no `./bin/`.

About 45 seconds. It builds a private Python environment under
`~/.local/share/commute-cast`, installs **Piper** — a neural text-to-speech
engine that runs offline — and downloads three voices: an English female, an
English male, and a Korean one. Delete that one folder to undo all of it.

The old macOS `say` voices are still supported as a fallback, but they are the
reason this needed doing.

## The commands that matter

```bash
./bin/pod brief script.md        # a written script → episode → straight to the phone
./bin/pod claude --sync          # your last Claude session, digested, onto your phone
./bin/pod digest article.md      # any file, rewritten for listening
```

`pod brief` syncs on its own. `--sync` does the same for the others. Everything
lands in **iCloud Drive → <sync folder from config.json>**, which is the folder that shows up in Files
on the iPhone. Long-press it there and choose *Keep Downloaded* to hold the
episodes on the phone itself, so they play with no signal.

## Business briefings, end to end

In Claude Code, just ask:

> business analysis on Revo Fitness

The `brief` skill does the research, writes the report, rewrites it for the ear,
renders it and drops it on the phone. The written report is kept next to the
script under `content/reports/`.

## Choosing a voice

```bash
pod voice --try                  # a sample of every installed voice, opens in Finder
pod voice cori                   # switch the narrator to that one
```

The default is `en_US-lessac-high`. `pod voices --all` lists everything
downloadable; `pod setup --models <name>` fetches one.

## Saying it properly

Neural voices only sound good if the text is right. Written notation is not, and
`src/pronounce.js` fixes it — all of it found by phonemizing real reports and
reading back what espeak actually produced:

| written | espeak said | now says |
|---|---|---|
| `$9.69` | dollar nine point six nine | nine dollars sixty nine |
| `$3.7bn` | dollar three point seven bee-en | three point seven billion dollars |
| `24/7` | twenty four slash seven | twenty four seven |
| `1,800 sqm` | ess-cue-em | square metres |
| `71-77` | seventy one dash seventy seven | seventy one to seventy seven |
| `2026` | two thousand twenty six | twenty twenty six |
| `WA` / `NSW` | wah / en-ess-double-you | Western Australia / New South Wales |
| `vs` | vee ess | versus |
| `—` | dash | *(a pause)* |

Names it still gets wrong go in `lexicon` in `config.json`, as a respelling
rather than phonetics — `"Revo": "Reevo"` is the whole trick.

## Digested, not read out

The point is not a robot reading markdown at you. Source material goes through
the `claude` CLI already installed on this Mac — using the Claude Code login you
already have, so it costs nothing extra — and comes back as a script written to
be *heard*: it leads with the conclusion, drops the file paths and code blocks,
speaks numbers as words, and signposts before it lists.

Three formats:

| `--format` | what you get |
|---|---|
| `brief` *(default)* | one narrator, tight, leads with the conclusion |
| `dialogue` | two voices, a real back-and-forth — best when you're half-awake |
| `lesson` | a tutor taking one idea at a time |

```bash
./bin/pod claude --format dialogue --minutes 12
./bin/pod digest notes.md --format lesson --minutes 6
```

Very long sources (a three-thousand-turn session) are condensed in parallel
chunks first, then written from the notes.

Want the old verbatim readout? `./bin/pod claude --raw`, or `./bin/pod read <file>`.

## Everything it takes as input

```bash
./bin/pod claude                 # latest Claude Code session
./bin/pod claude --list          # pick a different one
./bin/pod claude --pick 3
./bin/pod claude --project shopify

./bin/pod digest report.md       # a file
./bin/pod digest "some text"     # a line
pbpaste | ./bin/pod digest -     # whatever's on your clipboard

./bin/pod korean content/korean.md    # study decks, unchanged
./bin/pod words content/words.md
```

## Getting it onto the iPhone

### 1. iCloud Drive — most reliable

```bash
./bin/pod sync
```

Or add `--sync` to any command above. On the phone: **Files → iCloud Drive →
Commute Cast**, long-press the folder, **Keep Downloaded**. Plays with proper
lock-screen and AirPods controls, works with no signal, no server needed.

### 2. Apple Podcasts by feed URL — best listening experience

In the **Podcasts app on this Mac**: *File → Add a Show by URL* →

```
http://<your-mac>.local:4000/feed.xml
```

Needs `./bin/pod serve` running. With iCloud *Sync Library* on it appears on
your iPhone and downloads on-device over your home wifi. Per-show feeds exist
too: `/feed/claude.xml`, `/feed/korean.xml`, `/feed/words.xml`, `/feed/digest.xml`.

**Overcast and Pocket Casts can't subscribe to this** — they fetch feeds on
their own servers, which can't reach your home wifi. Apple Podcasts fetches
on-device, which is why it's the one recommended.

Use the `.local` name, not an IP. Your Mac's IP moves on DHCP; the feed rewrites
its own URLs from the request host to survive that.

### 3. The web player

`http://<your-mac>.local:4000` in Safari on the same wifi. Tap ▶,
or ⤓ to save an episode into Files.

## Study decks

Plain markdown you can edit on your phone. `#` names the deck, `##` starts a
section, `>` adds a note, every other line is a card with `|` between fields.

**Korean** — `korean | english | romanization`:

```markdown
# Survival Korean
## Coffee and food
커피 한 잔 주세요. | One coffee, please. | keo-pi han jan ju-se-yo
```

Plays as **English → gap → slow Korean → a gap the length of the phrase →
Korean at speed**. The English comes first so you get a beat to try producing it
before you hear the answer. Romanization stays out of the audio — an English
voice reading "keo-pi ju-se-yo" teaches the wrong sounds — but stays in the notes.
`--review` flips to Korean-first recall; `--repeats 2` says it twice.

**Words** — `word | definition | example`. Word, a silence long enough to
actually try, then the answer. `--recall 3` lengthens the gap.

## Commands

| | |
|---|---|
| `pod setup` | install the neural voices (once) |
| `pod digest <file\|text\|->` | anything, rewritten for listening |
| `pod claude` | latest Claude session · `--list --pick 2 --raw --project X` |
| `pod korean` / `pod words` | study decks |
| `pod read <file>` | verbatim readout, no editing |
| `pod voices --all` | see and install other voices |
| `pod list` / `pod rm <id>` | manage episodes |
| `pod serve` / `pod sync` | feed on wifi / copy to iCloud |

Shared flags: `--format brief\|dialogue\|lesson`, `--minutes 12`, `--sync`,
`--to <folder>`, `--model haiku`.

## Other voices

`pod voices --all` lists what's downloadable — about twenty English options and
a Korean one. Install extras and point `config.json` at them:

```bash
./bin/pod setup --models en_US-amy-medium,en_GB-alba-medium
```

```json
"voices": {
  "narrator": { "engine": "piper", "model": "en_US-hfc_female-medium" },
  "guest":    { "engine": "piper", "model": "en_US-ryan-high" },
  "ko_slow":  { "engine": "piper", "model": "ko_KR-kss-medium", "lengthScale": 1.45 }
}
```

`lengthScale` above 1 slows a voice down. To fall back to a macOS voice for a
role, use `{ "engine": "say", "voice": "Samantha", "rate": 178 }`.

## How it works

Every engine emits mono 16-bit PCM at 22050 Hz — true of `say
--data-format=LEI16@22050` and of every Piper model — so clips are joined by
concatenating sample bytes. No ffmpeg, no mixing library, nothing to install.
`afconvert`, built into macOS, packs the result to AAC.

Segments are grouped by voice and synthesized in one process per voice, because
loading a model costs about a second and a lesson has seventy lines. A 15-minute
episode renders in about a minute; Piper runs roughly 13× faster than realtime.

The feed is generated per request from the `Host` header rather than written to
disk, so episode URLs always match the address you reached it on. Audio is
served with byte-range support so seeking works. Cover art is drawn with
arithmetic and PNG-encoded by hand.

```
src/
  wav.js        RIFF parsing, splicing, silence
  engines.js    say + piper adapters, batched by voice
  install.js    one-command setup, including the espeak patch
  tts.js        script → m4a
  editor.js     source → spoken script, via the claude CLI
  speakable.js  markdown → text worth hearing
  cover.js      generated artwork, hand-rolled PNG encoder
  feed.js       RSS 2.0 + iTunes tags
  server.js     feed, audio, web player
  sources/      claude · digest · korean · words · reading
```

### One thing worth knowing

The published Piper macOS wheel hardcodes its build machine's `espeak-ng-data`
path into `espeakbridge.so` and ignores the path passed to `initialize()`, so
phonemization fails everywhere but Rhasspy's CI. No environment variable
overrides it. `pod setup` copies the bundled data somewhere stable, overwrites
the baked-in string in place (NUL-padded, since it can't grow), and re-signs the
library — arm64 refuses to load it otherwise. If a future Piper release fixes
this, the patch step detects it's unnecessary and skips.
