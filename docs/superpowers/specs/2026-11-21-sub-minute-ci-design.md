# ci-fast-optimizer-setup — design

## Goal

Public showcase repo (github.com/alchristleo/ci-fast-optimizer-setup) proving, on real GitHub
Actions runs, that eight CI changes take a TypeScript backend's full pipeline under 60 s:

1. Vitest → `bun test`  2. tsc → `bun check`  3. oxlint → `bun lint` (see D4)  4. oxfmt → `bun fmt`
5. shards filled by recorded test time  6. PRs run only tests the diff can reach
7. backend app built once per process  8. lint, typecheck, build, tests in parallel jobs

Both pipelines run on the same code and same test files. README numbers come only from
`bench/results.json`, written by the bench script from GitHub API job/step timings.

## Non-goals

Frontend app, Docker, self-hosted runners, cache tuning beyond D5's install cache, dashboards,
per-claim ablation workflows, scheduled bench, badges, turbo/nx comparison (Backlog).
No team-scale claims ("200+ hours"): README gives a formula readers fill with their own numbers.

## Decisions

- **D1 Codebase:** small real API (Hono, runs on Node and Bun) with hand-written domain libs and
  tests, plus `scripts/gen.ts` (seeded, deterministic) that emits K generated domains (service,
  routes, tests) — committed. K tuned in T2 so baseline suite takes minutes. README says scaled.
  Scale (owner choice, after T3 review: a 1.5 s bun suite makes sharding a net loss): tests do
  real CPU work (fast-check property tests over domain services, pinned seeds, no sleeps) and the
  suite grows until serial `bun test` is ≈25–35 s locally (target ≈40–60 s on a 4-vCPU runner),
  so 4 time-filled shards pay off. App suite root is `test/`; tooling tests (`scripts/*.test.ts`)
  run via `bun run test:tooling`, outside benched test counts. fast-check seed and numRuns live in
  one shared config (seed printed on failure). Size by serial time on BOTH runtimes. Baseline
  vitest config stays default (isolate on, default pool/workers = runner vCPUs); whether AC2
  holds on the runner is a measured fact (T7/T9) — if not, stop and ask the owner.
- **D2 Test file compat** (one-way door: test source shape). Shapes: (a) tests import `bun:test`,
  vitest aliases `bun:test`→`vitest`; (b) tests import `vitest`, Bun resolves it natively.
  **pending: T1** (whichever works with zero per-file edits on both runners; (a) preferred).
- **D3 Build once per process:** one memoized `getTestApp()` helper. No knob: Vitest's default
  per-file isolation rebuilds it per file; `bun test` shares one module registry per process, so
  it builds once. `createApp()` does real-style boot work only, no busy loops (owner choice): compile every
  domain's request JSON schema (`fixtures/schema/<d>.json`) with ajv — the compiled validator is
  the only request-body validator its routes use (no separate hand-written Schema); build the
  router table; load seed fixtures (`fixtures/seed/<d>.json`) from disk, validate each row, and
  serve them as read-only reference data (`GET /<d>/catalog`). Seed read via `node:fs` with path
  from `import.meta.url`; parsed seed frozen, never mutated, so it needs no reset. The mutable
  store starts empty and `resetStore` clears it. One mapper turns ajv errors (allErrors:false)
  into the existing 400 error body. Seed deep-frozen at load; a row failing its schema makes boot
  throw. Catalog has one parametrized test over all domains (reset then GET still returns seed).
  Test count after this change is the new baseline, equal on both runners. Cost tuned via
  schema/fixture size. ajv version pinned exactly. Per-build cost measured and reported in README
  (tuned so local vitest ≥ 4× bun test, T2 rule); no target beyond that and increments a counter printed as `APP_BUILDS=<n>` at process exit.
- **D4 Lint tool:** pin newest **stable** Bun. If `bun lint` is stable there, use it; else keep
  oxlint in the fast pipeline and README says so. **pending: T1.** Same rule for `bun check`/`bun fmt`
  (fallback: tsc / oxfmt, flagged in README).
- **D5 Install:** both pipelines use `bun install --frozen-lockfile` (install is not one of the 8
  claims; one lockfile). Baseline runs tools on Node 22 via setup-node. Both pipelines cache
  `~/.bun/install/cache` with actions/cache keyed on `bun.lock` hash (owner choice). README states it.
- **D6 Baseline shape:** one job, serial steps: install → oxfmt check → oxlint → tsc → build →
  vitest (no sharding). `tsc` = TypeScript 5.9 (JS compiler, owner choice: the common "before");
  `bun check` in fast. TS 5.9 pinned exactly. README notes TS 7 native tsc closes most of this gap. Vitest default workers. The common "before" state.
- **D7 Shard timings storage** (shapes: committed file refreshed by bot PR / actions cache).
  Chosen: actions cache, written only on `push` to main (key `timings-<run_id>`, restore prefix
  `timings-`), fallback to committed `.ci/test-timings.json` (seeded once from T-measure run),
  then to equal file counts. No CI write access to the repo. Algorithm: LPT greedy (longest first
  into least-loaded shard), ties broken by path. Shard count N=4 (tuned in T2 measurement). Cache scoped per branch: PR/dispatch refs restore
  main's entry; 7-day idle eviction → falls back to committed file, which is refreshed manually
  (`bun run timings:update`) when stale.
- **D8 Affected tests:** `scripts/affected.ts --base <sha> --head <sha>` — reverse import graph over `src/`
  and `test/` (Bun.Transpiler.scanImports), walk from changed files to test files. Any change
  outside `src/`/`test/` except `*.md`/`docs/` (package.json, bun.lock, configs, scripts,
  workflows) → run all. Deleted files count as changed (graph built at base for them). Zero
  reachable tests → run none, job passes with a log line.
  **Barrel cut** (owner choice): reverse edges through the registry `src/domains/index.ts` are not
  walked; every domain test imports its own domain module, so a domain change selects its own
  tests plus real importers. `test/smoke/**` (boot, catalog over all domains, cross-domain
  flows) always runs on PRs to catch wiring breaks. README explains the cut and its risk.
  Smoke ≤ 3 files, no property tests, runs once (shard 0 / plan output), counted inside AC9's 20%.
  `src/domains/index.ts` and `src/app.ts` changes → run all. Cross-domain rule: a test file
  must import the domain module of every route prefix it requests (meta test enforces), so HTTP
  coupling is a real import edge. AC9 applies only to the fixed bench sample commit; README says so.
- **D9 Bench:** `scripts/bench.ts` run locally with the owner's `gh` auth (no CI token with write
  scope). Dispatches `baseline.yml` and `fast.yml` (`workflow_dispatch`, mode `full`) R=5 times
  each, interleaved, plus `fast.yml` mode `pr` on fixed sample diff branch `bench/pr-sample`.
  Metric per run: wall = last job `completed_at` − first job `started_at` (queue excluded, reported
  separately). Per-step table from jobs API. Writes `bench/results.json` and regenerates README
  between `<!-- bench:start -->`/`<!-- bench:end -->`. Median and p90.
- **D11 Pinning:** exact `bun-version` (no `latest`), recorded by T1 from `bun --help` on that
  version (check/lint/fmt present or fallback per D4). Node 22 exact minor for baseline.
- **D12 Empty sets:** shard count = min(N, files); a shard or affected run with zero files skips
  the `bun test` call explicitly (never calls `bun test` with no args = whole suite). Matrix built
  from a `plan` step output; empty → test job skipped, `ci-ok` (`if: always()`) passes only when
  skipped-because-empty, fails on any failed/cancelled/other-skipped need.
- **D13 Affected safety:** base = `git merge-base` of PR base SHA and head, `fetch-depth: 0`.
  Dispatch pr-mode takes explicit `base`/`head` inputs. `fixtures/**` change → run all (fs read invisible to import graph). Unresolvable or non-literal import,
  tsconfig path alias, or fs-read fixture under `test/fixtures` change → run all. Type-only import
  edges are included (scanned from source text, not transpiler output) — pending T1 check of
  scanImports; fallback is a regex import scanner.
- **D14 Shared state under bun test:** store reset in `beforeEach` via helper; tests must not keep
  module-level mutable state. `APP_BUILDS` written to a per-process file in `$APP_BUILDS_DIR`
  (`<pid>.txt`), not exit-hook stdout.
- **D15 Test API subset:** tests use only `describe`, `test`/`it`, `expect`, hooks, `test.each`;
  `src/` uses no `Bun.*` APIs (baseline runs on Node). Enforced by T1 + a grep test.
- **D16 Timings save:** a `timings` job (needs test shards, merges junit, saves cache) runs only on
  `push` to main. Benched runs are `workflow_dispatch`, so it never counts in wall time.
- **D17 Bench run correlation:** dispatch returns no run id → match by workflow, head SHA,
  `event=workflow_dispatch`, `created_at` after dispatch time; dispatch sequentially (wait for run
  to appear before next). Record run id, attempt, conclusion; exclude non-success, report count.
  Wall has ±1 s quantization; README says so. Workflow files live on main; `bench/pr-sample` is
  dispatched with `ref`.
- **D10 Workflow security:** triggers `push` (main), `pull_request`, `workflow_dispatch` only; no
  `pull_request_target`; top-level `permissions: contents: read`; third-party actions pinned by
  full SHA; no secrets used; `concurrency` cancels superseded PR runs.

## Design

```
src/app.ts            createApp() — registers routers, compiles validators, seeds store
src/lib/*             money, pricing, validation, ids (hand-written)
src/domains/<d>/*     service.ts, routes.ts (hand-written few + generated K)
test/support/app.ts   getTestApp() memoized, counter → APP_BUILDS
test/**               unit + route tests (app.request())
scripts/gen.ts        domain generator (seeded)
scripts/shard.ts      LPT sharding from timings → file list for shard i/N
scripts/affected.ts   diff → reachable test files
scripts/timings.ts    junit → timings json
scripts/bench.ts      dispatch, collect, results.json, README render, --check
.github/workflows/baseline.yml  fast.yml
```

fast.yml jobs, no `needs` among them: `fmt`, `lint`, `typecheck`, `build`, `test` (matrix 1..N;
on PR: affected list then shard). A final `ci-ok` job `needs` all (required check) — reported
separately, not in wall time beyond its own seconds.

## Acceptance criteria

1. Fast full pipeline (push/dispatch on main) median wall < 60 s and max ≤ 90 s over R≥5 runs
   (wall includes runner startup and install):
   `bun scripts/bench.ts --check fast_full_median_lt=60,fast_full_max_lte=90`
2. Baseline median wall ≥ 3× fast median: `bun scripts/bench.ts --check speedup_gte=3`
3. Both pipelines execute the same test files and pass the same test count in benched runs:
   `bun scripts/bench.ts --check same_tests`
4. LPT shard: unit + property tests (pinned seed) — every file in exactly one shard; max shard
   ≤ max(longest file, 1.15 × mean) on fixture; literal example: `bun test ./scripts/shard.test.ts`
5. Affected: domain-file change → that domain's tests + importers only; shared lib change → all
   dependents; config/workflow change → all; `*.md` only → none; deleted file → its dependents:
   `bun test ./scripts/affected.test.ts`
6. Build once: `bun test` process prints `APP_BUILDS=1` per shard; vitest run prints one build per
   test file using the app: `bun test ./scripts/build-once.test.ts` (spawns both runners on 3 files)
7. fast.yml: fmt/lint/typecheck/build/test jobs have no `needs`; baseline.yml is one job:
   `bun test ./scripts/workflows.test.ts`
8. Workflow security per D10 (no `pull_request_target`, read-only perms, SHA-pinned third-party
   actions, no secrets): `bun test ./scripts/workflows.test.ts`
9. PR mode on `bench/pr-sample` (one generated-domain service change) runs ≤ 20% of full test
   files and median wall < 60 s:
   `bun scripts/bench.ts --check pr_fewer_files,pr_median_lt=60`
10. README bench section equals render of `bench/results.json` (no hand numbers):
    `bun scripts/bench.ts --readme --check`
11. Local gate green: `bun run ci:local` (fmt check, lint, check, build, test, test:tooling)
14. Both checkers agree: TS 5.9 `tsc --noEmit` and `bun check` both pass at HEAD and on
    `bench/pr-sample`, same tsconfig: `bun run legacy:check && bun run check`
12. README explains each of the 8 changes with its measured effect, honest notes (scaled suite,
    shared install, any D4 fallback), and the hours-saved formula: check: seat panel-cdo
13. Real public runs exist: README links the Actions runs used in results.json: check: owner at gate

## Security notes

Public repo with fork PRs: `pull_request` runs with read-only token and no secrets (D10). Bench
uses owner's local `gh` token, only `actions:write` operations on own repo (dispatch, read). No
CI step writes to the repo; timings live in actions cache keyed from `push` events on main only,
so a fork PR cannot poison main's shard timings (PR runs restore but never save). Repo creation
is public on GitHub: done once in the scaffold task after this spec is approved.

## Base-run note

Repo is empty at spec time: every AC command is missing until the scaffold/feature tasks add it.
Commands are checked for shape in plan; first real run is in the task that adds each.

## Status (converged 2026-11-21)

Phase 1 (PR 1, base fd54e21, head b338313). No earlier status table existed.

| # | criterion (short) | verdict | evidence |
|---|---|---|---|
| 1 | fast full median < 60 s, max <= 90 s | INCONCLUSIVE | pending PR 2 (bench after merge). Context only: PR run fast = 45 s (ledger T7) |
| 2 | baseline >= 3x fast | INCONCLUSIVE | pending PR 2 (bench after merge). Context only: PR run baseline 203 s vs fast 45 s (ledger T7) |
| 3 | same tests both pipelines | INCONCLUSIVE | bench `--check same_tests` pending PR 2. Parity data from PR 1 CI (run 44924866835 fast, 44924866977 baseline): fast shards 475+487+463+628 = 2053 passed over 31+34+31+35 = 131 files; baseline `TESTS files=131 passed=2053`. Equal. Not a bench run |
| 4 | LPT shard | VERIFIED | `bun test ./scripts/shard.test.ts`: 7 pass, 0 fail |
| 5 | affected selection | VERIFIED | `bun test ./scripts/affected.test.ts`: 45 pass, 0 fail |
| 6 | build once | VERIFIED | `bun test ./scripts/build-once.test.ts`: 2 pass, 0 fail |
| 7 | fast jobs no needs; baseline one job | VERIFIED | `bun test ./scripts/workflows.test.ts`: 14 pass, 0 fail |
| 8 | workflow security D10 | VERIFIED | same run as AC7: 14 pass, 0 fail |
| 9 | PR mode <= 20% files, median < 60 s | INCONCLUSIVE | pending PR 2 (bench after merge); `bench/pr-sample` run missing |
| 10 | README equals render of results.json | INCONCLUSIVE | pending PR 2 (bench after merge); README and results.json land in PR 2 |
| 11 | local gate green | VERIFIED | `bun run ci:local`: 2053 pass 0 fail (131 files), tooling 90 pass 0 fail (6 files) |
| 12 | README content | INCONCLUSIVE | check: seat panel-cdo. Ledger `PANEL cdo skipped owner: README lands in PR 2`; pending PR 2 |
| 13 | public runs linked | INCONCLUSIVE | owner checks at merge gate; pending PR 2 |
| 14 | tsc 5.9 and bun check agree | VERIFIED at HEAD only | `bun run legacy:check && bun run check`: "No type errors in 400 files". `bench/pr-sample` half not run (branch not created until PR 2) |

Open findings: none. Ledger shows `TRIAGE fixed=17 dismissed=1 backlog=5`, `FIX wave 01be3f6`, `COORD ... re-review approve`; the one dismissed item (README stub) is owner-scoped to PR 2.

Deviations: none in commands run. AC3 parity uses PR CI logs, not the bench command. AC14 covers HEAD only.
