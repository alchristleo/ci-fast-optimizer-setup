# Backlog cleanup (milestone 2)

## Goal
Close the small items from the milestone-1 Backlog without changing what CI does: the same files
are selected, the shards are the same and the job results are the same.

## Non-goals
- Weekly bench + badge, per-claim ablation, turbo/nx comparison, frontend app, blog post (they stay in the Backlog).
- New bench numbers. README numbers were measured on the old plan step and are not re-measured.
- Any change to which tests run or how they are sharded.

## Already done (struck from Backlog, no work)
- bench.ts repo slug override: `BENCH_REPO` exists (scripts/bench.ts:283).
- smoke catalog count: test/smoke/catalog.test.ts:14 already uses `domains.length`.

## Decisions
- D1 plan.ts: the fast.yml `plan` step becomes `bun scripts/plan.ts`, which reads the same env vars
  (EVENT, IN_MODE, IN_BASE, IN_HEAD, PR_BASE) and writes `count` and `matrix` to `$GITHUB_OUTPUT`.
  It calls `planShards` in-process (one call, n = min(4, total)) and does not run the shard.ts CLI
  once per index. Pure core `planMatrix(files, timings, maxShards)` returns `{ count, matrix }`.
  It runs affected.ts selection in-process too (main logic split into an exported function).
  Shape considered: keep bash and only move the loop into the script (rejected: the mode/env
  branching is the untested part).
  Old matrix entries: `files` is the space-joined list with a trailing space (`tr '\n' ' '`). The
  test job splits it with `read -ra`, so a trailing space is harmless; the new matrix drops it.
  This is the one allowed difference.
- D2 ci-ok: a step `if: contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')`
  runs `exit 1`. A `test` job skipped because `count == 0` gives `skipped`, which passes; a test skip
  caused by a failed plan already shows `failure` from plan. A skip of fmt/lint/typecheck/build/
  tooling cannot happen while they have no `if` and no `needs`; workflows.test.ts asserts that, so a later edit
  that adds one fails the test. Same results as today.
- D3 affected.ts: `affectedTests` returns `string[] | "all"`. The list is the sorted non-smoke
  files followed by the sorted smoke files (the order the CLI prints today). `Affected` type goes.
  CLI stdout unchanged. Shape considered: keep `{files, smoke}` (rejected by the design seat in
  milestone 1: callers only concatenate).
- D4 gen.ts: `--seed` flag removed, `const SEED = 1` in gen.ts; `--domains` stays. Output unchanged.
- D5 bench guard: before a `pr`-mode dispatch, bench.ts calls the GitHub compare API
  (`repos/<repo>/compare/main...bench/pr-sample`) and stops with `bench/pr-sample is stale: rebase it on main`
  unless `behind_by == 0`. A fast.yml blob compare was rejected (pre-mortem): after D1 the pipeline also
  runs the branch's own scripts/ and setup action. Pure check `assertUpToDate(behindBy)`.
  Release note: after this merge bench/pr-sample is behind main, so rebase it before the next bench run.
- D6 file order: plan.ts lists `test/**/*.test.ts` and sorts it by code unit (JS default sort), not the
  locale `sort` of the old bash. LPT orders by time and then by path, so the input order does not change shards;
  the AC2 equivalence test feeds the same ordered list to both paths.
- D7 deleted tests: `selectFiles` keeps the old CLI filter that drops listed tests missing at head
  (a deleted or renamed-away test), so plan.ts never hands `bun test` a missing path.

## Design
New `scripts/plan.ts` + `scripts/plan.test.ts`; fast.yml plan step shrinks to one `run:` line plus env.
`affected.ts` exports `selectFiles(base, head, cwd)` (the current `main` body minus printing), used by
both its CLI and plan.ts. README "Files" list names plan.ts.

## Acceptance criteria
1. plan.ts unit tests pass: push → full, pull_request → pr with PR_BASE, dispatch full, dispatch pr,
   dispatch pr with empty base or head exits non-zero with `pr mode needs base and head`,
   0 files → `count=0` and `{"include":[]}`, 3 files → 3 shards, 131 files → 4 shards,
   a test deleted at head is not in the matrix (D7).
   Check: `bun test ./scripts/plan.test.ts`
2. Equivalence: for the repo's real test list (`find test -name '*.test.ts' | sort`) and lists of 0, 1, 3
   and 5 files, with the committed `.ci/test-timings.json`, `planMatrix` shard i equals the
   `bun scripts/shard.ts --index i --total n --files-from` output (old path), for every i.
   Check: `bun test ./scripts/plan.test.ts -t equivalence`
3. fast.yml plan step runs `bun scripts/plan.ts`, with no `jq`, `seq` or `scripts/shard.ts` left in fast.yml.
   Check: `bun test ./scripts/workflows.test.ts && ! grep -nE 'jq |seq |scripts/shard.ts' .github/workflows/fast.yml`
4. ci-ok uses the `contains(needs.*.result, ...)` idiom and has no per-job result env vars; fmt, lint,
   typecheck, build and tooling have no `if` and no `needs` (test asserts).
   Check: `bun test ./scripts/workflows.test.ts -t ci-ok && ! grep -n 'needs.fmt.result' .github/workflows/fast.yml`
5. No-op PR run passes: fast.yml dispatched on the pushed branch with `mode=pr`, base = head = branch sha
   gives plan `count=0`, test job `skipped`, ci-ok `success`, run conclusion `success`.
   Check: dispatch via `gh api -X POST repos/<repo>/actions/workflows/fast.yml/dispatches --input <json>`, then `gh run view <id> --json jobs`
6. affected: `affectedTests` returns `string[] | "all"`; tests pass; CLI stdout is identical between
   `main` and the branch on synthetic commits (a domain service, a lib file, README only, a smoke test,
   all of them, no change). On base these pairs print 7, 33, 0, 5, 34 and 0 lines.
   Check: `bun test ./scripts/affected.test.ts`, then this script prints nothing:

```bash
#!/usr/bin/env bash
# Old (main) vs new (working tree) affected.ts CLI on synthetic commits. No output = equal.
set -euo pipefail
repo=$(git rev-parse --show-toplevel); tmp=$(mktemp -d)
mkdir -p "$tmp/old" "$tmp/new"
git -C "$repo" archive main scripts | tar -x -C "$tmp/old"
cp -r "$repo/scripts" "$tmp/new/"
git -C "$repo" worktree add -q --detach "$tmp/wt" main
cd "$tmp/wt"
c0=$(git rev-parse HEAD)
edit() { echo "// parity" >> "$1"; git -c core.hooksPath=/dev/null -c user.name=p -c user.email=p@p commit -qam "$1"; git rev-parse HEAD; }
c1=$(edit src/domains/customers/service.ts)
c2=$(edit src/lib/money.ts)
c3=$(edit README.md)
c4=$(edit test/smoke/catalog.test.ts)
for p in "$c0 $c1" "$c1 $c2" "$c2 $c3" "$c3 $c4" "$c0 $c4" "$c0 $c0"; do
  set -- $p
  diff <(bun "$tmp/old/scripts/affected.ts" --base "$1" --head "$2") <(bun "$tmp/new/scripts/affected.ts" --base "$1" --head "$2") || echo "DIFF $p"
done
cd "$repo"; git worktree remove --force "$tmp/wt"; rm -rf "$tmp"
```
7. gen: no `--seed` in package.json or gen.ts, and regeneration is byte-identical.
   Check: `! grep -n -- '--seed' package.json scripts/gen.ts && bun run gen && git diff --exit-code -- src test fixtures`
8. bench guard: `assertUpToDate` throws with the rebase message when behind_by > 0 and passes at 0.
   Check: `bun test ./scripts/bench.test.ts -t assertUpToDate`
9. Full local gate and PR CI green.
   Check: `bun test && bun run check && bun run lint && bun run fmt:check`, then `pr-checks-wait.sh <pr>` exit 0
10. Milestone-1 plan Backlog no longer lists the 7 cleanup items.
    Check: `! sed -n '/^## Backlog/,/^## Ledger/p' docs/superpowers/plans/2026-11-21-sub-minute-ci.md | grep -nE 'plan.ts|contains\(needs|flatter|--seed|pr-sample|toBe\(123\)|repo slug'`

## Security notes
fast.yml keeps `permissions: contents: read` and pinned action shas. Inputs keep going through env
vars, never `${{ }}` inside `run:`. plan.ts passes base/head to git through `execFileSync` argv (no shell).
`pull_request` from forks runs with a read-only token. plan.ts writes only `$GITHUB_OUTPUT`.

## Status (converged 2026-11-22)

Branch `backlog-cleanup` at f2817c4, base f4853a0 (equals `main`). No earlier status table.

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| 1 | plan.ts unit tests | VERIFIED | `bun test ./scripts/plan.test.ts`: 19 pass, 0 fail |
| 2 | planMatrix equals shard.ts old path | VERIFIED | `bun test ./scripts/plan.test.ts -t equivalence`: 5 pass, 14 filtered out, 0 fail |
| 3 | fast.yml runs plan.ts, no jq/seq/shard.ts | VERIFIED | `bun test ./scripts/workflows.test.ts`: 17 pass; grep for `jq \|seq \|scripts/shard.ts` finds nothing (exit 0) |
| 4 | ci-ok idiom, no per-job env, no if/needs on gate jobs | VERIFIED | `bun test ./scripts/workflows.test.ts -t ci-ok`: 2 pass; grep `needs.fmt.result` finds nothing |
| 5 | No-op PR dispatch run passes | VERIFIED | run 45003571001 at f2817c4 (dispatch mode=pr, base=head): plan log `mode=pr files=0 shards=0`, test job skipped, ci-ok success, run conclusion success |
| 6 | affectedTests shape, CLI parity | VERIFIED | `bun test ./scripts/affected.test.ts`: 46 pass; parity script (main vs working tree, 6 pairs) printed nothing, exit 0. The base line counts (7, 33, 0, 5, 34, 0) were not separately printed |
| 7 | gen: no `--seed`, byte-identical | VERIFIED | grep finds no `--seed`; `bun run gen` printed "generated 120 domains (seed 1)"; `git diff --exit-code -- src test fixtures` exit 0 |
| 8 | assertUpToDate | VERIFIED | `bun test ./scripts/bench.test.ts -t assertUpToDate`: 3 pass, 0 fail |
| 9 | Local gate and PR CI | VERIFIED | Local half passes: `bun test` 2053 pass, 0 fail; `bun run check` no type errors; `bun run lint` exit 0; `bun run fmt:check` exit 0. PR #4 CI: `pr-checks-wait.sh 4` exit 0 at head f2817c4 (plan, fmt, lint, typecheck, build, tooling, 4 shards, ci-ok, baseline all pass) |
| 10 | Milestone-1 Backlog cleared | VERIFIED | `! sed -n '/^## Backlog/,/^## Ledger/p' ...sub-minute-ci.md \| grep -nE '...'` exit 0, no match |

Deviations: none in commands.
Open findings: none. Panel: security should=1 and correctness nit=2 fixed in the fix wave (0fd7d3e); one PRE-EXISTING security item (CODEOWNERS) went to the Backlog.
