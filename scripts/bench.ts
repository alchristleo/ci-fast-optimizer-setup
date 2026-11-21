// Bench: dispatch baseline/fast workflows, collect timings, write bench/results.json, render README.
// Usage:
//   bun scripts/bench.ts run --runs R
//   bun scripts/bench.ts --check fast_full_median_lt=60,speedup_gte=3,same_tests
//   bun scripts/bench.ts --readme [--check]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS = join(root, "bench/results.json");
const README = join(root, "README.md");
const REPO = "alchristleo/ci-fast-optimizer-setup";
const PR_BRANCH = "bench/pr-sample";
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

export type BenchStep = { name: string; s: number };
export type BenchJob = { name: string; wall_s: number; steps: BenchStep[] };
export type BenchRun = {
  workflow: string;
  mode: string;
  run_id: number;
  attempt: number;
  url: string;
  conclusion: string;
  created_at: string;
  queue_s: number;
  wall_s: number;
  jobs: BenchJob[];
  test_files: number | null;
  tests_passed: number | null;
};
export type Results = {
  generated_at: string | null;
  bun: string | null;
  node: string | null;
  runs: BenchRun[];
};

type ApiStep = { name: string; started_at: string | null; completed_at: string | null };
type ApiJob = {
  name: string;
  started_at: string | null;
  completed_at: string | null;
  steps?: ApiStep[];
};
type ApiRun = {
  id: number;
  name?: string;
  event: string;
  head_sha: string;
  created_at: string;
  run_attempt: number;
};

const secs = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 1000;

// null when no job both started and completed (cancelled before any job ran).
export function jobsTiming(jobs: ApiJob[], runCreatedAt: string) {
  const done = jobs.filter((j) => j.started_at && j.completed_at);
  if (done.length === 0) return null;
  const first = Math.min(...done.map((j) => Date.parse(j.started_at!)));
  const last = Math.max(...done.map((j) => Date.parse(j.completed_at!)));
  return {
    wall_s: (last - first) / 1000,
    queue_s: (first - Date.parse(runCreatedAt)) / 1000,
    jobs: done.map((j) => ({
      name: j.name,
      wall_s: secs(j.started_at!, j.completed_at!),
      steps: (j.steps ?? [])
        .filter((s) => s.started_at && s.completed_at)
        .map((s) => ({ name: s.name, s: secs(s.started_at!, s.completed_at!) })),
    })),
  };
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// Nearest-rank percentile.
export function p90(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.ceil(0.9 * s.length) - 1]!;
}

export function correlateRun(
  runs: ApiRun[],
  want: { headSha: string; dispatchedAt: string },
): ApiRun | undefined {
  const t = Date.parse(want.dispatchedAt);
  return runs
    .filter(
      (r) =>
        r.event === "workflow_dispatch" &&
        r.run_attempt === 1 && // a re-run of an earlier run is never ours
        r.head_sha === want.headSha &&
        Date.parse(r.created_at) >= t,
    )
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
}

// Digits are required, so the echoed script text (`files=${files}`) never matches.
export function parseTestsNotice(log: string): { files: number; passed: number } | undefined {
  const m = /TESTS files=(\d+) passed=(\d+)/.exec(log);
  return m ? { files: Number(m[1]), passed: Number(m[2]) } : undefined;
}

export function summarize(runs: BenchRun[], workflow: string, mode: string) {
  const all = runs.filter((r) => r.workflow === workflow && r.mode === mode);
  const ok = all.filter((r) => r.conclusion === "success");
  const walls = ok.map((r) => r.wall_s);
  return {
    n: ok.length,
    excluded: all.length - ok.length,
    ok,
    median_wall_s: ok.length ? median(walls) : NaN,
    p90_wall_s: ok.length ? p90(walls) : NaN,
    median_queue_s: ok.length ? median(ok.map((r) => r.queue_s)) : NaN,
    median_files: ok.length ? median(ok.map((r) => r.test_files ?? NaN)) : NaN,
  };
}

export type CheckResult = { expr: string; ok: boolean; detail: string };

export function checkAll(res: Results, exprs: string): CheckResult[] {
  const fast = summarize(res.runs, "fast", "full");
  const base = summarize(res.runs, "baseline", "full");
  const pr = summarize(res.runs, "fast", "pr");
  return exprs
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((expr): CheckResult => {
      const [name, arg] = expr.split("=");
      const lim = Number(arg);
      const r = (ok: boolean, detail: string) => ({ expr, ok, detail });
      switch (name) {
        case "fast_full_median_lt":
          return r(
            fast.n > 0 && fast.median_wall_s < lim,
            `fast full median ${fast.median_wall_s}s over ${fast.n} runs`,
          );
        case "fast_full_max_lte": {
          const max = Math.max(...fast.ok.map((x) => x.wall_s));
          return r(fast.n > 0 && max <= lim, `fast full max ${max}s over ${fast.n} runs`);
        }
        case "speedup_gte": {
          const x = base.median_wall_s / fast.median_wall_s;
          return r(
            fast.n > 0 && base.n > 0 && x >= lim,
            `baseline ${base.median_wall_s}s / fast ${fast.median_wall_s}s = ${x}`,
          );
        }
        case "same_tests": {
          const all = [...fast.ok, ...base.ok];
          const sig = new Set(all.map((x) => `${x.test_files}/${x.tests_passed}`));
          const known = all.every((x) => x.test_files != null && x.tests_passed != null);
          return r(
            fast.n > 0 && base.n > 0 && known && sig.size === 1,
            `signatures: ${[...sig].join(", ")}`,
          );
        }
        case "pr_fewer_files":
          return r(
            pr.n > 0 && fast.n > 0 && pr.median_files < fast.median_files,
            `pr ${pr.median_files} files vs full ${fast.median_files}`,
          );
        case "pr_median_lt":
          return r(
            pr.n > 0 && pr.median_wall_s < lim,
            `pr median ${pr.median_wall_s}s over ${pr.n} runs`,
          );
        default:
          return r(false, "unknown check");
      }
    });
}

const START = "<!-- bench:start -->";
const END = "<!-- bench:end -->";

const num = (x: number) => (Number.isFinite(x) ? String(x) : "n/a");

function section(res: Results): string {
  const rows = (
    [
      ["baseline", "full"],
      ["fast", "full"],
      ["fast", "pr"],
    ] as const
  ).map(([w, m]) => {
    const s = summarize(res.runs, w, m);
    return `| ${w} | ${m} | ${s.n} | ${s.excluded} | ${num(s.median_wall_s)} | ${num(s.p90_wall_s)} | ${num(s.median_queue_s)} |`;
  });
  return [
    "| workflow | mode | runs | excluded | median wall (s) | p90 wall (s) | median queue (s) |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Generated from bench/results.json (generated_at ${res.generated_at}, bun ${res.bun}, node ${res.node}).`,
  ].join("\n");
}

export function renderReadme(readme: string, res: Results): string {
  const a = readme.indexOf(START);
  const b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error("README bench markers not found");
  return `${readme.slice(0, a + START.length)}\n${section(res)}\n${readme.slice(b)}`;
}

export function checkReadme(readme: string, res: Results): boolean {
  return renderReadme(readme, res) === readme;
}

// ---- gh-backed commands (not unit tested) ----
function gh(args: string[]): string {
  return execFileSync("gh", ["api", ...args], { encoding: "utf8" });
}
const ghJson = (args: string[]) => JSON.parse(gh(args));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function dispatchOne(workflow: string, mode: "full" | "pr"): Promise<BenchRun> {
  const file = `${workflow}.yml`;
  const mainSha: string = ghJson([`repos/${REPO}/commits/main`]).sha;
  const ref = mode === "pr" ? PR_BRANCH : "main";
  const headSha: string =
    mode === "pr" ? ghJson([`repos/${REPO}/commits/${PR_BRANCH}`]).sha : mainSha;
  const dispatchedAt = new Date(Date.now() - 2000).toISOString().replace(/\.\d+Z$/, "Z");
  const fields = ["-f", `ref=${ref}`, "-f", `inputs[mode]=${mode}`];
  if (mode === "pr") fields.push("-f", `inputs[base]=${mainSha}`, "-f", `inputs[head]=${headSha}`);
  gh(["-X", "POST", `repos/${REPO}/actions/workflows/${file}/dispatches`, ...fields]);

  let found: ApiRun | undefined;
  for (let i = 0; i < 60 && !found; i++) {
    await sleep(5000);
    const list = ghJson([
      `repos/${REPO}/actions/workflows/${file}/runs?event=workflow_dispatch&per_page=30`,
    ]);
    found = correlateRun(list.workflow_runs, { headSha, dispatchedAt });
  }
  if (!found) throw new Error(`no run appeared for ${file}`);

  let run = found as ApiRun & { status?: string; conclusion?: string; html_url?: string };
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  while (run.status !== "completed") {
    if (Date.now() > deadline) throw new Error(`run ${found.id} not completed after 30 minutes`);
    await sleep(5000);
    run = ghJson([`repos/${REPO}/actions/runs/${found.id}`]);
  }
  const jobs = ghJson([`repos/${REPO}/actions/runs/${found.id}/jobs?per_page=100`])
    .jobs as (ApiJob & { id: number })[];
  const timing = jobsTiming(jobs, run.created_at) ?? { wall_s: 0, queue_s: 0, jobs: [] };
  let files = 0;
  let passed = 0;
  let seen = false;
  for (const j of jobs.filter((x) => x.name.startsWith("test"))) {
    const n = parseTestsNotice(gh([`repos/${REPO}/actions/jobs/${j.id}/logs`]));
    if (n) {
      seen = true;
      files += n.files;
      passed += n.passed;
    }
  }
  return {
    workflow,
    mode,
    run_id: run.id,
    attempt: run.run_attempt,
    url: run.html_url ?? `https://github.com/${REPO}/actions/runs/${run.id}`,
    conclusion: run.conclusion ?? "unknown",
    created_at: run.created_at,
    queue_s: timing.queue_s,
    wall_s: timing.wall_s,
    jobs: timing.jobs,
    test_files: seen ? files : null,
    tests_passed: seen ? passed : null,
  };
}

async function runBench(runs: number) {
  const res: Results = JSON.parse(readFileSync(RESULTS, "utf8"));
  const sh = (c: string, a: string[]) => execFileSync(c, a, { encoding: "utf8" }).trim();
  // Interleaved: baseline, fast, pr per round; dispatched sequentially.
  for (let i = 0; i < runs; i++) {
    for (const [w, m] of [
      ["baseline", "full"],
      ["fast", "full"],
      ["fast", "pr"],
    ] as const) {
      res.runs.push(await dispatchOne(w, m));
      res.generated_at = new Date().toISOString();
      res.bun = sh("bun", ["--version"]);
      res.node = sh("node", ["--version"]).replace(/^v/, "");
      writeFileSync(RESULTS, `${JSON.stringify(res, null, 2)}\n`);
    }
  }
  writeFileSync(README, renderReadme(readFileSync(README, "utf8"), res));
}

async function main(argv: string[]) {
  const arg = (f: string) => argv[argv.indexOf(f) + 1];
  if (argv[0] === "run") return runBench(Number(arg("--runs") ?? 5));
  const res: Results = JSON.parse(readFileSync(RESULTS, "utf8"));
  if (argv.includes("--readme")) {
    const text = readFileSync(README, "utf8");
    if (argv.includes("--check")) {
      if (!checkReadme(text, res)) {
        console.error("README bench section differs from bench/results.json render");
        process.exit(1);
      }
      return;
    }
    writeFileSync(README, renderReadme(text, res));
    return;
  }
  if (argv.includes("--check")) {
    const out = checkAll(res, arg("--check") ?? "");
    for (const c of out) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.expr}: ${c.detail}`);
    if (out.some((c) => !c.ok)) process.exit(1);
    return;
  }
  console.error("usage: bench.ts run --runs R | --check <exprs> | --readme [--check]");
  process.exit(2);
}

if (import.meta.main) await main(process.argv.slice(2));
