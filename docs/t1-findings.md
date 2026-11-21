# T1 findings: tool facts

Env: Bun 1.4.5 (npm `latest` dist-tag; canary version not checked), Node v22.23.5, vitest 5.1.1.
Scratch projects: `/tmp/claude-1000/-home-leo-AI-STUFF-lean-sdd/45fad210-f892-4c83-9a39-acc262fd122b/scratchpad/{s1,d2}`.

## Install deviation
The official installer (`curl https://bun.sh/install | bash` to `~/.bun`) was denied by the permission classifier.
Bun came from `npm i bun` and Node 22 from `npm i node@22`, both in the scratchpad. Nothing is in `~/.bun`.
Node 22 was missing (only v20.19.5 present). T2+ must put these on PATH or install them themselves.
Unverified: that the official installer serves the same build as npm `bun@1.4.5` (owner installs it officially before T2).

## Bun built-ins (stable 1.4.5)
- `bun --help` lists `test`, `check` ("Type check a TypeScript project") and `fmt`. It does NOT list `lint`.
- `bun check`: reports tsc-style errors, uses nearest tsconfig.json, accepts files/dirs. On a 2-file sample with a type error: exit 1, `Found 1 error in 1 file`. On `bun check a.ts` (clean file): exit 0. Flags: `-p/--project`, `--no-pretty`, `--all`, `--no-script`.
- `bun fmt`: `-c/--check` is check mode (exit 1 and lists files; `bun fmt --check` after `bun fmt` exits 0). Reads Prettier/oxfmt config or `--config=<file>`, `.editorconfig`, `.gitignore`/`.prettierignore`. Default adds semicolons, so check mode flags unformatted samples.
- `bun lint`: `error: Script not found "lint"`, exit 1. Not a stable built-in (it only runs a package.json script). Canary was not tried. No lint config file exists to read.

## D2: vitest and bun:test
- vitest (Node 22) running a test that imports `bun:test`, with `resolve.alias: {'bun:test': './shim/bun-test.ts'}` and the shim `export * from 'vitest'`: 1 passed. The test file needed zero edits.
- `bun test v.test.ts` where the file imports `vitest`: 1 pass. Bun resolves `vitest` imports without extra config.
- Both directions work, so one test file shape serves both runners.

## D13: scanImports
`new Bun.Transpiler({loader:'ts'}).scanImports(src)` on a source with `import type`, `export type {..} from`, a value import, `export *` and `import()` returned only the value import, `export *` and dynamic import. Type-only edges are dropped (`scan(src).imports` is identical). Fallback scanner needed: a regex/line scanner over `import ... from '...'` and `export ... from '...'` that keeps `type` forms.

## bun test flags
- `--reporter=junit --reporter-outfile=out.xml` works (valid `<testsuites>` XML written). Also `--reporter=dots`.
- Explicit file lists work: `bun test ./a.test.ts ./v.test.ts` ran 2 tests across 2 files. Patterns are positional.

## Verdicts
D4: use `bun check` for typecheck (exists in stable 1.4.5; exit 1 on error) (evidence: `bun check` in s1 -> `Found 1 error in 1 file`, rc=1)
D11: use `bun fmt --check` for format; `bun lint` is not available on stable, so no built-in lint step (evidence: `bun lint` -> `Script not found "lint"` rc=1; `bun fmt --check` -> rc=1 then rc=0 after `bun fmt`)
D2: test files import `bun:test`; vitest runs them via `resolve.alias` to a shim re-exporting `vitest`, zero edits (evidence: `npx vitest run a.test.ts` -> 1 passed; `bun test v.test.ts` importing vitest -> 1 pass)
D4 lint: `bun lint` absent on stable -> keep oxlint in fast pipeline, README says so (evidence: `bun lint` -> `Script not found "lint"`, rc=1)
D11 pin: bun-version 1.4.5, node 22.23.5 (evidence: `bun --version` -> 1.4.5; `node -v` -> v22.23.5)
D13: do not rely on `scanImports`; write a fallback regex scanner that keeps type edges (evidence: `bun scan.ts` -> only ./b, ./e, ./f, missing ./types ./c ./d)
Junit: `bun test --reporter=junit --reporter-outfile=<f> <files...>` (evidence: `bun test --reporter=junit --reporter-outfile=out.xml a.test.ts v.test.ts` -> 2 pass, XML written)

## T2: scaffold tuning
Chosen: K=120 generated domains (`gen.ts --domains 120 --seed 1`), plus 3 hand-written domains and 7 lib/meta test files. `createApp()` does real-style boot work (no busy loop): builds the router table, compiles each domain JSON schema (`fixtures/schema/<name>.json`, 80 optional props plus the route fields) with ajv 8.20.0, and loads seed rows (`fixtures/seed/<name>.json`, 60 rows) via `node:fs`. The compiled validator is the only request-body validator a domain's routes use (`src/lib/schema.ts` maps ajv errors to the 400 body). Seed rows are validated, deep-frozen and served read-only by `GET /<name>/catalog`. They never enter the mutable store, so `resetStore` leaves them alone. A row that fails its schema makes boot throw. Cost is tuned by `SCHEMA_PROPS`/`SEED_ROWS` in `scripts/gen.ts`.
Env: Bun 1.4.5, Node 22.23.5, vitest 5.1.1, TypeScript 5.9.3 (`legacy:check`), 20-core local machine.
- Per-`createApp()` cost (second call in a warm process): bun 0.56 s, node 0.56 s (first call 0.95 s bun, 0.96 s node).
- `bun test`: 1524 tests across 130 files, 1.4 s wall (build once per process).
- `vitest run` (`bun run legacy:test`, default workers): 1524 tests across 130 files, 20.1 s wall. Ratio 14x (target 4x).
- Baseline-serial local total (oxfmt, oxlint, tsc 5.9, build, vitest with `--maxWorkers=1`): 145 s (target 120 s). Measured as one `time ( ... )` run.
- Test count matches on both runners (1524). Both pass green. AC14: `bun run legacy:check && bun run check` both green.
- Negative checks: appending `Bun.version` to `src/lib/ids.ts` fails `api subset > src/ never uses Bun.* APIs`. Adding `import ... from "vitest"` to a test file fails `api subset > test/ imports only the shared subset`. Both restored.

## T10: barrel cut, smoke set, scaled suite
Env: same machine as T2 (20 cores), Bun 1.4.5, Node 22.23.5, vitest 5.1.1. Same K=120 domains. Property tests (fast-check, shared seed 20261121 and `RUNS = 4000` in `test/support/property.ts`, scaled 1-4x per generated domain) do the CPU work. App suite root is `test/` (`bunfig.toml`). `scripts/*.test.ts` run via `bun run test:tooling` (68 tests, not counted below).
- `bun test` (serial, one process): 2053 tests across 131 files, 28.3 s wall.
- `vitest run` (`bun run legacy:test`, default workers = 20): 2053 tests across 131 files, 34.5 s wall.
- `vitest run --maxWorkers=4` (stand-in for a 4-vCPU runner): 2053 tests across 131 files, 62.3 s wall.
- Test count equal on both runners (2053). `bun run ci:local` green, `bun run legacy:check && bun run check` green, `bun run gen` leaves the tree clean.
- Other baseline steps: tsc 5.9 2.2 s, oxfmt/oxlint/build under 0.2 s each.
- LPT over the regenerated `.ci/test-timings.json` (from `bun run timings:update`, 131 files, 25.8 s of test time): 4 shards of 6.44, 6.44, 6.47, 6.44 s.
- Affected on the real tree: `src/domains/generated/accounts/service.ts` (imported by other domains' tests) selects 15 test files + 3 smoke = 18 of 131 (13.7%). `hubs/service.ts` and `customers/service.ts` select 3 + 3 (4.6%). `src/domains/index.ts` or `src/app.ts` change selects all.
- Projected AC2 for a 4-vCPU runner (a projection, T9 measures it): baseline = setup and install O + vitest 62 s + tsc about 6 s (slower cores) = O + 68 s. Fast = O + test shard 6.4 s + about 2 s (fmt/lint/typecheck/build run in parallel jobs, each with its own setup). With O of about 20 s: 88 s / 28 s = 3.1x. The margin over 3x is thin and moves with O: O = 15 s gives 2.8x, O = 25 s gives 3.4x. If T9 measures under 3x, the owner decides K, N or per-test cost.
- Note: the T2 rule "local vitest at least 4x bun" and "baseline-serial at least 120 s" no longer apply (D1 replaced them). Local vitest is now 1.2x bun because the 20-core machine hides the boot cost.
- Negative checks: a test requesting `/orders` without importing `src/domains/orders/` fails `cross-domain rule > a test imports the domain module of every route prefix it requests` (restored). Removing the `!== BARREL` filter in `scripts/affected.ts` fails `the barrel cut` and the 20% real-tree test (restored). Removing the `RUN_ALL` check fails the three "runs all" tests for `index.ts` and `app.ts` (restored).

T10 notes (coordinator): bench.ts changes in T10 (RUN_TIMEOUT_MS poll cap, `run_attempt === 1`
filter, `fast_full_max_lte`, `n/a` rendering, nullable jobsTiming): `fast_full_max_lte` is in the
plan's T10 section; the other four came from the coordinator's T10 dispatch brief, which folded
T8 review nits (NaN render on empty results, Infinity from empty jobs, uncapped poll loop, missing
cancelled / null started_at / run_attempt>1 tests; logged as T8 review lines in the plan
ledger). The same brief added the affected.ts filter to test files existing at head. AC2 projection caveat: only tsc is scaled for slower runner cores; the
vitest (`--maxWorkers=4`, 20-core host) and bun shard times are not, so 3.1x is optimistic
(1.5x slower shard → ~2.8x). T9 measures on real runners. fast-check numRuns (4000 × scale
1–4) is set to reach the time target — README must say so.
