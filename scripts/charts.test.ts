import { describe, expect, test } from "bun:test";
import type { BenchJob, BenchRun, Results } from "./bench";
import { CHARTS, runs, steps, timeline, wallTime } from "./charts";

const SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const step = (name: string, s: number) => ({ name, s });
const job = (name: string, start_s: number, wall_s: number, work: number): BenchJob => ({
  name,
  start_s,
  wall_s,
  steps: [
    step("Set up job", 1),
    step(`Run actions/checkout@${SHA}`, 1),
    step("Run ./.github/actions/setup", 3),
    step("work", work),
    step("Post Run ./.github/actions/setup", 0),
    step("Complete job", 0),
  ],
});
const run = (
  workflow: string,
  mode: string,
  n: number,
  wall_s: number,
  jobs: BenchJob[],
): BenchRun => ({
  workflow,
  mode,
  run_id: n,
  head_sha: SHA,
  attempt: 1,
  url: `https://example.test/runs/${n}`,
  conclusion: "success",
  created_at: "2026-11-21T16:54:29Z",
  queue_s: 3,
  wall_s,
  jobs,
  test_files: 100,
  tests_passed: 500,
});
const fastJobs = (end: number): BenchJob[] => [
  job("plan", 4, 7, 1),
  job("fmt", 12, 8, 0),
  job("lint", 12, 6, 0),
  job("typecheck", 12, 9, 1),
  job("build", 12, 8, 1),
  job("tooling", 12, 14, 7),
  job("test (shard 0)", 12, end - 16, end - 24),
  job("test (shard 1)", 12, end - 18, end - 26),
  job("ci-ok", end - 2, 2, 0),
];

const res: Results = {
  generated_at: "2026-11-21T17:24:34.855Z",
  bun: "1.4.5",
  node: "22.23.5",
  runs: [
    ...[200, 210, 220, 230, 300].map((w, i) =>
      run("baseline", "full", 10 + i, w, [job("test (baseline)", 3, w - 6, w - 12)]),
    ),
    ...[40, 42, 44, 46, 50].map((w, i) => run("fast", "full", 20 + i, w, fastJobs(w))),
    ...[30, 32, 34, 36, 38].map((w, i) => run("fast", "pr", 30 + i, w, fastJobs(w).slice(0, 5))),
  ],
};

const themes = ["light", "dark"] as const;
const fns = { "wall-time": wallTime, timeline, runs, steps };

// Minimal well-formedness check: balanced tags, no stray `&` or `<`.
function assertXml(svg: string) {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^<>]*?)(\/?)>/g)) {
    if (m[4]) continue;
    if (m[1]) expect(stack.pop()).toBe(m[2]!);
    else stack.push(m[2]!);
  }
  expect(stack).toEqual([]);
  expect(svg.replace(/<[^<>]*>/g, "")).not.toMatch(/[<>]|&(?!(amp|lt|gt|quot|#\d+);)/);
}

describe("charts", () => {
  test("CHARTS lists the four chart functions", () => {
    expect(Object.keys(CHARTS)).toEqual(["wall-time", "timeline", "runs", "steps"]);
    expect(CHARTS["wall-time"]).toBe(wallTime);
  });

  for (const [name, fn] of Object.entries(fns))
    for (const theme of themes) {
      describe(`${name} ${theme}`, () => {
        const svg = fn(res, theme);
        test("is valid SVG, 720 wide, with title and desc", () => {
          assertXml(svg);
          expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="720"')).toBe(true);
          expect(svg).toMatch(/<title>[^<]+<\/title>/);
          expect(svg).toMatch(/<desc>[^<]+<\/desc>/);
          expect(svg.endsWith("</svg>\n")).toBe(true);
          expect(svg).not.toContain("\r");
        });
        test("uses the theme surface and series colours", () => {
          const [bg, a, b, c] =
            theme === "light"
              ? ["#fcfcfb", "#2a78d6", "#eb6834", "#1baf7a"]
              : ["#1a1a19", "#3987e5", "#d95926", "#199e70"];
          expect(svg).toContain(`fill="${bg}"`);
          for (const col of [a, b, c]) expect(svg).toContain(col);
          for (const col of [a, b, c]) expect(svg).not.toMatch(new RegExp(`<text[^>]*${col}`));
        });
        test("is byte-deterministic", () => {
          expect(fn(res, theme)).toBe(svg);
        });
      });
    }

  test("one labelled mark per series", () => {
    for (const theme of themes) {
      for (const fn of [wallTime, runs, timeline]) {
        const svg = fn(res, theme);
        for (const label of ["baseline full", "fast full", "fast pr"])
          expect(svg).toContain(`>${label}</text>`);
      }
      const s = steps(res, theme);
      for (const label of ["checkout", "setup", "work"]) expect(s).toContain(`>${label}</text>`);
    }
  });

  test("values: wall-time medians and p90 equal the data", () => {
    const svg = wallTime(res, "light");
    expect(svg).toContain(">220 s, p90 300 s</text>");
    expect(svg).toContain(">44 s, p90 50 s</text>");
    expect(svg).toContain(">34 s, p90 38 s</text>");
    expect(svg).toContain("5.00x");
  });

  test("values: runs shows every run wall time as a dot", () => {
    const svg = runs(res, "light");
    expect(svg.match(/<circle /g)?.length).toBe(15);
    expect(svg).toContain(">median 220 s</text>");
    expect(svg).toContain(">median 44 s</text>");
    expect(svg).toContain(">median 34 s</text>");
  });

  test("values: timeline marks the critical path of the median run", () => {
    const svg = timeline(res, "light");
    expect(svg).toContain(">critical path, 44 s</text>");
    expect(svg).toContain(">test (shard 0)</text>");
  });

  test("values: timeline puts the critical-path label on the latest-ending job's row", () => {
    const lateLint = (w: number) => [
      job("plan", 4, 7, 1),
      job("lint", 20, w - 20, 1),
      job("ci-ok", 12, 2, 0),
    ];
    const odd: Results = {
      ...res,
      runs: res.runs.map((r) =>
        r.workflow === "fast" && r.mode === "full" ? { ...r, jobs: lateLint(r.wall_s) } : r,
      ),
    };
    const svg = timeline(odd, "light");
    const rowY = (label: string) =>
      [...svg.matchAll(new RegExp(`<text [^>]*y="([\\d.]+)"[^>]*>${label}</text>`, "g"))].map(
        (m) => m[1],
      );
    const crit = svg.match(/<text [^>]*y="([\d.]+)"[^>]*>critical path, 44 s<\/text>/);
    expect(crit).not.toBeNull();
    expect(rowY("lint")).toContain(crit![1]!);
    expect(rowY("ci-ok")).not.toContain(crit![1]!);
  });

  test("values: timeline falls back to start 0 when a job has no start_s", () => {
    const old: Results = {
      ...res,
      runs: res.runs.map((r) =>
        r.workflow === "baseline"
          ? { ...r, jobs: r.jobs.map((j) => ({ name: j.name, wall_s: j.wall_s, steps: j.steps })) }
          : r,
      ),
    };
    const svg = timeline(old, "light");
    expect(svg).not.toContain("NaN");
    expect(svg).toContain('d="M120.0 '); // the baseline bar starts at the axis origin (x0 = 120)
  });

  test("values: steps axis names the sum of medians", () => {
    expect(steps(res, "light")).toContain("sum of median checkout, setup and work (s)");
  });

  test("values: steps shows baseline and shard totals in medians", () => {
    const svg = steps(res, "light");
    expect(svg).toContain(">test (baseline)</text>");
    expect(svg).toContain(">212 s</text>"); // 1 + 3 + 208
    expect(svg).toContain(">test (shards)</text>");
  });
});
