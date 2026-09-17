# Commute Cast

Turn anything into a private podcast you can listen to on the way to work —
research, articles, notes, Claude Code sessions, language decks.

Everything runs on your own machine. No API keys, no subscriptions, no accounts,
nothing uploaded. Once it's set up it works with the wifi off.

Two parts of this are worth stealing even if you never run the whole thing:

- **[`src/install.js`](src/install.js) patches a broken Piper wheel on macOS.** The
  published `piper-tts` wheel hardcodes its CI machine's `espeak-ng-data` path into
  `espeakbridge.so` and ignores the path you pass to `initialize()`. No environment
  variable overrides it, so phonemization fails on every machine but the build
  runner's. The fix rewrites the baked-in string in place and re-signs the binary,
  which arm64 requires. See [the gory details](#the-piper-wheel-is-broken-on-macos).
- **[`src/pronounce.js`](src/pronounce.js) makes written text survive being spoken.**
  Neural TTS is only as good as the text you hand it, and prose written for the eye
  is full of notation that reads terribly aloud. Every rule in there was found by
  phonemizing real documents and reading back what the phonemizer actually produced.
  See [Saying it properly](#saying-it-properly).

## Setup

```bash
./bin/pod setup --kokoro
```

Two engines, both free and both fully offline:

- **Kokoro** *(default)* — a 2024 model, and the reason this sounds like a person
  rather than a train announcement. 54 voices, and they can be blended. Needs
  Python 3.12, which `uv` fetches into your home directory — no Homebrew, no sudo,
  nothing system-wide. About 400 MB all in.
- **Piper** — small and very fast (~13× realtime vs Kokoro's ~2×), and it has the
  Korean model the language decks use. Noticeably more robotic for long listening.

```bash
./bin/pod setup            # piper only, ~45s
./bin/pod setup --kokoro   # kokoro, a few minutes
```

Everything lives under `~/.local/share/commute-cast`. Delete that one folder to
undo all of it.

## The commands that matter

```bash
pod brief script.md        # a written script → episode → straight to the phone
pod digest article.md      # any file, rewritten for listening
pod read notes.md          # verbatim readout, no editing
pod claude --sync          # your last Claude Code session, digested
```

`pod brief` syncs on its own; `--sync` does the same for the others.

## Getting it onto a phone

Episodes land in **iCloud Drive → `claudecode`**, which shows up in the Files app.
Long-press the folder there and choose *Keep Downloaded* to hold them on the device
so they play with no signal.

```bash
pod sync            # copy everything across
pod sync --prune    # and delete what's no longer in the library
```

Change the folder name under `sync.folder` in `config.json`.

This is the route that works. Podcast apps like Overcast and Pocket Casts fetch
feeds from *their* servers, so they can never reach a feed served from your laptop.
There is a local player and RSS feed (`pod serve`) if you want it, but it only works
on the same wifi, and Apple Podcasts is the only app that will add it by URL.

## Choosing a voice

```bash
pod voice                  # what's installed, and what's selected
pod voice --try            # a sample of each, opens in Finder
pod voice af_bella         # switch
```

Two levers matter more than picking a different name:

```bash
pod voice af_bella --speed 0.92            # slower reads as more relaxed
pod voice "af_bella*0.7+af_nicole*0.3"     # blend two voices
```

Kokoro takes a style vector as happily as a voice name, so a weighted blend gives a
character neither voice has alone. `af_nicole` is the soft, breathy one, so mixing a
little into a clearer voice warms it up without losing diction. Weights don't have to
sum to 1 — higher totals push harder.

## Saying it properly

A neural voice is only as good as the text handed to it, and written notation is not
that text. These are real failures, found by phonemizing documents and reading back
the IPA rather than by guessing:

| written | the phonemizer said | now says |
|---|---|---|
| `$9.69` | dollar nine point six nine | nine dollars sixty nine |
| `$3.7bn` | dollar three point seven **bee-en** | three point seven billion dollars |
| `24/7` | twenty four **slash** seven | twenty four seven |
| `1,800 sqm` | **ess-cue-em** | square metres |
| `71-77` | seventy one **dash** seventy seven | seventy one to seventy seven |
| `2026` | two thousand twenty six | twenty twenty six |
| `WA` / `NSW` | **wah** / en-ess-double-you | Western Australia / New South Wales |
| `vs` | **vee ess** | versus |
| `YoY` | **yo why** | year on year |
| `—` | **dash** | *(a pause)* |

The trick is rewriting the *notation*, not spelling out every number — the phonemizer
reads plain integers and decimals correctly on its own, so `$3.7bn` only has to become
`3.7 billion dollars` and the voice does the rest.

Names it still gets wrong go in `lexicon` in `config.json`, as a **respelling** rather
than phonetics — steering the phonemizer's own letter rules is far more robust than
hand-written IPA:

```json
"lexicon": { "Revo": "Reevo", "EBITDA": "ee bit dah" }
```

## Digested, not read out

The point is not a robot reading markdown at you. `pod digest` runs source material
through the `claude` CLI already on your machine — using your existing Claude Code
login, so it costs nothing extra — and gets back a script written to be *heard*: it
leads with the conclusion, drops the file paths and code blocks, speaks numbers as
words, and signposts before it lists.

| `--format` | what you get |
|---|---|
| `brief` *(default)* | one narrator, tight, leads with the conclusion |
| `dialogue` | two voices, a real back-and-forth |
| `lesson` | a tutor taking one idea at a time |

```bash
pod digest notes.md --format dialogue --minutes 12
```

If you already have a script written for listening, `pod brief` skips the editor
entirely and just renders it. That's the path [`examples/brief`](examples/brief)
uses, where the writing happens in Claude Code instead.

## The Piper wheel is broken on macOS

Worth writing down, because it cost a day and the error message tells you nothing.

The published `piper-tts` macOS wheel bakes the build machine's `espeak-ng-data`
path — something under `/Users/runner/work/piper1-gpl` — directly into
`espeakbridge.so`, and **ignores the path passed to `initialize()`**. There is no
environment variable that overrides it; `ESPEAK_DATA_PATH` does nothing. So
phonemization fails on every machine except the CI runner that built it.

The fix in `src/install.js`: copy the bundled data somewhere stable, overwrite the
baked-in string in the binary with that path — NUL-padded, because it cannot grow —
and re-sign with `codesign -f -s -`, which arm64 refuses to load without. Don't
simplify that step away; nothing else works.

Kokoro sidesteps this entirely by using `espeakng-loader`, which ships its own copy.

## Notes

- Everything is mono 16-bit PCM at 22.05 kHz, so joining clips is just concatenating
  bytes — no ffmpeg, no sox. Kokoro renders at 24 kHz and is resampled on the way out
  with `afconvert`. Don't skip that: mixing rates silently shifts the pitch and breaks
  the pause timing.
- `afconvert` caps at 64 kbps for 22.05 kHz mono. 96 kbps fails with
  `Couldn't set audio converter property ('!dat')`.
- `pod claude` reads your Claude Code transcripts from `~/.claude/projects`. Whatever
  was in a session ends up in the episode and in `episodes.json`, which is why both
  are gitignored.
- macOS `say` is still supported as a last-ditch fallback, and is the reason this
  needed building in the first place.

## Licence

MIT — see [LICENSE](LICENSE). No models or speech engines are shipped; `pod setup`
downloads them at install time and they carry their own licences, some of them
GPL-3.0. See [NOTICE.md](NOTICE.md).
