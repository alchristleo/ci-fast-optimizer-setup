import { describe, expect, test } from "bun:test";
import type { BenchJob, BenchRun, Results } from "./bench-data";
import { bar, CHARTS, runs, steps, timeline, wallTime } from "./charts";

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
// The run wall is `end`: the first job starts at 3 s and ci-ok ends at end + 3 s.
const fastJobs = (end: number): BenchJob[] => [
  job("plan", 3, 7, 1),
  job("fmt", 12, 8, 0),
  job("lint", 12, 6, 0),
  job("typecheck", 12, 9, 1),
  job("build", 12, 8, 1),
  job("tooling", 12, 14, 7),
  job("test (shard 0)", 12, end - 12, end - 20),
  job("test (shard 1)", 12, end - 14, end - 22),
  job("ci-ok", end + 1, 2, 0),
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
const COLOURS = {
  pipelines: { light: ["#2a78d6", "#eb6834", "#1baf7a"], dark: ["#3987e5", "#d95926", "#199e70"] },
  steps: { light: ["#6250d6", "#eda100", "#e87ba4"], dark: ["#9085e9", "#c98500", "#d55181"] },
};

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
        const { svg, alt, caption } = fn(res, theme);
        test("is valid SVG, 720 wide, with title and desc", () => {
          assertXml(svg);
          expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="720"')).toBe(true);
          expect(svg).toMatch(/<title>[^<]+<\/title>/);
          expect(svg).toMatch(/<desc>[^<]+<\/desc>/);
          expect(svg.endsWith("</svg>\n")).toBe(true);
          expect(svg).not.toContain("\r");
        });
        test("uses the theme surface and series colours, never for text", () => {
          const bg = theme === "light" ? "#fcfcfb" : "#1a1a19";
          const cols = COLOURS[name === "steps" ? "steps" : "pipelines"][theme];
          expect(svg).toContain(`fill="${bg}"`);
          for (const col of cols) expect(svg).toContain(col);
          for (const col of cols) expect(svg).not.toMatch(new RegExp(`<text[^>]*${col}`));
        });
        test("is byte-deterministic", () => {
          expect(fn(res, theme)).toEqual({ svg, alt, caption });
        });
        test("has alt text, a caption, and no text below 13 px", () => {
          expect(alt.length).toBeGreaterThan(20);
          expect(svg).toContain(`<desc>${alt}</desc>`);
          expect(caption.length).toBeGreaterThan(10);
          const sizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map((m) => Number(m[1]));
          expect(Math.min(...sizes)).toBeGreaterThanOrEqual(13);
        });
      });
    }

  test("one labelled mark per series", () => {
    for (const theme of themes) {
      for (const fn of [wallTime, runs, timeline]) {
        const { svg } = fn(res, theme);
        for (const label of ["baseline full", "fast full", "fast pr"])
          expect(svg).toContain(`>${label}</text>`);
      }
      const s = steps(res, theme).svg;
      for (const label of ["checkout", "setup", "work"]) expect(s).toContain(`>${label}</text>`);
    }
  });

  test("values: wall-time medians and p90 equal the data", () => {
    const { svg, alt } = wallTime(res, "light");
    expect(svg).toContain(">220 s, p90 300 s</text>");
    expect(svg).toContain(">44 s, p90 50 s</text>");
    expect(svg).toContain(">34 s, p90 38 s</text>");
    expect(svg).toContain("5.00x");
    expect(alt).toBe("Fast full is 5.00x faster than baseline full: 44 s vs 220 s median.");
  });

  test("values: runs shows every run wall time as a dot", () => {
    const { svg, alt } = runs(res, "light");
    expect(svg.match(/<circle /g)?.length).toBe(15);
    expect(svg).toContain(">median 220 s</text>");
    expect(svg).toContain(">median 44 s</text>");
    expect(svg).toContain(">median 34 s</text>");
    expect(alt).toContain("baseline full 200 to 300 s, fast full 40 to 50 s, fast pr 30 to 38 s");
  });

  const dots = (svg: string) =>
    [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)"/g)].map((m) => [+m[1]!, +m[2]!]);
  const apart = (svg: string) => {
    const d = dots(svg);
    return Math.min(
      ...d.flatMap(([x, y], i) => d.slice(i + 1).map(([x2, y2]) => Math.hypot(x! - x2!, y! - y2!))),
    );
  };

  test("runs: no two dots overlap, even when every run has the same time", () => {
    expect(apart(runs(res, "light").svg)).toBeGreaterThanOrEqual(9);
    const same: Results = {
      ...res,
      runs: res.runs.map((r) => ({ ...r, wall_s: r.workflow === "fast" ? 44 : r.wall_s })),
    };
    expect(dots(runs(same, "light").svg).length).toBe(15);
    expect(apart(runs(same, "light").svg)).toBeGreaterThanOrEqual(9);
  });

  test("runs: the median ticks are drawn before the dots", () => {
    const { svg } = runs(res, "light");
    expect(svg.lastIndexOf('stroke-width="2"/>')).toBeLessThan(svg.indexOf("<circle"));
  });
  test("bars thinner than 3 px have square ends", () => {
    expect(bar(10, 12, 0, 10, "#000")).toMatch(/^<rect /);
    expect(bar(10, 20, 0, 10, "#000")).toMatch(/^<path /);
  });

  test("values: timeline starts each run at its first job, so its end is the run wall", () => {
    const { svg, alt } = timeline(res, "light");
    expect(svg).toContain(">baseline full, 220 s</text>");
    expect(svg).toContain(">fast full, 44 s</text>");
    expect(svg).toContain(">fast pr, 34 s</text>");
    expect(svg).toContain("seconds since the first job of the run started");
    expect(svg).not.toContain("axis from run created");
    expect(alt).toBe(
      "Critical path of the median run: baseline full test (baseline) 220 s; fast full plan, test (shard 0), ci-ok 44 s; fast pr typecheck 34 s.",
    );
  });

  test("values: timeline draws the critical-path bars solid and the others faded", () => {
    const { svg } = timeline(res, "light");
    expect(svg).toContain(">critical path: plan, test (shard 0), ci-ok</text>");
    // fast full: 9 jobs, 3 on the path; fast pr: 5 jobs, 1 on the path; baseline: 1 job, on the path
    expect(svg.match(/fill-opacity="0.4"/g)?.length).toBe(6 + 4);
  });

  test("values: timeline follows needs back from the latest-ending job, not job times", () => {
    // fmt ends exactly when the shard starts, but the shard needs plan, not fmt.
    const near = (w: number) => [
      job("plan", 3, 7, 1),
      job("fmt", 3, 11, 0),
      job("test (shard 0)", 14, w - 14, 1),
      job("ci-ok", w + 1, 2, 0),
    ];
    const odd: Results = {
      ...res,
      runs: res.runs.map((r) =>
        r.workflow === "fast" && r.mode === "full" ? { ...r, jobs: near(r.wall_s) } : r,
      ),
    };
    expect(timeline(odd, "light").svg).toContain(
      ">critical path: plan, test (shard 0), ci-ok</text>",
    );
  });

  test("values: timeline sorts jobs that start together by code-unit name order", () => {
    const tied: Results = {
      ...res,
      runs: res.runs.map((r) =>
        r.workflow === "fast" && r.mode === "full"
          ? { ...r, jobs: [job("plan", 3, 7, 1), job("a", 12, 5, 1), job("B", 12, 5, 1)] }
          : r,
      ),
    };
    const { svg } = timeline(tied, "light");
    expect(svg.indexOf(">B</text>")).toBeLessThan(svg.indexOf(">a</text>"));
  });

  test("values: steps names the sum of medians and leaves the baseline bar out", () => {
    const { svg, alt } = steps(res, "light");
    expect(svg).toContain("baseline test job: 212 s");
    expect(svg).not.toContain(">test (baseline)</text>");
    expect(svg).toContain(">test (shards)</text>");
    expect(svg).toContain("Setup and checkout, not tests, are most of a fast job");
    expect(svg).toContain("more than work in 6 of 8 fast job kinds");
    expect(alt).toContain("6 of 8 fast job kinds");
  });

  test("values: steps title follows the data when work dominates", () => {
    const heavy: Results = {
      ...res,
      runs: res.runs.map((r) =>
        r.workflow === "fast"
          ? { ...r, jobs: r.jobs.map((j) => ({ ...j, steps: [...j.steps, step("work2", 100)] })) }
          : r,
      ),
    };
    expect(steps(heavy, "light").svg).toContain("Tests are most of a fast job");
  });
});
