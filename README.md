# ci-fast-optimizer-setup

A small TypeScript backend with two GitHub Actions pipelines that run the same checks on the same code. `baseline.yml` is the common setup: one job, serial steps, Node tools. `fast.yml` applies eight changes. This repo exists to measure what those changes are worth on real runners, and to show the config.

On the benchmark below, the full fast pipeline has a median wall time of 44 s against 219 s for the baseline. Both run the same 131 test files and 2053 tests.

## Results

Every number in this section comes from `bench/results.json`. The script `scripts/bench.ts` dispatches each workflow on GitHub, reads job and step timings from the Actions API, and renders the tables below. Wall time is the last job's end minus the first job's start, so it includes runner startup and install but not queue time (shown separately). Five runs of each, dispatched one after another in the order baseline, fast, fast on the sample PR branch.

<!-- bench:start -->
| workflow | mode | runs | excluded | median wall (s) | p90 wall (s) | median queue (s) |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | full | 5 | 0 | 219 | 285 | 3 |
| fast | full | 5 | 0 | 44 | 55 | 3 |
| fast | pr | 5 | 0 | 34 | 38 | 3 |

Median seconds per step, successful full-mode runs (runner bookkeeping steps left out, shards grouped as one job):

| workflow | job | step | median (s) |
| --- | --- | --- | --- |
| baseline | test (baseline) | Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 | 1 |
| baseline | test (baseline) | Run actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 | 1 |
| baseline | test (baseline) | Run ./.github/actions/setup | 2 |
| baseline | test (baseline) | fmt | 0 |
| baseline | test (baseline) | lint | 0 |
| baseline | test (baseline) | typecheck | 5 |
| baseline | test (baseline) | build | 0 |
| baseline | test (baseline) | vitest | 205 |
| fast | tooling | Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 | 1 |
| fast | tooling | Run ./.github/actions/setup | 5 |
| fast | tooling | Run bun run test:tooling | 7 |
| fast | fmt | Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 | 1 |
| fast | fmt | Run ./.github/actions/setup | 3 |
| fast | fmt | Run bun run fmt:check | 0 |
| fast | lint | Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 | 1 |
| fast | lint | Run ./.github/actions/setup | 2 |
| fast | lint | Run bun run lint | 1 |
| fast | build | Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 | 1 |
| fast | build | Run ./.github/actions/setup | 3 |
| fast | build | Run bun run build | 0 |
| fast | typecheck | Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 | 1 |
| fast | typecheck | Run ./.github/actions/setup | 4 |
| fast | typecheck | Run bun run check | 0 |
| fast | plan | Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 | 1 |
| fast | plan | Run ./.github/actions/setup | 4 |
| fast | plan | Run actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 | 1 |
| fast | plan | Run set -euo pipefail | 0 |
| fast | test (shards) | Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 | 1 |
| fast | test (shards) | Run ./.github/actions/setup | 4 |
| fast | test (shards) | bun test | 12.5 |
| fast | test (shards) | Run actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 | 1 |
| fast | ci-ok | check needs | 0 |

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
5. **Shards balanced by recorded test time.** `scripts/shard.ts` assigns files to 4 shards, longest first into the least loaded shard. Timings come from the previous run on `main`, saved in the Actions cache, with `.ci/test-timings.json` as the fallback.
   ```yaml
   matrix: ${{ fromJSON(needs.plan.outputs.matrix) }}   # 4 shards of ~33 files
   ```
   Effect: shard job wall times in the first benchmark run were 17 to 26 s, so the slowest shard sets the test time.
6. **PRs run only the tests the diff can reach.** `scripts/affected.ts` builds a reverse import graph of `src/` and `test/`. It walks from the changed files to test files. Changes to config, workflows, scripts or `package.json` run everything. See the barrel note below.
   ```yaml
   bun scripts/affected.ts --base "$base" --head "$head" > affected.txt
   ```
   Effect: 8 files instead of 131. Median wall is 34 s instead of 44 s. The gain is small because setup, the plan job and the other parallel jobs cost the same in both modes.
7. **App built once per process.** `createApp()` compiles schemas and loads fixtures. A memoized `getTestApp()` runs it once per module registry. `bun test` shares one registry per process, so a shard builds the app once. Vitest isolates each file and builds it once per file (`scripts/build-once.test.ts` checks both).
   ```ts
   export function getTestApp(): Hono { app ??= createApp(); return app; }
   ```
   Effect: not measured separately. It is part of the gap in change 1.
8. **Lint, typecheck, build, tooling tests and test shards run as parallel jobs.** No job has a `needs` on another, except that test shards wait for `plan`. A final `ci-ok` job reports one result.
   ```yaml
   jobs: { plan: ..., fmt: ..., lint: ..., typecheck: ..., build: ..., tooling: ..., test: { needs: plan }, ci-ok: ... }
   ```
   Effect: the critical path is `plan`, then the slowest shard, then `ci-ok`. Every job pays its own checkout and setup (2 to 5 s each).

## Honest notes

- **The suite is scaled and generated.** There are 3 hand-written domains and 120 generated ones (`scripts/gen.ts`, seeded). The suite is sized so the baseline takes minutes. A real project of this size would be much larger or much smaller. The ratio here does not transfer to your repo.
- **Property-test run counts were chosen to hit a time target.** Tests use fast-check with a pinned seed. The value `RUNS = 4000` in `test/support/property.ts` (scaled 1 to 4 times per domain) was picked so the serial suite takes about 30 s locally. A different value moves both pipelines.
- **Both pipelines share the install cache.** Both use `bun install --frozen-lockfile` and cache `~/.bun/install/cache`. Install is not one of the eight changes.
- **`oxlint` stays.** `bun lint` is not in stable Bun 1.4.5. Change 3 is not applied.
- **The baseline type checker is TypeScript 5.9 (JS `tsc`).** TypeScript 7 native `tsc` would close most of the gap in change 2. The typecheck step is 5 s of a 219 s baseline, so this does not change the headline.
- **Fast runs more than the baseline.** The `tooling` job tests the scripts in this repo. It runs in parallel and the baseline does not run it. The app test files and the test count are identical (`same_tests` check).
- **The affected-test selection skips one edge on purpose.** Reverse edges through the registry `src/domains/index.ts` are not followed, or every domain change would select every test. A domain change selects its own tests, the tests that import it, and a 3-file smoke set. A change that breaks only the wiring in `index.ts` or `app.ts` runs everything. The risk is a wiring bug that only a non-selected test would catch, so the smoke set exists to cover that.
- **The 20% limit is measured only for the sample commit.** A change to a widely imported library file selects many more tests. `bench/pr-sample` is one fixed commit.
- **Timestamps have 1 s resolution.** Each step and each wall time can be off by about 1 s. Steps that show 0 s ran in under a second.
- **Runner variance is real.** Baseline wall times ran from 173 s to 285 s across five runs. The fast full runs ran from 42 s to 55 s. Read the p90 column together with the median.
- **Five runs are a small sample.** The runs are linked at the end so you can check them.

## What this saves you

The tables give seconds per run. Savings depend on how often your CI runs:

```
hours saved per week = runs per week x seconds saved per run / 3600
```

Seconds saved per run is the baseline median minus the fast median from the table above (219 - 44 = 175 s here). Use your own run count and your own measured seconds. This repo makes no claim about any team's total.

## Reproduce

Needs Bun 1.4.5, Node 22 and the `gh` CLI signed in to a fork of this repo.

```sh
bun install --frozen-lockfile
bun run ci:local                      # fmt, lint, check, build, tests, tooling tests
bun run legacy:check && bun run check # both type checkers agree
bun scripts/bench.ts run --runs 5     # dispatch both workflows; takes 30 to 40 minutes
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
- `scripts/bench.ts`: dispatch, collect, render and check. `bench/results.json`: raw results.
- `docs/t1-findings.md`: measured tool facts. `docs/superpowers/`: the spec and plan.

## Runs used

Each link is a GitHub Actions run listed in `bench/results.json`. Wall time in seconds is the link text.

- baseline full: [285 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44927113096), [282 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44927728691), [219 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928383240), [173 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928920396), [203 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929362671)
- fast full: [42 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44927546962), [51 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928190160), [43 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928739641), [44 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929199698), [55 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929706588)
- fast pr: [34 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44927640112), [35 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928294466), [38 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44928836833), [29 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929294822), [29 s](https://github.com/alchristleo/ci-fast-optimizer-setup/actions/runs/44929822176)

## License

MIT
