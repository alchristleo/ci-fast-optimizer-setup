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
  store starts empty and `resetStore` clears it. Cost tuned via schema/fixture size. ajv version pinned exactly. Per-build cost measured and reported in README
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
- **D8 Affected tests:** `scripts/affected.ts <base> <head>` — reverse import graph over `src/`
  and `test/` (Bun.Transpiler.scanImports), walk from changed files to test files. Any change
  outside `src/`/`test/` except `*.md`/`docs/` (package.json, bun.lock, configs, scripts,
  workflows) → run all. Deleted files count as changed (graph built at base for them). Zero
  reachable tests → run none, job passes with a log line.
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
  Dispatch pr-mode takes explicit `base`/`head` inputs. `fixtures/seed/**` change → run all (fs read invisible to import graph). Unresolvable or non-literal import,
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

1. Fast full pipeline (push/dispatch on main) median wall < 60 s over R≥5 runs:
   `bun scripts/bench.ts --check fast_full_median_lt=60`
2. Baseline median wall ≥ 3× fast median: `bun scripts/bench.ts --check speedup_gte=3`
3. Both pipelines execute the same test files and pass the same test count in benched runs:
   `bun scripts/bench.ts --check same_tests`
4. LPT shard: unit + property tests (pinned seed) — every file in exactly one shard; max shard
   ≤ max(longest file, 1.15 × mean) on fixture; literal example: `bun test scripts/shard.test.ts`
5. Affected: domain-file change → that domain's tests + importers only; shared lib change → all
   dependents; config/workflow change → all; `*.md` only → none; deleted file → its dependents:
   `bun test scripts/affected.test.ts`
6. Build once: `bun test` process prints `APP_BUILDS=1` per shard; vitest run prints one build per
   test file using the app: `bun test scripts/build-once.test.ts` (spawns both runners on 3 files)
7. fast.yml: fmt/lint/typecheck/build/test jobs have no `needs`; baseline.yml is one job:
   `bun test scripts/workflows.test.ts`
8. Workflow security per D10 (no `pull_request_target`, read-only perms, SHA-pinned third-party
   actions, no secrets): `bun test scripts/workflows.test.ts`
9. PR mode on `bench/pr-sample` runs fewer test files than full and median wall < 60 s:
   `bun scripts/bench.ts --check pr_fewer_files,pr_median_lt=60`
10. README bench section equals render of `bench/results.json` (no hand numbers):
    `bun scripts/bench.ts --readme --check`
11. Local gate green: `bun run ci:local` (fmt check, lint, check, build, test)
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
