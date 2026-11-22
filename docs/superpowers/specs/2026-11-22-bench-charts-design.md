# Bench charts (milestone 2, part 2; same PR #4)

## Goal
The README shows the benchmark as four charts, generated from `bench/results.json`, so a reader
sees the speed-up and the reasons for it before reading the tables.

Target reader: an engineer who maintains a CI pipeline, scanning the README on GitHub, light or dark theme.

## Non-goals
- New bench runs or new numbers. The 15 existing runs are the data.
- Interactive charts. GitHub shows README SVGs through `<img>`, which runs no script, so there is
  no hover. The README tables are the exact-value view.
- A chart library or new dependency. The SVGs are written by hand in TypeScript.
- A web page (artifact). The charts are only in the repo.

## Decisions
- D1 Data for the timeline: `results.json` has each job's `wall_s` and steps, but no start time.
  T7 backfills `start_s` per job (job `started_at` minus run `created_at`) from the GitHub API
  `repos/<repo>/actions/runs/<id>/jobs` for the 15 existing runs. It does not re-run anything.
  `bench.ts run` also records `start_s` from now on. Checked on 2026-11-22: the API still returns `started_at` for the bench runs (retention is 90 days).
- D2 Files: `scripts/charts.ts` holds pure functions `(res: Results) => string` (SVG), one per chart.
  `bun scripts/bench.ts --charts` writes `bench/charts/<name>.svg`. `--charts --check` exits 1
  if a committed SVG differs from the render. A tooling test runs the same comparison, so CI catches
  drift. The README bench section (inside the generated `bench:start/end` block) embeds the four
  SVGs, each with alt text that states the main number.
- D3 Colour (dataviz skill, palette validated with `validate_palette.js`): series in fixed order:
  baseline full = blue `#2a78d6`/`#3987e5`, fast full = orange `#eb6834`/`#d95926`, fast pr = aqua
  `#1baf7a`/`#199e70` (light/dark). Light, CVD worst ΔE 9.2: PASS. Aqua is 2.74:1 on the light surface
  (WARN), so every series has a direct label and the README tables stay. The step breakdown has its
  own three slots in the same order: checkout = blue, setup = orange, work = aqua. Dark mode uses
  `@media (prefers-color-scheme: dark)` inside each SVG with the dark steps and the dark surface `#1a1a19`.
  Text uses ink tokens, never the series colour.
- D4 Charts:
  1. `wall-time.svg`: one horizontal bar per pipeline (median wall time) with a p90 whisker, value
     labels, and the ratio (`4.98x`) in the title.
  2. `timeline.svg`: a Gantt chart of the median-wall-time run of each pipeline (baseline full, fast full,
     fast pr) as three stacked panels on one shared time axis. Jobs are bars from `start_s` to
     `start_s + wall_s`, with the critical path labelled.
  3. `runs.svg`: a dot plot of every run's wall time per pipeline (5 dots each), with the median tick.
  4. `steps.svg`: stacked bars per fast-pipeline job (checkout / setup / work, in medians) from the existing
     step-timing table, with a baseline bar for scale.
  Mark specs: thin bars, 2 px gaps, recessive grid, one axis per chart, a legend because each chart has 2 or more series.
- D5 Deterministic output: fixed width 720 px, no timestamps, numbers rounded as in the README
  tables, so the render is byte-stable and `--check` can compare.

## Acceptance criteria
1. Backfill: every job of the 15 runs in `bench/results.json` has a numeric `start_s >= 0`, and
   `start_s + wall_s <= run wall_s + 5`.
   Check: `bun test ./scripts/bench.test.ts -t start_s`
2. Each chart function returns a valid SVG (parses as XML, has `<title>` and `<desc>`, width 720), and contains
   one labelled mark per series. Check: `bun test ./scripts/charts.test.ts`
3. Chart values match the data: the wall-time medians and p90 in `wall-time.svg` equal `summarize()`
   (the README table numbers). Check: `bun test ./scripts/charts.test.ts -t values`
4. Committed SVGs equal the render. Check: `bun scripts/bench.ts --charts --check` (exit 0) and the tooling test.
5. The README bench section embeds all four with alt text, and `bun scripts/bench.ts --readme --check` passes.
   Check: `bun scripts/bench.ts --readme --check && grep -c 'bench/charts/' README.md` (>= 4)
6. Colour checks: the light and dark palettes pass `validate_palette.js`, and no series colour is used for text.
   Check: `check: seat cdo`
7. The charts read correctly on GitHub in light and dark themes, with no overlapping labels and the main number
   visible without the tables. Check: `check: seat cdo` (rendered screenshots of each SVG, both schemes)
8. The local gate and PR CI are green. Check: `bun test && bun run check && bun run lint && bun run fmt:check`; `pr-checks-wait.sh 4` exit 0
