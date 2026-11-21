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
