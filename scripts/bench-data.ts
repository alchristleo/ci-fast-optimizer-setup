// Types and pure statistics for bench/results.json. A leaf module: bench.ts and charts.ts import it.

export type BenchStep = { name: string; s: number };
export type BenchJob = { name: string; wall_s: number; start_s: number; steps: BenchStep[] };
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

// The three measured pipelines, in display order.
export const PIPELINES = [
  ["baseline", "full"],
  ["fast", "full"],
  ["fast", "pr"],
] as const;

// Runner bookkeeping steps are left out of step statistics.
export const isBookkeeping = (stepName: string) =>
  /^(Set up job|Post |Complete job)/.test(stepName);

// Shards are one job kind: "test (shard 2)" becomes "test (shards)".
export const jobKind = (jobName: string) => jobName.replace(/ \(shard \d+\)$/, " (shards)");

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

// Summaries of the three pipelines, in PIPELINES order.
export const pipelineStats = (runs: BenchRun[]) => PIPELINES.map(([w, m]) => summarize(runs, w, m));
