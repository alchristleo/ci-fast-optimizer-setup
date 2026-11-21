# ci-fast-optimizer-setup

A small TypeScript backend with two GitHub Actions pipelines that run the same checks on the same code. `baseline.yml` is the common setup: one job, serial steps, Node tools. `fast.yml` applies seven of eight changes and keeps oxlint for change 3. This repo exists to measure what those changes are worth on real runners, and to show the config.

On the benchmark below, the full fast pipeline has a median wall time of 44 s against 219 s for the baseline. Both run the same 131 test files and 2053 tests. Read this with the caveats. The ratio is about 5x (219 / 44) on a generated 131-file suite. The baseline uses one runner. The fast pipeline uses four test shards plus parallel jobs. The fast median is 44 s (p90 55 s). The baseline median is 219 s, with runs from 173 s to 285 s. See [Caveats](#caveats).

## Results

Every number in this section comes from `bench/results.json`. The script `scripts/bench.ts` dispatches each workflow on GitHub, reads job and step timings from the Actions API, and renders the tables below. Wall time is the last job's end minus the first job's start, so it includes runner startup and install but not queue time (shown separately). Five rounds, each dispatching baseline, then fast, then fast on the sample PR branch, one run at a time.

<!-- bench:start -->
Columns: mode `full` runs every test file and `pr` runs only the files the diff can reach (fast.yml on the branch `bench/pr-sample`). `excluded` counts runs that did not succeed and are left out of every statistic. Runner seconds are the sum of all job walls in a run, skipped jobs left out.

| workflow | mode | runs | excluded | median wall (s) | p90 wall (s) | median queue (s) | median runner (s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | full | 5 | 0 | 219 | 285 | 3 | 219 |
| fast | full | 5 | 0 | 44 | 55 | 3 | 152 |
| fast | pr | 5 | 0 | 34 | 38 | 3 | 116 |

Shard job wall range (fastest-slowest) in each fast full run: 17-26 s, 22-27 s, 20-26 s, 20-28 s, 17-28 s.

<details>
<summary>Median seconds per step, successful full-mode runs</summary>

Runner bookkeeping steps are left out and shards are grouped as one job.

| workflow | job | step | median (s) |
| --- | --- | --- | --- |
| baseline | test (baseline) | actions/checkout | 1 |
| baseline | test (baseline) | actions/setup-node | 1 |
| baseline | test (baseline) | ./.github/actions/setup | 2 |
| baseline | test (baseline) | fmt | 0 |
| baseline | test (baseline) | lint | 0 |
| baseline | test (baseline) | typecheck | 5 |
| baseline | test (baseline) | build | 0 |
| baseline | test (baseline) | vitest | 205 |
| fast | tooling | actions/checkout | 1 |
| fast | tooling | ./.github/actions/setup | 5 |
| fast | tooling | bun run test:tooling | 7 |
| fast | fmt | actions/checkout | 1 |
| fast | fmt | ./.github/actions/setup | 3 |
| fast | fmt | bun run fmt:check | 0 |
| fast | lint | actions/checkout | 1 |
| fast | lint | ./.github/actions/setup | 2 |
| fast | lint | bun run lint | 1 |
| fast | build | actions/checkout | 1 |
| fast | build | ./.github/actions/setup | 3 |
| fast | build | bun run build | 0 |
| fast | typecheck | actions/checkout | 1 |
| fast | typecheck | ./.github/actions/setup | 4 |
| fast | typecheck | bun run check | 0 |
| fast | plan | actions/checkout | 1 |
| fast | plan | ./.github/actions/setup | 4 |
| fast | plan | actions/cache/restore | 1 |
| fast | plan | set -euo pipefail | 0 |
| fast | test (shards) | actions/checkout | 1 |
| fast | test (shards) | ./.github/actions/setup | 4 |
| fast | test (shards) | bun test | 12.5 |
| fast | test (shards) | actions/upload-artifact | 1 |
| fast | ci-ok | check needs | 0 |

</details>

Generated from bench/results.json (generated_at 2026-11-21T17:24:34.855Z, bun 1.4.5, node 22.23.5).
<!-- bench:end -->

"pr" is `fast.yml` in affected-only mode on the branch `bench/pr-sample`, which has one small change to a generated domain service (`src/domains/generated/hubs/service.ts`). It ran 8 of the 131 test files (6%).

## The eight changes

1. **Vitest to `bun test`.** The tests import `bun:test`. Vitest runs the same files through an alias, so both pipelines use identical test source.
   ```ts
   // vitest.config.ts (baseline only)
   resolve: { alias: { "bun:test": "./test/support/bun-test.ts" } }
   ```
   Effect: the baseline `vitest` step has a median of 205 s. In `fast`, the `bun test` step in each of four shards has a median of 12.5 s. This compares one runner doing all the files against four runners doing a quarter each, so changes 1, 5 and 7 together produce it.

   The 205 s is much slower than the local numbers in `docs/t1-findings.md` (T10). That file records 28.3 s for serial `bun test`, 34.5 s for `vitest run` with default workers, and 62.3 s for `vitest run --maxWorkers=4`, all on a 20-core dev machine. The CI baseline runs vitest on a GitHub-hosted `ubuntu-latest` runner, which GitHub documents as 4 vCPUs for public repositories ([runner specs](https://docs.github.com/en/actions/using-github-hosted-runners/using-github-hosted-runners/about-github-hosted-runners#standard-github-hosted-runners-for-public-repositories)). That is far fewer cores than the dev machine. The 4-worker local run (62.3 s) is still about a third of the CI step, so slower runner cores probably explain the rest. That part is not measured. Local timings do not predict CI timings.
2. **`tsc` to `bun check`.** `bun check` is in Bun 1.4.5 and reads the same `tsconfig.json`.
   ```json
   "check": "bun check", "legacy:check": "tsc --noEmit"
   ```
   Effect: the baseline `typecheck` step takes 5 s at the median. The fast step rounds to 0 s. The difference is a few seconds at most.
3. **Linter.** The plan was to move `oxlint` to `bun lint`. Bun 1.4.5 has no `bun lint` (`docs/t1-findings.md`), so both pipelines run `oxlint`. This change is not applied, and it has no measured effect.
4. **`oxfmt` to `bun fmt`.**
   ```json
   "fmt:check": "bun fmt --check", "legacy:fmt": "oxfmt --check ."
   ```
   Effect: both steps round to 0 s. Both are far below the 1 s timestamp resolution.
5. **Shards balanced by recorded test time.** [`scripts/shard.ts`](scripts/shard.ts) assigns files to 4 shards, longest first into the least loaded shard. The workflow restores timings from the Actions cache, saved by a push run on `main`, and falls back to the committed `.ci/test-timings.json`.
   ```yaml
   matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}   # 4 shards of ~33 files
   ```
   What happened in the benchmark: the `plan` job logs of all 5 fast full runs restored `.ci/test-timings.json` from the cache via restore-key `timings-` (prefix match). The committed fallback file was not used. Every run restored the same cache entry, saved by an earlier push run on `main`. Only push runs save a new entry, because the `timings` job is skipped on dispatch. The bench dispatches did not refresh it. The shards were balanced by that recorded data, not by fresh data.

   Effect: within a run, the fastest and slowest shard differed by 5 to 11 s. The range line under the results table shows 17 to 28 s overall. The slowest shard sets the test time. The job wall includes checkout and setup, so the spread is not all test time.
6. **PRs run only the tests the diff can reach.** [`scripts/affected.ts`](scripts/affected.ts) builds a reverse import graph of `src/` and `test/`. It walks from the changed files to test files. Changes to config, workflows, scripts or `package.json` run everything. See the barrel note below.
   ```yaml
   bun scripts/affected.ts --base "$base" --head "$head" > affected.txt
   ```
   Effect: 8 files instead of 131. Median wall is 34 s instead of 44 s. The gain is small because setup, the plan job and the other parallel jobs cost the same in both modes.
7. **App built once per process.** `createApp()` compiles schemas and loads fixtures. A memoized `getTestApp()` runs it once per module registry. `bun test` shares one registry per process, so a shard builds the app once. Vitest isolates each file and builds it once per file (`scripts/build-once.test.ts` checks both).
   ```ts
   export function getTestApp(): Hono { app ??= createApp(); return app; }
   ```
   Effect: not measured separately. It is part of the gap in change 1.
8. **Lint, typecheck, build, tooling tests and test shards run as parallel jobs.** No job has a `needs` on another, except that test shards wait for `plan` and the push-only `timings` job waits for the shards. A final `ci-ok` job reports one result. `ci-ok` needs every job and fails if any required job did not succeed, so a branch protection rule needs only that one check.
   ```yaml
   jobs: { plan: ..., fmt: ..., lint: ..., typecheck: ..., build: ..., tooling: ..., test: { needs: plan }, ci-ok: ... }
   ```
   Effect: the critical path is `plan`, then the slowest shard, then `ci-ok`. Every job pays its own checkout and setup (2 to 5 s each).

## Caveats

- **The suite is scaled and generated.** There are 3 hand-written domains and 120 generated ones (`scripts/gen.ts`, seeded). The suite is sized so the baseline takes minutes. A real project of this size would be much larger or much smaller. The ratio here does not transfer to your repo.
- **Property-test run counts were chosen to hit a time target.** Tests use fast-check with a pinned seed. The value `RUNS = 4000` in `test/support/property.ts` (scaled 1 to 4 times per domain) was picked so the serial suite takes about 30 s locally. A different value moves both pipelines.
- **Both pipelines share the install cache.** Both use `bun install --frozen-lockfile` and cache `~/.bun/install/cache`. Install is not one of the eight changes.
- **The baseline type checker is TypeScript 5.9 (JS `tsc`).** I expect TypeScript 7 native `tsc` to close most of the gap in change 2. This is an expectation and is not measured here. The typecheck step is 5 s of a 219 s baseline, so this does not change the headline.
- **Fast runs more than the baseline.** The `tooling` job tests the scripts in this repo. It runs in parallel and the baseline does not run it. The app test files and the test count are identical (`same_tests` check).
- **The affected-test selection skips one edge on purpose.** Reverse edges through the registry `src/domains/index.ts` are not followed, or every domain change would select every test. A domain change selects its own tests, the tests that import it, and a 3-file smoke set. A change that breaks only the wiring in `index.ts` or `app.ts` runs everything. The risk is a wiring bug that only a non-selected test would catch, so the smoke set exists to cover that.
- **The 20% target for PR-mode test files is checked on one commit.** The target is that the sample PR runs at most 20% of the test files. Spec acceptance criterion 9 sets it. It ran 8 of 131 (6%). A change to a widely imported library file selects many more tests. `bench/pr-sample` is one fixed commit.
- **Timestamps have 1 s resolution.** Each step and each wall time can be off by about 1 s. Steps that show 0 s ran in under a second.
- **Runner variance is real.** Baseline wall times ran from 173 s to 285 s across five runs. The first two were the slowest (285 s and 282 s). The next three were 219 s, 173 s and 203 s. The cause is not investigated. The fast full runs ran from 42 s to 55 s. Read the p90 column together with the median.
- **Five runs are a small sample.** The runs are linked at the end so you can check them.

## What this saves you

The savings are developer wait time. The fast pipeline starts more jobs, each with its own checkout and setup. The "median runner (s)" column in the results table sums the job walls of a run (skipped jobs left out). Fast full is 152 s against 219 s for the baseline, and fast pr is 116 s. The fast runs use fewer runner seconds here, but the benefit to plan on is shorter waits. Public repositories run Actions for free. On private repositories GitHub rounds each job up to a whole minute ([billing](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions)), so eight short jobs can bill more minutes than one long one.

The tables give seconds per run. Savings in wait time depend on how often your CI runs:

```
hours saved per week = runs per week x seconds saved per run / 3600
```

Seconds saved per run is the baseline median minus the fast median from the table above (219 - 44 = 175 s here). Use your own run count and your own measured seconds. This repo makes no claim about any team's total.

## How to adopt

1. Copy [`.github/actions/setup/action.yml`](.github/actions/setup/action.yml). It installs Bun and caches the install.
2. Copy [`.github/workflows/fast.yml`](.github/workflows/fast.yml) and adjust the job commands to your scripts. The `plan` job picks the test files, builds the shard matrix and feeds the `test` job.
3. Copy [`scripts/shard.ts`](scripts/shard.ts) for sharding and [`scripts/affected.ts`](scripts/affected.ts) for PR selection. `affected.ts` follows imports under `src/` and `test/`, so adjust the roots for your layout.
4. Make `ci-ok` the one required check.
5. Measure your own suite before you trust the ratio here. [`scripts/bench.ts`](scripts/bench.ts) does that for both pipelines.

## Reproduce

Needs Bun 1.4.5, Node 22 and the `gh` CLI signed in to a fork of this repo.

```sh
bun install --frozen-lockfile
bun run ci:local                      # fmt, lint, check, build, tests, tooling tests
bun run legacy:check && bun run check # both type checkers agree
bun scripts/bench.ts run --runs 5     # dispatches 15 runs one at a time; the recorded runs total about 26 min of job time, plus queue and polling
bun scripts/bench.ts --check fast_full_median_lt=60,fast_full_max_lte=90
bun scripts/bench.ts --check speedup_gte=3
bun scripts/bench.ts --check same_tests
bun scripts/bench.ts --check pr_fewer_files,pr_median_lt=60
bun scripts/bench.ts --readme --check # README tables equal results.json
```

The bench script reads the repo from `gh`, or from the `BENCH_REPO=owner/name` variable. For the pr runs it needs a branch named `bench/pr-sample` with a small change to a generated service. Run `bun run gen` to regenerate the generated domains.

## File map

- `.github/workflows/fast.yml`, `baseline.yml`: the two pipelines. `.github/actions/setup`: Bun install and cache, shared.
- `src/`: the Hono app. `src/lib/`: shared code. `src/domains/`: hand-written and generated domains.
- `test/`: the app tests that both pipelines run. `scripts/*.test.ts`: tests of the tooling, run by the `tooling` job.
- `scripts/shard.ts`, `affected.ts`, `timings.ts`: sharding, affected selection, timing merge. `gen.ts`: domain generator.
- [`scripts/bench.ts`](scripts/bench.ts): dispatch, collect, render and check. `bench/results.json`: raw results.
- `docs/t1-findings.md`: measured tool facts. `docs/superpowers/`: the spec and plan.

## Runs used

Each link is a GitHub Actions run listed in `bench/results.json`. Wall time in seconds is the link text.

- baseline full: [285 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44927113096), [282 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44927728691), [219 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928383240), [173 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928920396), [203 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929362671)
- fast full: [42 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44927546962), [51 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928190160), [43 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928739641), [44 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929199698), [55 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929706588)
- fast pr: [34 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44927640112), [35 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928294466), [38 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928836833), [29 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929294822), [29 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929822176)

## License

MIT
