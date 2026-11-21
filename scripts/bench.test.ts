import { describe, expect, test } from "bun:test";
import {
  checkAll,
  checkReadme,
  correlateRun,
  jobsTiming,
  median,
  p90,
  parseTestsNotice,
  renderReadme,
  summarize,
  type BenchRun,
  type Results,
} from "./bench";

// Shaped like GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs (GitHub REST docs).
const jobsResponse = {
  total_count: 3,
  jobs: [
    {
      id: 1,
      run_id: 100,
      name: "lint",
      status: "completed",
      conclusion: "success",
      created_at: "2026-11-21T10:00:05Z",
      started_at: "2026-11-21T10:00:10Z",
      completed_at: "2026-11-21T10:00:25Z",
      steps: [
        {
          name: "Set up job",
          status: "completed",
          conclusion: "success",
          number: 1,
          started_at: "2026-11-21T10:00:10Z",
          completed_at: "2026-11-21T10:00:11Z",
        },
        {
          name: "Run lint",
          status: "completed",
          conclusion: "success",
          number: 2,
          started_at: "2026-11-21T10:00:11Z",
          completed_at: "2026-11-21T10:00:24Z",
        },
      ],
    },
    {
      id: 2,
      run_id: 100,
      name: "test (1)",
      status: "completed",
      conclusion: "success",
      created_at: "2026-11-21T10:00:05Z",
      started_at: "2026-11-21T10:00:12Z",
      completed_at: "2026-11-21T10:00:40Z",
      steps: [
        {
          name: "Run tests",
          status: "completed",
          conclusion: "success",
          number: 1,
          started_at: "2026-11-21T10:00:13Z",
          completed_at: "2026-11-21T10:00:39Z",
        },
        {
          name: "Skipped step",
          status: "completed",
          conclusion: "skipped",
          number: 2,
          started_at: null,
          completed_at: null,
        },
      ],
    },
    {
      id: 3,
      run_id: 100,
      name: "ci-ok",
      status: "completed",
      conclusion: "success",
      created_at: "2026-11-21T10:00:05Z",
      started_at: "2026-11-21T10:00:41Z",
      completed_at: "2026-11-21T10:00:43Z",
      steps: [],
    },
  ],
};

describe("jobsTiming", () => {
  test("wall is last completed minus first started, queue is first started minus run created", () => {
    const t = jobsTiming(jobsResponse.jobs, "2026-11-21T09:59:50Z");
    expect(t.wall_s).toBe(33);
    expect(t.queue_s).toBe(20);
    expect(t.jobs.map((j) => [j.name, j.wall_s])).toEqual([
      ["lint", 15],
      ["test (1)", 28],
      ["ci-ok", 2],
    ]);
    expect(t.jobs[1].steps).toEqual([{ name: "Run tests", s: 26 }]);
  });
});

describe("median and p90", () => {
  test("literal values", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(9);
    expect(p90([7])).toBe(7);
  });
});

describe("correlateRun", () => {
  const base = { name: "fast", event: "workflow_dispatch", head_sha: "abc", run_attempt: 1 };
  const runs = [
    { ...base, id: 1, created_at: "2026-11-21T09:00:00Z" }, // before dispatch
    { ...base, id: 2, created_at: "2026-11-21T10:00:05Z", event: "push" }, // wrong event
    { ...base, id: 3, created_at: "2026-11-21T10:00:06Z", head_sha: "zzz" }, // wrong sha
    { ...base, id: 5, created_at: "2026-11-21T10:00:09Z" }, // later match
    { ...base, id: 4, created_at: "2026-11-21T10:00:07Z" }, // earliest match
  ];
  test("picks the earliest matching run created after dispatch", () => {
    const r = correlateRun(runs, { headSha: "abc", dispatchedAt: "2026-11-21T10:00:00Z" });
    expect(r?.id).toBe(4);
  });
  test("returns undefined when nothing matches", () => {
    expect(
      correlateRun(runs, { headSha: "nope", dispatchedAt: "2026-11-21T10:00:00Z" }),
    ).toBeUndefined();
  });
});

describe("parseTestsNotice", () => {
  test("reads files and passed from log text", () => {
    const log = "2026-11-21T10:00:30Z ::notice::TESTS files=30 passed=380\nother";
    expect(parseTestsNotice(log)).toEqual({ files: 30, passed: 380 });
    expect(parseTestsNotice("nothing")).toBeUndefined();
  });
});

function run(p: Partial<BenchRun> & { workflow: string; mode: string; wall_s: number }): BenchRun {
  return {
    run_id: 1,
    attempt: 1,
    url: "https://github.com/o/r/actions/runs/1",
    conclusion: "success",
    created_at: "2026-11-21T10:00:00Z",
    queue_s: 3,
    jobs: [],
    test_files: 120,
    tests_passed: 1520,
    ...p,
  };
}
const results = (runs: BenchRun[]): Results => ({
  generated_at: "2026-11-21T11:00:00Z",
  bun: "1.4.5",
  node: "22.23.5",
  runs,
});

const good = results([
  ...[40, 50, 45].map((w, i) => run({ workflow: "fast", mode: "full", wall_s: w, run_id: 10 + i })),
  ...[200, 180, 190].map((w, i) =>
    run({ workflow: "baseline", mode: "full", wall_s: w, run_id: 20 + i }),
  ),
  ...[20, 25, 30].map((w, i) =>
    run({
      workflow: "fast",
      mode: "pr",
      wall_s: w,
      run_id: 30 + i,
      test_files: 12,
      tests_passed: 150,
    }),
  ),
  run({ workflow: "fast", mode: "full", wall_s: 900, conclusion: "failure", run_id: 99 }),
]);

describe("summarize", () => {
  test("excludes non-success runs and counts them", () => {
    const s = summarize(good.runs, "fast", "full");
    expect(s).toMatchObject({ n: 3, excluded: 1, median_wall_s: 45 });
  });
});

describe("checks", () => {
  test("pass on good fixture", () => {
    const r = checkAll(
      good,
      "fast_full_median_lt=60,speedup_gte=3,same_tests,pr_fewer_files,pr_median_lt=60",
    );
    expect(r.filter((c) => !c.ok)).toEqual([]);
    expect(r).toHaveLength(5);
  });
  test("fail on bad fixtures", () => {
    const slow = results(
      good.runs.map((r) => (r.workflow === "fast" && r.mode === "full" ? { ...r, wall_s: 70 } : r)),
    );
    const f = (res: Results, e: string) => checkAll(res, e)[0].ok;
    expect(f(slow, "fast_full_median_lt=60")).toBe(false);
    expect(f(slow, "speedup_gte=3")).toBe(false);
    const diff = results(
      good.runs.map((r) => (r.workflow === "baseline" ? { ...r, tests_passed: 1 } : r)),
    );
    expect(f(diff, "same_tests")).toBe(false);
    const prAll = results(good.runs.map((r) => (r.mode === "pr" ? { ...r, test_files: 120 } : r)));
    expect(f(prAll, "pr_fewer_files")).toBe(false);
    expect(
      f(
        results(good.runs.map((r) => (r.mode === "pr" ? { ...r, wall_s: 90 } : r))),
        "pr_median_lt=60",
      ),
    ).toBe(false);
  });
  test("no data fails and unknown expression fails", () => {
    expect(checkAll(results([]), "speedup_gte=3")[0].ok).toBe(false);
    expect(checkAll(good, "bogus")[0].ok).toBe(false);
  });
});

describe("readme", () => {
  const readme = "# T\n\n<!-- bench:start -->\nold\n<!-- bench:end -->\n\ntail\n";
  test("render is idempotent and keeps text outside markers", () => {
    const once = renderReadme(readme, good);
    expect(renderReadme(once, good)).toBe(once);
    expect(once.startsWith("# T\n\n<!-- bench:start -->\n")).toBe(true);
    expect(once.endsWith("<!-- bench:end -->\n\ntail\n")).toBe(true);
    expect(once).toContain("| fast | full | 3 | 1 | 45 |");
    expect(once).not.toContain("old");
  });
  test("check detects drift", () => {
    expect(checkReadme(renderReadme(readme, good), good)).toBe(true);
    expect(checkReadme(readme, good)).toBe(false);
  });
  test("throws without markers", () => {
    expect(() => renderReadme("# T\n", good)).toThrow();
  });
});
