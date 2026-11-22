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

## Backlog
- Scheduled weekly bench re-run + badge
- Per-claim ablation workflows (one change at a time)
- turbo/nx comparison; frontend app
- Blog-post write-up

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
