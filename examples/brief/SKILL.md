---
name: brief
description: Research a company, market or competitor and deliver the analysis as an audio briefing on your phone, not just text on screen. Use whenever the user asks for a business analysis, company breakdown, competitor research, market sizing, or "analyse X" — and any time they want something turned into a podcast/audio report for the commute. Triggers on "business analysis", "analyse this company", "do a breakdown on", "audio report", "make this a podcast", "brief me on".
---

# Business briefing → audio on the phone

You listen on the way to work. A business analysis that only exists as text on a
screen has not been delivered. Every briefing produces **both**: a written report to
skim, and an episode that lands in the `claudecode` folder on the phone.

## The pipeline

1. **Research** — WebSearch. Aim for 4–8 searches across these angles, run in
   parallel where they don't depend on each other:
   - the company: founding, ownership, scale, footprint, leadership
   - the numbers: revenue, clubs/stores/users, growth rate, funding, acquisitions
   - the market: size, growth, penetration, whether it's growing or flat
   - the competitors: who else, at what price, at what scale
   - the risks: regulation, litigation, integration, key-person, capital structure

   Prefer primary and trade sources (regulator sites, industry press, company
   announcements) over listicles. Note the date on every figure — a 2023 number
   presented as current is the most common way these briefings go wrong.

2. **Write the report** → `commute-cast/content/reports/<slug>.md`
   Structure that has worked:
   - **Snapshot** — what it is, in six lines
   - **The verdict up front** — the conclusion, before the evidence
   - **The market it plays in** — and whether that market is growing
   - **How it actually wins** — the model, numbered
   - **Growth trajectory**
   - **Competitive position** — a table
   - **Risks and watch-items** — numbered, honest, no hedging
   - **What I'd want to see to go deeper** — the non-public numbers that would settle it
   - **Bottom line**

3. **Write the spoken script** → `commute-cast/content/reports/<slug>-spoken.md`
   This is a *separate file*, not the report. Rewrite it for the ear:
   - Lead with the conclusion in the first twenty seconds
   - Short sentences, contractions, one idea per sentence
   - Signpost before lists: "there are four things going on here — first…"
   - No markdown, no tables, no file paths, no URLs
   - Spell numbers as words where it reads better: "nine dollars sixty nine"
   - Target 900–1100 words ≈ 5–6 minutes
   - End on the single thing worth remembering

   The renderer normalises notation anyway (see `src/pronounce.js`), so `$3.7bn`
   and `24/7` are safe — but writing it out still reads better.

4. **Render and sync** — one command, auto-syncs to the phone:

   ```bash
   cd /path/to/commute-cast
   ./bin/pod brief "content/reports/<slug>-spoken.md" --title "<Company> — Business Briefing" </dev/null
   ```

   `</dev/null` matters — without it the command blocks waiting on stdin.

5. **Hand it over** — `SendUserFile` the `.m4a` and the written report, and say in
   one line that it's in `claudecode` on the phone.

## Rules

- **Never invent a number.** If a figure isn't in the sources, say it isn't public
  and put it in "what I'd want to see". A fabricated market size is worse than a gap.
- **Date the figures.** "68 clubs (mid-2025)" not "68 clubs".
- **Cite.** End the written report and the chat reply with source links.
- **Give a verdict.** A briefing that lists facts without a judgement is
  half-finished. Say what you think, and what would change your mind.
- Add mispronounced proper nouns to `lexicon` in `commute-cast/config.json` — the
  value is a respelling, e.g. `"Revo": "Reevo"`.
