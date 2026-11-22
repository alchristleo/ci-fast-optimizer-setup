import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertUpToDate,
  chartDrift,
  checkAll,
  checkReadme,
  correlateRun,
  dispatchBody,
  jobStarts,
  jobsTiming,
  median,
  p90,
  parseTestsNotice,
  renderCharts,
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
    const t = jobsTiming(jobsResponse.jobs, "2026-11-21T09:59:50Z")!;
    expect(t.wall_s).toBe(33);
    expect(t.queue_s).toBe(20);
    expect(t.jobs.map((j) => [j.name, j.wall_s])).toEqual([
      ["lint", 15],
      ["test (1)", 28],
      ["ci-ok", 2],
    ]);
    expect(t.jobs[1]?.steps).toEqual([{ name: "Run tests", s: 26 }]);
  });
});

describe("jobsTiming edge cases", () => {
  const job = (name: string, started: string | null, completed: string | null) => ({
    name,
    started_at: started,
    completed_at: completed,
  });
  test("a job that never started is left out", () => {
    const t = jobsTiming(
      [
        job("skipped", null, "2026-11-21T10:00:30Z"),
        job("lint", "2026-11-21T10:00:10Z", "2026-11-21T10:00:25Z"),
      ],
      "2026-11-21T10:00:00Z",
    );
    expect(t?.wall_s).toBe(15);
    expect(t?.jobs.map((j) => j.name)).toEqual(["lint"]);
  });
  test("no completed job gives null, not NaN timings", () => {
    expect(
      jobsTiming(
        [job("a", null, null), job("b", "2026-11-21T10:00:10Z", null)],
        "2026-11-21T10:00:00Z",
      ),
    ).toBeNull();
    expect(jobsTiming([], "2026-11-21T10:00:00Z")).toBeNull();
  });
});

describe("jobsTiming skipped jobs", () => {
  test("a skipped job is left out of jobs and out of wall", () => {
    const t = jobsTiming(
      [
        {
          name: "lint",
          conclusion: "success",
          started_at: "2026-11-21T10:00:10Z",
          completed_at: "2026-11-21T10:00:25Z",
        },
        {
          name: "timings",
          conclusion: "skipped",
          started_at: "2026-11-21T10:00:10Z",
          completed_at: "2026-11-21T10:05:00Z",
        },
      ],
      "2026-11-21T10:00:00Z",
    );
    expect(t?.wall_s).toBe(15);
    expect(t?.jobs.map((j) => j.name)).toEqual(["lint"]);
  });
});

describe("dispatchBody", () => {
  test("baseline sends a ref and no inputs", () => {
    expect(dispatchBody("baseline", "full", "main", "b", "h")).toEqual({ ref: "main" });
  });
  test("fast full sends only the mode", () => {
    expect(dispatchBody("fast", "full", "main", "b", "h")).toEqual({
      ref: "main",
      inputs: { mode: "full" },
    });
  });
  test("fast pr sends mode, base and head", () => {
    expect(dispatchBody("fast", "pr", "bench/pr-sample", "b", "h")).toEqual({
      ref: "bench/pr-sample",
      inputs: { mode: "pr", base: "b", head: "h" },
    });
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
    { ...base, id: 1, created_at: "2026-11-21T09:00:00Z" }, // existed before dispatch
    { ...base, id: 2, created_at: "2026-11-21T10:00:05Z", event: "push" }, // wrong event
    { ...base, id: 3, created_at: "2026-11-21T10:00:06Z", head_sha: "zzz" }, // wrong sha
    { ...base, id: 5, created_at: "2026-11-21T10:00:09Z" }, // later new match
    { ...base, id: 4, created_at: "2026-11-21T10:00:07Z" }, // earliest new match
  ];
  test("picks the earliest matching run whose id was not known before dispatch", () => {
    expect(correlateRun(runs, { headSha: "abc", knownIds: new Set([1]) })?.id).toBe(4);
  });
  test("ignores a run whose id was known before dispatch, whatever its clock says", () => {
    expect(correlateRun(runs, { headSha: "abc", knownIds: new Set([1, 4, 5]) })).toBeUndefined();
  });
  test("ignores a re-run (attempt 2) of an earlier run", () => {
    const decoy = [{ ...base, id: 9, created_at: "2026-11-21T10:00:03Z", run_attempt: 2 }];
    expect(correlateRun(decoy, { headSha: "abc", knownIds: new Set() })).toBeUndefined();
    expect(correlateRun([...decoy, ...runs], { headSha: "abc", knownIds: new Set([1]) })?.id).toBe(
      4,
    );
  });
  test("returns undefined when nothing matches", () => {
    expect(correlateRun(runs, { headSha: "nope", knownIds: new Set() })).toBeUndefined();
  });
});

describe("parseTestsNotice", () => {
  test("reads files and passed from log text", () => {
    const log = "2026-11-21T10:00:30Z ::notice::TESTS files=30 passed=380\nother";
    expect(parseTestsNotice(log)).toEqual({ files: 30, passed: 380 });
    expect(parseTestsNotice("nothing")).toBeUndefined();
  });

  test("reads the plain line from a raw job log and ignores the echoed script", () => {
    const log = [
      "2026-11-21T10:00:01.0000000Z ##[group]Run set -o pipefail",
      "2026-11-21T10:00:01.0000001Z set -o pipefail",
      '2026-11-21T10:00:01.0000002Z echo "TESTS files=${files} passed=${passed}"',
      "2026-11-21T10:00:01.0000003Z ##[endgroup]",
      "2026-11-21T10:00:30.0000000Z TESTS files=30 passed=380",
    ];
    expect(parseTestsNotice(log.join("\n"))).toEqual({ files: 30, passed: 380 });
    expect(parseTestsNotice(log.slice(0, 4).join("\n"))).toBeUndefined();
  });
});

function run(p: Partial<BenchRun> & { workflow: string; mode: string; wall_s: number }): BenchRun {
  return {
    run_id: 1,
    head_sha: "abc",
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
  test("a cancelled run is excluded and keeps its wall out of the median", () => {
    const cancelled = run({
      workflow: "fast",
      mode: "full",
      wall_s: 1000,
      run_id: 99,
      conclusion: "cancelled",
    });
    const s = summarize([...good.runs, cancelled], "fast", "full");
    expect(s).toMatchObject({ n: 3, excluded: 2, median_wall_s: 45 });
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
    const f = (res: Results, e: string) => checkAll(res, e)[0]?.ok;
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
  test("fast_full_max_lte compares the slowest successful run", () => {
    const f = (res: Results) => checkAll(res, "fast_full_max_lte=90")[0]?.ok;
    expect(f(good)).toBe(true);
    const bump = (w: number, conclusion = "success") =>
      results(
        good.runs.map((r) =>
          r.workflow === "fast" && r.mode === "full" && r.run_id === 10
            ? { ...r, wall_s: w, conclusion }
            : r,
        ),
      );
    expect(f(bump(90))).toBe(true);
    expect(f(bump(91))).toBe(false);
    expect(f(bump(500, "cancelled"))).toBe(true);
    expect(f(results([]))).toBe(false);
  });
  test("no data fails and unknown expression fails", () => {
    expect(checkAll(results([]), "speedup_gte=3")[0]?.ok).toBe(false);
    expect(checkAll(good, "bogus")[0]?.ok).toBe(false);
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
  test("a row without runs renders n/a, never NaN", () => {
    const out = renderReadme(readme, results([]));
    expect(out).not.toContain("NaN");
    expect(out).toContain("| baseline | full | 0 | 0 | n/a | n/a | n/a |");
  });
  test("renders median per-step seconds for full-mode successful runs", () => {
    const withJobs = results([
      ...[10, 20, 30].map((s, i) =>
        run({
          workflow: "baseline",
          mode: "full",
          wall_s: 60,
          run_id: 40 + i,
          jobs: [{ name: "test (baseline)", wall_s: 60, steps: [{ name: "vitest", s }] }],
        }),
      ),
      run({
        workflow: "baseline",
        mode: "full",
        wall_s: 60,
        run_id: 49,
        conclusion: "failure",
        jobs: [{ name: "test (baseline)", wall_s: 900, steps: [{ name: "vitest", s: 900 }] }],
      }),
    ]);
    const out = renderReadme(readme, withJobs);
    expect(out).toContain("| baseline | test (baseline) | vitest | 20 |");
  });
  test("renders median runner seconds as the sum of job walls", () => {
    const j = (w: number) => ({ name: "x", wall_s: w, steps: [] });
    const out = renderReadme(
      readme,
      results([
        run({ workflow: "fast", mode: "full", wall_s: 9, run_id: 60, jobs: [j(10), j(5)] }),
        run({ workflow: "fast", mode: "full", wall_s: 9, run_id: 61, jobs: [j(20), j(10)] }),
        run({ workflow: "fast", mode: "full", wall_s: 9, run_id: 62, jobs: [j(100)] }),
      ]),
    );
    expect(out).toContain("| fast | full | 3 | 0 | 9 | 9 | 3 | 30 |");
  });
  test("renders a legend, short step names and a details block", () => {
    const out = renderReadme(
      readme,
      results([
        run({
          workflow: "fast",
          mode: "full",
          wall_s: 9,
          run_id: 70,
          jobs: [
            {
              name: "plan",
              wall_s: 9,
              steps: [
                { name: "Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1", s: 1 },
                { name: "Run bun run lint", s: 2 },
              ],
            },
          ],
        }),
      ]),
    );
    expect(out).toContain("excluded");
    expect(out).toContain("<details>");
    expect(out).toContain("| fast | plan | actions/checkout | 1 |");
    expect(out).toContain("| fast | plan | bun run lint | 2 |");
    expect(out).not.toContain("3d3c42e5");
  });
  test("renders the shard wall range of each fast full run", () => {
    const sh = (w: number) => ({ name: "test (shard 0)", wall_s: w, steps: [] });
    const out = renderReadme(
      readme,
      results([
        run({ workflow: "fast", mode: "full", wall_s: 9, run_id: 80, jobs: [sh(17), sh(26)] }),
        run({ workflow: "fast", mode: "full", wall_s: 9, run_id: 81, jobs: [sh(22), sh(27)] }),
      ]),
    );
    expect(out).toContain("17-26 s, 22-27 s");
  });
  test("throws without markers", () => {
    expect(() => renderReadme("# T\n", good)).toThrow();
  });
});

describe("assertUpToDate", () => {
  test("throws when the branch is behind main", () => {
    expect(() => assertUpToDate(1)).toThrow("bench/pr-sample is stale: rebase it on main");
  });
  test("throws when behind_by is missing", () => {
    expect(() => assertUpToDate(undefined as unknown as number)).toThrow("rebase it on main");
  });
  test("passes when the branch is level with main", () => {
    expect(() => assertUpToDate(0)).not.toThrow();
  });
});

describe("jobStarts", () => {
  test("maps job name to seconds from run created_at", () => {
    expect(jobStarts(jobsResponse.jobs, "2026-11-21T09:59:50Z")).toEqual({
      lint: 20,
      "test (1)": 22,
      "ci-ok": 51,
    });
  });
  test("a job with a null started_at is skipped", () => {
    const jobs = [
      { name: "a", started_at: null, completed_at: "2026-11-21T10:00:30Z" },
      { name: "b", started_at: "2026-11-21T10:00:10Z", completed_at: null },
    ];
    expect(jobStarts(jobs, "2026-11-21T10:00:00Z")).toEqual({ b: 10 });
  });
  test("a start before the run was created is clamped to 0", () => {
    const jobs = [{ name: "a", started_at: "2026-11-21T09:59:58Z", completed_at: null }];
    expect(jobStarts(jobs, "2026-11-21T10:00:00Z")).toEqual({ a: 0 });
  });
});

describe("committed results.json start_s", () => {
  test("every job has a finite start_s of at least 0", () => {
    const res: Results = JSON.parse(
      readFileSync(new URL("../bench/results.json", import.meta.url), "utf8"),
    );
    const jobs = res.runs.flatMap((r) => r.jobs);
    expect(jobs.length).toBeGreaterThan(0);
    for (const j of jobs) {
      expect(Number.isFinite(j.start_s)).toBe(true);
      expect(j.start_s!).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("charts wiring", () => {
  const committed: Results = JSON.parse(readFileSync("bench/results.json", "utf8"));
  test("renders four charts in two themes", () => {
    expect(Object.keys(renderCharts(committed))).toEqual([
      "wall-time-light.svg",
      "wall-time-dark.svg",
      "timeline-light.svg",
      "timeline-dark.svg",
      "runs-light.svg",
      "runs-dark.svg",
      "steps-light.svg",
      "steps-dark.svg",
    ]);
  });
  test("the committed SVGs equal the render", () => {
    expect(chartDrift(committed, "bench/charts")).toEqual([]);
  });
  test("drift names a changed or missing file", () => {
    const dir = mkdtempSync(join(tmpdir(), "charts-"));
    for (const [file, svg] of Object.entries(renderCharts(committed)))
      writeFileSync(join(dir, file), file === "runs-dark.svg" ? `${svg} ` : svg);
    expect(chartDrift(committed, dir)).toEqual(["runs-dark.svg"]);
    expect(chartDrift(committed, join(dir, "none")).length).toBe(8);
  });
  test("the README embeds four pictures with dark sources and numeric alt text", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme.match(/<picture>/g)?.length).toBe(4);
    expect(
      readme.match(
        /<source media="\(prefers-color-scheme: dark\)" srcset="bench\/charts\/[a-z-]+-dark\.svg">/g,
      )?.length,
    ).toBe(4);
    expect(readme).toContain(
      'alt="Median wall time: baseline full 219 s, fast full 44 s, fast pr 34 s."',
    );
  });
});
