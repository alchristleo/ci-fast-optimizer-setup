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
const PR_BRANCH = "bench/pr-sample";
const RUN_TIMEOUT_MS = 30 * 60 * 1000;

export type BenchStep = { name: string; s: number };
export type BenchJob = { name: string; wall_s: number; steps: BenchStep[] };
export type BenchRun = {
  workflow: string;
  mode: string;
  run_id: number;
  head_sha: string;
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
  conclusion?: string | null;
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

// Skipped jobs (such as `timings` outside push events) are left out.
// null when no job both started and completed (cancelled before any job ran).
export function jobsTiming(jobs: ApiJob[], runCreatedAt: string) {
  const done = jobs.filter((j) => j.started_at && j.completed_at && j.conclusion !== "skipped");
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

// Body of the workflow_dispatch API call. Only fast.yml declares inputs, baseline rejects them.
export function dispatchBody(
  workflow: string,
  mode: "full" | "pr",
  ref: string,
  base: string,
  head: string,
) {
  if (workflow !== "fast") return { ref };
  return { ref, inputs: mode === "pr" ? { mode, base, head } : { mode } };
}

export function assertUpToDate(behindBy: number): void {
  if (behindBy > 0) throw new Error(`${PR_BRANCH} is stale: rebase it on main`);
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

// `knownIds`: run ids that already existed for this workflow and sha before the dispatch.
export function correlateRun(
  runs: ApiRun[],
  want: { headSha: string; knownIds: Set<number> },
): ApiRun | undefined {
  return runs
    .filter(
      (r) =>
        r.event === "workflow_dispatch" &&
        r.run_attempt === 1 && // a re-run of an earlier run is never ours
        r.head_sha === want.headSha &&
        !want.knownIds.has(r.id),
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
    // Runner time: the sum of all job walls in a run.
    median_runner_s: ok.length
      ? median(ok.map((r) => r.jobs.reduce((t, j) => t + j.wall_s, 0)))
      : NaN,
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

// "Run actions/checkout@<40 hex>" becomes "actions/checkout".
const shortStep = (name: string) => name.replace(/^Run /, "").replace(/@[0-9a-f]{40}$/, "");

function section(res: Results): string {
  const rows = (
    [
      ["baseline", "full"],
      ["fast", "full"],
      ["fast", "pr"],
    ] as const
  ).map(([w, m]) => {
    const s = summarize(res.runs, w, m);
    return `| ${w} | ${m} | ${s.n} | ${s.excluded} | ${num(s.median_wall_s)} | ${num(s.p90_wall_s)} | ${num(s.median_queue_s)} | ${num(s.median_runner_s)} |`;
  });
  const steps: string[] = [];
  for (const w of ["baseline", "fast"]) {
    const by = new Map<string, number[]>();
    for (const r of summarize(res.runs, w, "full").ok)
      for (const j of r.jobs) {
        // Shards are one job kind: group "test (shard 2)" with the others.
        const job = j.name.replace(/ \(shard \d+\)$/, " (shards)");
        for (const st of j.steps) {
          if (/^(Set up job|Post |Complete job)/.test(st.name)) continue; // runner bookkeeping
          const key = `${job}\t${shortStep(st.name)}`;
          by.set(key, [...(by.get(key) ?? []), st.s]);
        }
      }
    for (const [key, v] of by) {
      const [job, step] = key.split("\t");
      steps.push(`| ${w} | ${job} | ${step} | ${num(median(v))} |`);
    }
  }
  const ranges = summarize(res.runs, "fast", "full").ok.map((r) => {
    const w = r.jobs.filter((j) => /^test \(shard \d+\)$/.test(j.name)).map((j) => j.wall_s);
    return w.length ? `${Math.min(...w)}-${Math.max(...w)} s` : "n/a";
  });
  return [
    "Columns: mode `full` runs every test file and `pr` runs only the files the diff can reach (fast.yml on the branch `bench/pr-sample`). `excluded` counts runs that did not succeed and are left out of every statistic. Runner seconds are the sum of all job walls in a run, skipped jobs left out.",
    "",
    "| workflow | mode | runs | excluded | median wall (s) | p90 wall (s) | median queue (s) | median runner (s) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    `Shard job wall range (fastest-slowest) in each fast full run: ${ranges.join(", ") || "n/a"}.`,
    "",
    "<details>",
    "<summary>Median seconds per step, successful full-mode runs</summary>",
    "",
    "Runner bookkeeping steps are left out and shards are grouped as one job.",
    "",
    "| workflow | job | step | median (s) |",
    "| --- | --- | --- | --- |",
    ...steps,
    "",
    "</details>",
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
function gh(args: string[], input?: string): string {
  return execFileSync("gh", ["api", ...args], { encoding: "utf8", input });
}
const ghJson = (args: string[]) => JSON.parse(gh(args));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// BENCH_REPO=owner/name, else the repo of the current checkout.
const repoName = () =>
  process.env.BENCH_REPO ??
  execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], {
    encoding: "utf8",
  }).trim();

async function dispatchOne(workflow: string, mode: "full" | "pr"): Promise<BenchRun> {
  const REPO = repoName();
  const file = `${workflow}.yml`;
  const mainSha: string = ghJson([`repos/${REPO}/commits/main`]).sha;
  if (mode === "pr")
    assertUpToDate(ghJson([`repos/${REPO}/compare/main...${PR_BRANCH}`]).behind_by);
  const ref = mode === "pr" ? PR_BRANCH : "main";
  const headSha: string =
    mode === "pr" ? ghJson([`repos/${REPO}/commits/${PR_BRANCH}`]).sha : mainSha;
  const runsPath = `repos/${REPO}/actions/workflows/${file}/runs?event=workflow_dispatch&per_page=30`;
  const knownIds = new Set<number>(
    (ghJson([runsPath]).workflow_runs as ApiRun[])
      .filter((r) => r.head_sha === headSha)
      .map((r) => r.id),
  );
  // JSON body: older gh versions send `-f inputs[mode]=x` as a literal key.
  const body = JSON.stringify(dispatchBody(workflow, mode, ref, mainSha, headSha));
  gh(["-X", "POST", `repos/${REPO}/actions/workflows/${file}/dispatches`, "--input", "-"], body);

  let found: ApiRun | undefined;
  for (let i = 0; i < 60 && !found; i++) {
    await sleep(5000);
    found = correlateRun(ghJson([runsPath]).workflow_runs, { headSha, knownIds });
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
    head_sha: found.head_sha,
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
