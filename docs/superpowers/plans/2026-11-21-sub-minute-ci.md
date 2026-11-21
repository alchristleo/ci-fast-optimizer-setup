# Plan: sub-minute CI showcase

Spec: `docs/superpowers/specs/2026-11-21-sub-minute-ci-design.md` (git show main:<spec>).
Repo: /home/leo/AI_STUFF/ci-fast-optimizer-setup. Smoke command: `bun run ci:local` (AC11).
Order: T1 → T2 → {T3, T4, T5, T8} parallel → T6 → T7 → T9.

## T1 — Settle tool facts (agent: sdd-implementer; network; depends-on: none)
Install the newest stable Bun to `~/.bun` (official installer) and Node 22 if missing. Write
`docs/t1-findings.md` with the command output behind each item:
- exact Bun version; whether `bun check`, `bun lint`, `bun fmt` exist in `bun --help` and run on
  a 2-file TS sample (settles D4, D11); flags: fmt check mode, lint config file it reads.
- D2: in a temp project, does vitest (Node 22) run a test importing `bun:test` via
  `resolve.alias` with zero edits; does `bun test` run a file importing `vitest`. Pick shape.
- D13: does `Bun.Transpiler.scanImports` return `import type` edges; if not, fallback scanner.
- `bun test` flags available for junit output (`--reporter=junit --reporter-outfile`) and passing
  explicit file lists.
Acceptance: findings file has one verdict line per item `D<n>: <choice> (evidence: <cmd>)`.
Temp projects live in the scratchpad dir, not the repo.

## T2 — Scaffold app + generator (agent: sdd-implementer; depends-on: T1)
Files: package.json (scripts: fmt, fmt:check, lint, check, build, test, test:vitest, gen,
ci:local, timings:update; legacy-tool scripts: `legacy:fmt` oxfmt, `legacy:lint` oxlint,
`legacy:check` tsc --noEmit, `legacy:test` vitest run), bun.lock, tsconfig.json, vitest.config.ts,
lint/fmt configs, `src/app.ts`, `src/lib/{money,pricing,validation,ids,store}.ts`,
3 hand-written domains `src/domains/{orders,inventory,customers}/{service,routes}.ts`,
`test/support/app.ts`, hand-written tests, `scripts/gen.ts`, generated domains (committed),
`.gitignore`, LICENSE (MIT).
Interfaces: `createApp(): Hono` (does D3 work, increments build counter, writes
`$APP_BUILDS_DIR/<pid>.txt` when env set); `getTestApp(): Hono` memoized; `resetStore(): void`
(beforeEach in helper); `gen.ts --domains K --seed S` deterministic.
Constraints: D14, D15 (no `Bun.*` in src/; test API subset), Hono only runtime dep. Generated
domains vary in shape (2–6 route handlers, 4–20 tests, some import 1–2 other domains or libs) so
the import graph is non-trivial and test times vary (LPT matters).
Tests: `bun test` and `vitest run` both green on same files with same test count; a grep test
`test/meta/api-subset.test.ts` fails on `Bun.` in src/ or non-subset imports in test/.
Tuning: pick K so local `legacy:test` (vitest) ≥ 4× `bun test` time and baseline-serial local
total ≥ 2 min; record K and timings in `docs/t1-findings.md` (section T2).
Smoke: `bun run ci:local` green.

## T3 — LPT shard (agent: sdd-implementer; depends-on: T2)
Files: `scripts/shard.ts`, `scripts/shard.test.ts`, `.ci/test-timings.json` (seeded from local
junit; refreshed in T7 from CI).
Interface: `planShards(files: string[], timings: Record<string, number>, n: number): string[][]`
(unknown files get median time; n capped at files.length; empty files → []);
CLI `bun scripts/shard.ts --index i --total n [--files-from list.txt]` prints files, one per line.
Tests (AC4): property (pinned seed, fast-check): each file in exactly one shard, shard count =
min(n, files); max load ≤ max(longest, 1.15×mean) on generated fixtures; literal example with
known output; empty input → no shards.

## T4 — Affected tests (agent: sdd-implementer; depends-on: T2)
Files: `scripts/affected.ts`, `scripts/affected.test.ts`, fixture repo builder in test.
Interface: `affectedTests(changed: {path, status}[], graph: ImportGraph): {mode:"all"|"some", files: string[]}`;
`buildGraph(root): ImportGraph`; CLI `bun scripts/affected.ts --base <sha> --head <sha>` prints
`all` or file list (uses `git diff --name-status <merge-base>..head`).
Tests (AC5): domain change → own tests + importers; lib change → all dependents; package.json /
workflow / scripts / config → all; md-only → none; deleted file → dependents (graph at base);
type-only import edge counted; non-literal import → all. Use the real generated tree's shapes.

## T5 — Build-once proof + junit timings (agent: sdd-implementer; depends-on: T2)
Files: `scripts/build-once.test.ts`, `scripts/timings.ts` (+ test).
`timings.ts merge <junit...> > timings.json`: per-file ms summed across testcases.
Test (AC6): spawn `bun test` on 3 app-using files with `APP_BUILDS_DIR` → one pid file, value 1;
spawn vitest on same 3 → total builds = 3.
Timings test: literal junit sample from both `bun test` and vitest reporters → expected map.

## T8 — Bench script (agent: sdd-implementer; depends-on: T2)
Files: `scripts/bench.ts`, `scripts/bench.test.ts`, `bench/results.json` (empty schema), README
markers section.
Interface: `bench.ts run --runs R` (dispatch per D9/D17 via `gh api`), `--check <expr,...>`
(AC1,2,3,9 exprs from spec), `--readme [--check]` (render/verify README between markers).
results.json: `{generated_at, bun, node, runs:[{workflow, mode, run_id, attempt, url, conclusion,
created_at, queue_s, wall_s, jobs:[{name, wall_s, steps:[{name, s}]}], test_files, tests_passed}]}`.
Tests: pure functions only — wall/queue calc from real-shaped jobs API JSON fixture (copy shape
from GitHub docs), median/p90, run correlation picks right run among decoys, checks pass/fail
on fixtures, README render idempotent (render twice = same), non-success runs excluded+counted.
test_files/tests_passed: parsed from a `::notice::TESTS files=<n> passed=<n>` line each test job
prints (T6 emits it) via jobs logs API.

## T6 — Workflows (agent: sdd-implementer; depends-on: T3, T4, T5, T8)
Files: `.github/workflows/baseline.yml`, `.github/workflows/fast.yml`, `scripts/workflows.test.ts`.
Per spec D5–D7, D10, D12, D13, D16. fast.yml: `plan` job (affected + shard matrix output; fast,
no install if possible) → fmt, lint, typecheck, build, test[matrix] (no needs on each other except
test needs plan) → `ci-ok` (if: always()) and `timings` (push to main only). Dispatch inputs:
`mode` (full|pr), `base`, `head`. Both emit TESTS notice line.
Note: test needing `plan` is the one allowed `needs`; AC7 test allows exactly that edge.
Tests (AC7, AC8): parse YAML (yaml lib): no needs among fmt/lint/typecheck/build; test needs only
plan; baseline single job; no pull_request_target; top-level permissions contents: read only;
every `uses:` not under `actions/` org pinned to 40-hex SHA (actions/* also pinned); no `secrets.`.
Validate with `actionlint` if available (install in task).

## T7 — Publish + first CI runs (agent: sdd-implementer; network; depends-on: T6)
Create PUBLIC repo `alchristleo/ci-fast-optimizer-setup` (`gh repo create --public --source .
--push`), owner-approved at spec gate. Watch first push runs of both workflows to green (fix
failures in workflow/test code only). Download test junit artifacts, refresh
`.ci/test-timings.json` from CI times, commit. Create branch `bench/pr-sample` with one
generated-domain service change (commit), push. Dispatch fast mode=pr once on it; verify fewer
test files ran. Report run URLs.

## T9 — Bench + README (agent: sdd-implementer; network; depends-on: T7)
`bun scripts/bench.ts run --runs 5` (+ pr mode 5). Run all `--check`s (AC1,2,3,9). If AC1/AC2
fail: report numbers and stop (owner decides tuning: K, N, jobs). README full write: what/why,
the 8 changes each with config snippet + measured effect (per-step table baseline vs fast),
headline table, honest notes (scaled suite, shared install cache, D4 fallback if any, ±1 s
quantization, runner variance), hours-saved formula, reproduce section (`bench.ts run`), links
to runs. `--readme --check` green (AC10). Push to main.

## Backlog
- Scheduled weekly bench re-run + badge
- Per-claim ablation workflows (one change at a time)
- turbo/nx comparison; frontend app
- Blog-post write-up

## Ledger
USAGE start 24
PLAN written 9 tasks
T1 done 3412ab1 sdd-implementer bun 1.4.5 stable: check+fmt yes, lint no -> oxlint; D2 alias ok; scanImports drops type edges
T1 fix 3412ab1 sdd-reviewer-lite fix-needed unsourced installer/canary claim, D4 lint + D11 pin lines missing, no trailers
T1 coord 7a634cb findings fixes per review
T1 done 7a634cb sdd-reviewer-lite coord re-review approve
T2 fix f0370db sdd-reviewer fix-needed D3 busy loop, D6 TS7, gen fmt scope
T2 fix 3c7fc9e sdd-reviewer-lite fix-needed seed cleared by reset, ajv validators not used on requests
T2 fix c9b0040 sdd-reviewer-lite fix-needed dead code in validation.ts; owner chose coord fix past cap
T2 coord e4d53f2 drop dead validator code, unknown-field test; count 1520 both runners
