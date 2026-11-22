# Plan: backlog cleanup (milestone 2)

Spec: `docs/superpowers/specs/2026-11-22-backlog-cleanup-design.md`. Base: `main` f4853a0.
Parallel group A: T1, T2, T3 (no shared files). Then T4 → T5 → T6.
Local gate for every task: `bun test && bun run check && bun run lint && bun run fmt:check`.

## T1 — affected.ts: selectFiles + flat shape (agent: sdd-implementer; depends-on: none)
Files: scripts/affected.ts, scripts/affected.test.ts.
Interfaces: `affectedTests(changed, graph): string[] | "all"` (non-smoke sorted, then smoke sorted);
`selectFiles(base: string, head: string, cwd?: string): string[] | "all"` = current `main` body minus
printing, including the `existsSync` filter on the returned list (D7). CLI prints `all` or the list.
`Affected` type removed (grep `Affected\b` in scripts/ = 0 hits).
Tests: existing tests rewritten to the flat shape (smoke listed once, after files); new
`selectFiles drops a test deleted at head` (temp git repo fixture as in the existing CLI tests).
Check: spec AC6 (parity script prints nothing).

## T2 — gen.ts seed constant (agent: sdd-implementer-lite; depends-on: none)
Files: scripts/gen.ts, package.json. `--seed` removed, `const SEED = 1`. Header comment updated.
Check: spec AC7.

## T3 — bench guard (agent: sdd-implementer; depends-on: none)
Files: scripts/bench.ts, scripts/bench.test.ts.
Interface: `export function assertUpToDate(behindBy: number): void` throws
`bench/pr-sample is stale: rebase it on main` when behindBy > 0. Wired in `dispatchOne` for mode `pr`:
`ghJson([\`repos/${REPO}/compare/main...${PR_BRANCH}\`]).behind_by`.
Tests: `assertUpToDate` throws at 1, passes at 0. Check: spec AC8.

## T4 — plan.ts + fast.yml plan step (agent: sdd-implementer; depends-on: T1)
Files: scripts/plan.ts, scripts/plan.test.ts, .github/workflows/fast.yml (plan step only), scripts/workflows.test.ts.
Interfaces: `planMatrix(files: string[], timings: Record<string, number>, maxShards = 4): { count: number; matrix: { include: { shard: number; files: string }[] } }`
(files = space-joined, no trailing space); `resolveMode(env): { mode: "full" | "pr"; base: string; head: string }`
(throws `pr mode needs base and head`); CLI reads env (EVENT, IN_MODE, IN_BASE, IN_HEAD, PR_BASE),
`git rev-parse HEAD` for head, `.ci/test-timings.json` (missing → {}), lists `test/**/*.test.ts`
code-unit sorted (D6) for full / `selectFiles` result "all", logs `mode=… files=… shards=…`, appends
`count=` and `matrix=` lines to `$GITHUB_OUTPUT`. Git via execFileSync argv only.
Tests: spec AC1 cases + AC2 equivalence (old path = `bun scripts/shard.ts --index i --total n --files-from <tmp list>`
on the real test list and on 0/1/3/5-file lists, with committed timings); workflows.test.ts: plan step
runs `bun scripts/plan.ts`, no `jq`/`seq`/`scripts/shard.ts` in fast.yml, inputs only via env.
Check: spec AC1, AC2, AC3.

## T5 — ci-ok idiom (agent: sdd-implementer-lite; depends-on: T4)
Files: .github/workflows/fast.yml (ci-ok job only), scripts/workflows.test.ts.
ci-ok: `needs` unchanged, `if: always()`, one step `if: contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')` → `exit 1`
(plus an echo step so the job has a success step). Tests: ci-ok uses the idiom, no `needs.<job>.result`
env; fmt/lint/typecheck/build/tooling have no `if` and no `needs`. Check: spec AC4.

## T6 — docs + backlog (agent: sdd-implementer-lite; depends-on: T5)
Files: README.md (Files list + "copy" step name plan.ts), docs/superpowers/plans/2026-11-21-sub-minute-ci.md
(Backlog: remove the 7 cleanup items, add one line "cleanup items → 2026-11-22-backlog-cleanup.md").
Check: spec AC10.

## Part 2: bench charts (spec `docs/superpowers/specs/2026-11-22-bench-charts-design.md`)
Parallel group B: T7, T8. Then T9.

## T7 — backfill job start_s (agent: sdd-implementer; network; depends-on: none)
Files: scripts/bench.ts, scripts/bench.test.ts, bench/results.json.
Interfaces: `export function jobStarts(jobs: ApiJob[], runCreatedAt: string): Record<string, number>`
(name -> seconds from run created_at, null started_at skipped, negative clamped to 0); `BenchRun.jobs[i].start_s?: number`;
`dispatchOne` records start_s from now on; CLI `bun scripts/bench.ts backfill-starts` fetches
`repos/<repo>/actions/runs/<id>/jobs` per run, asserts attempt 1, writes results.json once at the end.
Tests: `jobStarts` literal example (real-shaped API job objects), null skip, clamp; `start_s` invariant test over
the committed results.json (spec AC1). Run the backfill once and commit results.json. Check: spec AC1.

## T8 — charts.ts (agent: sdd-implementer; depends-on: none)
Files: scripts/charts.ts, scripts/charts.test.ts.
Interfaces: `wallTime(res, theme)`, `timeline(res, theme)`, `runs(res, theme)`, `steps(res, theme)` -> SVG string;
`theme: "light" | "dark"`; `CHARTS: Record<string, (res, theme) => string>`. Reuse `summarize`, `median` from bench.ts
(export what is needed; no copy). Fixture: a results.json-shaped object with `start_s` on jobs (real names:
test (baseline), plan, fmt, lint, typecheck, build, tooling, test (shard N), ci-ok).
Follow spec D3-D5 (palette hexes, ink tokens, 720 px, toFixed, LF, trailing newline, direct labels, legend).
Tests: spec AC2, AC3 (values = summarize()), byte-determinism (two renders equal). Check: spec AC2, AC3.

## T9 — wire charts, README, CI drift check (agent: sdd-implementer; depends-on: T7, T8)
Files: scripts/bench.ts (`--charts`, `--charts --check`, README section embeds `<picture>`), scripts/bench.test.ts
(tooling test: committed SVGs == render), bench/charts/*.svg (8), README.md (regenerated section),
.oxfmtrc.json / oxlint config ignore `bench/charts`, .gitattributes (`*.svg text eol=lf`).
Check: spec AC4, AC5, AC8 (local half). Render each SVG to PNG for the cdo seat if a tool exists (e.g. `rsvg-convert`,
`bunx playwright`), else say so.

## Backlog
- Scheduled weekly bench re-run + badge
- Per-claim ablation workflows (one change at a time)
- turbo/nx comparison; frontend app
- Blog-post write-up
- CODEOWNERS + required review on .github/ and scripts/: a fork PR runs its own fast.yml/plan.ts and can rewrite ci-ok (PRE-EXISTING, panel security)

### Checks
- git calls with base/head: `--end-of-options` or a SHA regex check (panel security, hardening)

## Ledger
USAGE start 3
PLAN written 6 tasks
T3 review approve bb2cc67 sdd-reviewer assertUpToDate + compare wiring
T3 done bb2cc67 sdd-implementer bench guard
T2 review approve cb0fe1c sdd-reviewer-lite AC7 byte-identical
T2 done cb0fe1c sdd-implementer-lite seed constant
T1 review approve f338f5d sdd-reviewer parity clean, no weakened asserts
T1 done f338f5d sdd-implementer selectFiles + flat shape
T4 review approve 484d8e2 sdd-reviewer parity ok; should: CLI output untested
T4 coord a686881 CLI GITHUB_OUTPUT test
T4 done a686881 sdd-reviewer-lite coord re-review approve
T5 fix 25d97d2 sdd-reviewer-lite fix-needed no-if assertion missing
T5 coord eac8424 add no-if assertion
T5 done eac8424 sdd-reviewer-lite re-review approve, red-checked
T6 coord d097eb7 README ci-ok skip wording
T6 done d097eb7 sdd-reviewer-lite approve (one misread finding withdrawn on recheck)
PANEL design skipped <300 lines new non-test code
PANEL security df2e140 must=0 should=1 nit=0
PANEL correctness df2e140 must=0 should=0 nit=2
TRIAGE fixed=3 dismissed=0 backlog=1
FIX wave 0fd7d3e sdd-implementer whitespace throw, glob dot, bench fail-closed; re-review sdd-reviewer-lite approve
PR 4 opened f2817c4
CONVERGE 10/10 VERIFIED (AC5, AC9 filled from CI by coordinator)
PLAN part 2 charts: T7-T9
T7 fix 4cbc5ed sdd-reviewer fix-needed jobStarts test expectation 40 vs 51
T7 coord 5d10a3a fix expectation
T7 done 5d10a3a sdd-reviewer-lite re-review approve; gate gap: bun test skips scripts/ (bunfig root=test)
