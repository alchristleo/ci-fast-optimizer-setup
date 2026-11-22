// SVG charts for the README bench section. Pure functions: same data and theme, same bytes.
import {
  PIPELINES,
  isBookkeeping,
  jobKind,
  median,
  pipelineStats,
  summarize,
  type BenchJob,
  type BenchRun,
  type Results,
} from "./bench-data";

export type Theme = "light" | "dark";
// One chart: the SVG, the alt text (also its <desc>) and the README caption.
export type Chart = (res: Results, theme: Theme) => { svg: string; alt: string; caption: string };

const W = 720;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
// Text sizes stay legible when the SVG scales to a phone: nothing below SMALL.
const BASE = 15;
const SMALL = 13;
const X0 = 150;
const X1 = 560;
const PALETTE = {
  light: {
    bg: "#fcfcfb",
    ink: "#0b0b0b",
    sub: "#52514e",
    grid: "#e4e3df",
    series: ["#2a78d6", "#eb6834", "#1baf7a"],
    steps: ["#6250d6", "#eda100", "#e87ba4"],
  },
  dark: {
    bg: "#1a1a19",
    ink: "#f0efec",
    sub: "#c3c2b7",
    grid: "#33332f",
    series: ["#3987e5", "#d95926", "#199e70"],
    steps: ["#9085e9", "#c98500", "#d55181"],
  },
};
type Pal = (typeof PALETTE)[Theme];

// True when every pipeline has a successful run and each of those runs has jobs, so all four charts can be drawn.
export const chartable = (res: Results): boolean =>
  pipelineStats(res.runs).every((s) => s.n > 0 && s.ok.every((r) => r.jobs.length > 0));

const PIPELINE_LABELS = PIPELINES.map(([w, m]) => `${w} ${m}`);

const f = (n: number) => n.toFixed(1);
// Whole seconds stay whole, so "220 s" matches the README table.
const sec = (n: number) => `${Number(n.toFixed(1))} s`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Code-unit order, so the sort does not depend on the locale.
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type TextOpts = {
  anchor?: "start" | "end" | "middle";
  fill?: string;
  size?: number;
  bold?: boolean;
};
const text = (x: number, y: number, s: string, p: Pal, o: TextOpts = {}) =>
  `<text x="${f(x)}" y="${f(y)}" fill="${o.fill ?? p.ink}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.size ? ` font-size="${o.size}"` : ""}${o.bold ? ' font-weight="600"' : ""}>${esc(s)}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w = 1) =>
  `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${w}"/>`;

// Bar from x0 to x1 with the data end (right) rounded by up to 4 px and the baseline end square.
// A bar thinner than 3 px stays square, and the radius is at most a third of the width, so a short bar never shows as a half disc.
export function bar(
  x0: number,
  x1: number,
  y: number,
  h: number,
  fill: string,
  round = true,
  faded = false,
): string {
  const w = Math.max(x1 - x0, 1);
  const r = round && w >= 3 ? Math.min(4, w / 3, h / 2) : 0;
  const op = faded ? ' fill-opacity="0.4"' : "";
  if (!r)
    return `<rect x="${f(x0)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"${op}/>`;
  const e = x0 + w;
  return `<path d="M${f(x0)} ${f(y)}H${f(e - r)}A${f(r)} ${f(r)} 0 0 1 ${f(e)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(e - r)} ${f(y + h)}H${f(x0)}Z" fill="${fill}"${op}/>`;
}

type LegendItem = { label: string; color: string; tick?: boolean };
function legend(items: LegendItem[], x: number, y: number, p: Pal): string {
  let cx = x;
  const out: string[] = [];
  for (const it of items) {
    out.push(
      it.tick
        ? line(cx + 5, y - 11, cx + 5, y + 2, it.color, 2)
        : `<rect x="${f(cx)}" y="${f(y - 11)}" width="11" height="11" rx="2" fill="${it.color}"/>`,
      text(cx + 18, y, it.label, p),
    );
    cx += 18 + it.label.length * 9 + 22; // 9 px per character leaves slack for wider fonts
  }
  return out.join("\n");
}

// One swatch per label, in the colours given (the pipeline colours by default), then the extra items.
const seriesLegend = (
  p: Pal,
  labels: string[],
  extra: LegendItem[] = [],
  colors: string[] = p.series,
) => legend([...labels.map((label, i) => ({ label, color: colors[i]! })), ...extra], 24, 82, p);

function niceStep(max: number): number {
  return [5, 10, 20, 25, 50, 100, 200, 500].find((s) => max / s <= 7) ?? 1000;
}

type Frame = {
  title: string;
  alt: string;
  sub: string;
  top: number; // y of the first row
  rows: number; // number of rows, may be fractional
  pitch: number; // height of one row
  foot?: number; // space under the axis for its labels and any note
  body: (bottom: number) => string[]; // gets the y of the bottom of the last row
};
function frame(p: Pal, a: Frame): string {
  const bottom = a.top + a.rows * a.pitch;
  const height = Math.ceil(bottom + (a.foot ?? 48));
  return (
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img" font-family="${FONT}" font-size="${BASE}">`,
      `<title>${esc(a.title)}</title>`,
      `<desc>${esc(a.alt)}</desc>`,
      `<rect width="${W}" height="${height}" fill="${p.bg}"/>`,
      text(24, 32, a.title, p, { size: 20, bold: true }),
      text(24, 55, a.sub, p, { fill: p.sub, size: SMALL }),
      ...a.body(bottom),
      "</svg>",
    ].join("\n") + "\n"
  );
}

// Vertical grid lines with tick labels along one bottom axis. Returns the scale and the markup.
function axis(
  p: Pal,
  max: number,
  x0: number,
  x1: number,
  top: number,
  bottom: number,
  unit: string,
) {
  const step = niceStep(max);
  const top_ = Math.ceil(max / step) * step;
  const x = (v: number) => x0 + (v / top_) * (x1 - x0);
  const out: string[] = [];
  for (let v = 0; v <= top_; v += step) {
    out.push(
      line(x(v), top, x(v), bottom, p.grid),
      text(x(v), bottom + 17, String(v), p, { anchor: "middle", fill: p.sub, size: SMALL }),
    );
  }
  out.push(text(x1, bottom + 35, unit, p, { anchor: "end", fill: p.sub, size: SMALL }));
  return { x, markup: out };
}

export const wallTime: Chart = (res, theme) => {
  const p = PALETTE[theme];
  const s = pipelineStats(res.runs);
  const [base, fast] = [s[0]!, s[1]!];
  const ratio = (base.median_wall_s / fast.median_wall_s).toFixed(2);
  const alt = `Fast full is ${ratio}x faster than baseline full: ${sec(fast.median_wall_s)} vs ${sec(base.median_wall_s)} median.`;
  const [top, pitch, bh] = [100, 48, 16];
  const svg = frame(p, {
    title: `Median CI wall time, ${ratio}x faster`,
    alt,
    sub: `baseline full ${sec(base.median_wall_s)} to fast full ${sec(fast.median_wall_s)}`,
    top,
    rows: s.length,
    pitch,
    foot: 76,
    body: (bottom) => {
      const ax = axis(
        p,
        Math.max(...s.map((r) => r.p90_wall_s)),
        X0,
        X1,
        top,
        bottom,
        "wall time (s)",
      );
      const body = [seriesLegend(p, PIPELINE_LABELS), ...ax.markup];
      s.forEach((r, i) => {
        const y = top + i * pitch + (pitch - bh) / 2;
        const mid = y + bh / 2;
        const [xm, xp] = [ax.x(r.median_wall_s), ax.x(r.p90_wall_s)];
        body.push(
          text(X0 - 12, mid + 5, PIPELINE_LABELS[i]!, p, { anchor: "end" }),
          bar(X0, xm, y, bh, p.series[i]!),
          line(xm, mid, xp, mid, p.sub, 1.5),
          line(xp, mid - 5, xp, mid + 5, p.sub, 1.5),
          text(xp + 10, mid + 5, `${sec(r.median_wall_s)}, p90 ${sec(r.p90_wall_s)}`, p),
        );
      });
      body.push(
        text(
          24,
          bottom + 60,
          `Whisker marks p90. With ${base.n} runs per pipeline, p90 is the slowest run.`,
          p,
          { fill: p.sub, size: SMALL },
        ),
      );
      return body;
    },
  });
  return {
    svg,
    alt,
    caption: "Median wall time of each pipeline. The whisker reaches the p90 run.",
  };
};

// The run with the lower median wall time; the lower of the two middle runs on an even count.
const medianRun = (runs: BenchRun[]): BenchRun =>
  [...runs].sort((a, b) => a.wall_s - b.wall_s || a.run_id - b.run_id)[(runs.length - 1) >> 1]!;

const jobEnd = (j: BenchJob) => j.start_s + j.wall_s;

// Job dependencies by job kind, from .github/workflows/fast.yml: shards need plan, ci-ok needs every job.
// Run data has no dependency edges, and a job that ends as another starts is no proof of one.
const NEEDS: Record<string, string[] | "all"> = { "test (shards)": ["plan"], "ci-ok": "all" };

// The chain of jobs that sets the run length: the latest-ending job, then the latest-ending job
// it needs, and so on back.
function criticalPath(jobs: BenchJob[]): BenchJob[] {
  let cur = jobs.reduce((a, b) => (jobEnd(b) > jobEnd(a) ? b : a));
  const chain = [cur];
  for (;;) {
    const needs = NEEDS[jobKind(cur.name)];
    const prev = jobs
      .filter(
        (j) =>
          j.start_s < cur.start_s && needs && (needs === "all" || needs.includes(jobKind(j.name))),
      )
      .reduce<BenchJob | undefined>((a, b) => (!a || jobEnd(b) > jobEnd(a) ? b : a), undefined);
    if (!prev) return chain;
    chain.unshift(prev);
    cur = prev;
  }
}

export const timeline: Chart = (res, theme) => {
  const p = PALETTE[theme];
  const picked = PIPELINES.map(([w, m]) => medianRun(summarize(res.runs, w, m).ok));
  const [x0, x1, pitch, bh, top] = [135, W - 24, 18, 11, 100];
  const panels = picked.map((r) => {
    const origin = Math.min(...r.jobs.map((j) => j.start_s));
    const jobs = [...r.jobs].sort((a, b) => a.start_s - b.start_s || byName(a.name, b.name));
    return { r, jobs, origin, path: criticalPath(r.jobs) };
  });
  const alt = `Critical path of the median run: ${panels
    .map(
      ({ r, path }, i) =>
        `${PIPELINE_LABELS[i]} ${path.map((j) => j.name).join(", ")} ${sec(r.wall_s)}`,
    )
    .join("; ")}.`;
  const svg = frame(p, {
    title: "Where the time goes in one run",
    alt,
    sub: "Median run of each pipeline, jobs from start to end. Solid bars are the critical path.",
    top,
    rows: panels.reduce((n, pa) => n + pa.jobs.length + 2, 0),
    pitch,
    body: (bottom) => {
      const maxEnd = Math.max(
        ...panels.flatMap((pa) => pa.r.jobs.map((j) => jobEnd(j) - pa.origin)),
      );
      const ax = axis(
        p,
        maxEnd,
        x0,
        x1,
        top,
        bottom,
        "seconds since the first job of the run started",
      );
      const body = [seriesLegend(p, PIPELINE_LABELS), ...ax.markup];
      let y = top;
      panels.forEach(({ r, jobs, origin, path }, i) => {
        body.push(
          text(24, y + 13, `${PIPELINE_LABELS[i]}, ${sec(r.wall_s)}`, p, { bold: true }),
          text(W - 24, y + 13, `critical path: ${path.map((j) => j.name).join(", ")}`, p, {
            anchor: "end",
            fill: p.sub,
            size: SMALL,
          }),
        );
        jobs.forEach((j, k) => {
          const by = y + pitch * 1.5 + k * pitch;
          const on = path.includes(j);
          body.push(
            text(x0 - 10, by + bh - 1, j.name, p, { anchor: "end", size: SMALL, bold: on }),
            bar(
              ax.x(j.start_s - origin),
              ax.x(jobEnd(j) - origin),
              by,
              bh,
              p.series[i]!,
              true,
              !on,
            ),
          );
        });
        y += (jobs.length + 2) * pitch;
      });
      return body;
    },
  });
  return {
    svg,
    alt,
    caption:
      "The median run of each pipeline, job by job. Solid bars are the critical path, the chain of jobs that sets the wall time.",
  };
};

// Move each dot up or down until it touches no other dot. Deterministic: dots are placed left to right.
function swarm(xs: number[], r: number): number[] {
  const placed: [number, number][] = [];
  return xs.map((x) => {
    let dy = 0;
    for (let i = 0; i <= 26; i++) {
      dy = i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 2;
      if (placed.every(([px, py]) => Math.hypot(x - px, dy - py) >= 2 * r + 1)) break;
    }
    placed.push([x, dy]);
    return dy;
  });
}

export const runs: Chart = (res, theme) => {
  const p = PALETTE[theme];
  const s = pipelineStats(res.runs);
  const [top, pitch, r] = [100, 64, 5];
  const range = (x: (typeof s)[number]) =>
    `${Math.min(...x.ok.map((o) => o.wall_s))} to ${sec(Math.max(...x.ok.map((o) => o.wall_s)))}`;
  const alt = `Wall time of every run: ${s.map((x, i) => `${PIPELINE_LABELS[i]} ${range(x)}`).join(", ")}. Medians ${s.map((x) => sec(x.median_wall_s)).join(", ")}.`;
  const svg = frame(p, {
    title: "Every run, not just the median",
    alt,
    sub: `One dot per run, ${s[0]!.n} runs per pipeline`,
    top,
    rows: s.length,
    pitch,
    body: (bottom) => {
      const ax = axis(
        p,
        Math.max(...s.flatMap((x) => x.ok.map((o) => o.wall_s))),
        X0,
        X1,
        top,
        bottom,
        "wall time (s)",
      );
      const body = [
        seriesLegend(p, PIPELINE_LABELS, [{ label: "median", color: p.ink, tick: true }]),
        ...ax.markup,
      ];
      // All median ticks go in first and the dots after them, so the dots draw on top.
      const dots: string[] = [];
      s.forEach((x, i) => {
        const mid = top + i * pitch + pitch / 2;
        const xs = x.ok.map((o) => ax.x(o.wall_s)).sort((a, b) => a - b);
        body.push(
          text(X0 - 12, mid + 5, PIPELINE_LABELS[i]!, p, { anchor: "end" }),
          line(ax.x(x.median_wall_s), mid - 28, ax.x(x.median_wall_s), mid + 28, p.ink, 2),
          text(Math.max(...xs) + 14, mid + 5, `median ${sec(x.median_wall_s)}`, p),
        );
        const dys = swarm(xs, r);
        xs.forEach((cx, k) =>
          dots.push(
            `<circle cx="${f(cx)}" cy="${f(mid + dys[k]!)}" r="${r}" fill="${p.series[i]!}"/>`,
          ),
        );
      });
      return [...body, ...dots];
    },
  });
  return {
    svg,
    alt,
    caption:
      "Every run, one dot each. Dots that would overlap move up or down. The tick marks the median.",
  };
};

const STEP_LABELS = ["checkout", "setup", "work"];
function stepCategory(name: string): number | null {
  if (isBookkeeping(name)) return null;
  if (/actions\/checkout/.test(name)) return 0;
  if (/actions\/setup|actions\/cache/.test(name)) return 1;
  return 2;
}

// Median seconds per job kind, split into checkout, setup and work: baseline first, then fast jobs.
function stepRows(res: Results): { label: string; med: number[] }[] {
  const sums = (jobs: BenchJob[]) =>
    jobs.map((j) => {
      const t = [0, 0, 0];
      for (const st of j.steps) {
        const c = stepCategory(st.name);
        if (c !== null) t[c]! += st.s;
      }
      return t;
    });
  const rows: { label: string; med: number[] }[] = [];
  const add = (label: string, jobs: BenchJob[]) => {
    const t = sums(jobs);
    rows.push({ label, med: [0, 1, 2].map((c) => median(t.map((x) => x[c]!))) });
  };
  add(
    "test (baseline)",
    summarize(res.runs, "baseline", "full").ok.flatMap((r) => r.jobs),
  );
  const byKind = new Map<string, BenchJob[]>();
  for (const r of summarize(res.runs, "fast", "full").ok)
    for (const j of r.jobs)
      byKind.set(jobKind(j.name), [...(byKind.get(jobKind(j.name)) ?? []), j]);
  for (const [kind, jobs] of byKind) add(kind, jobs);
  return rows;
}

export const steps: Chart = (res, theme) => {
  const p = PALETTE[theme];
  const total = (m: number[]) => m[0]! + m[1]! + m[2]!;
  const [baseRow, ...kinds] = stepRows(res);
  const baseTotal = total(baseRow!.med);
  // Jobs that take no time (ci-ok) are left out; the largest job is on top.
  const rows = kinds.filter((r) => total(r.med) > 0).sort((a, b) => total(b.med) - total(a.med));
  const setupHeavy = rows.filter((r) => r.med[0]! + r.med[1]! > r.med[2]!).length;
  const count = `${setupHeavy} of ${rows.length} fast job kinds`;
  const alt = `Checkout and setup take more than work in ${count}. The baseline test job takes ${sec(baseTotal)}, not drawn.`;
  const [top, pitch, bh] = [100, 40, 14];
  const svg = frame(p, {
    title:
      setupHeavy * 2 > rows.length
        ? "Setup and checkout, not tests, are most of a fast job"
        : "Tests are most of a fast job",
    alt,
    sub: `Median seconds per step group, successful full runs. Not drawn: baseline test job: ${sec(baseTotal)}.`,
    top,
    rows: rows.length,
    pitch,
    foot: 76,
    body: (bottom) => {
      const ax = axis(
        p,
        Math.max(...rows.map((r) => total(r.med))),
        X0,
        X1,
        top,
        bottom,
        "seconds, median per step group",
      );
      const body = [seriesLegend(p, STEP_LABELS, [], p.steps), ...ax.markup];
      rows.forEach((r, i) => {
        const y = top + i * pitch + 4;
        body.push(text(X0 - 12, y + bh / 2 + 5, r.label, p, { anchor: "end" }));
        let acc = 0;
        const live = r.med.map((v, c) => ({ v, c })).filter((seg) => seg.v > 0);
        live.forEach((seg, k) => {
          const last = k === live.length - 1;
          const [a, b] = [ax.x(acc), ax.x(acc + seg.v)];
          acc += seg.v;
          body.push(bar(a, last ? b : b - 2, y, bh, p.steps[seg.c]!, last)); // 2 px gap between fills
          // The number sits under its segment, in ink, where the segment is wide enough for it.
          if (b - a >= 16)
            body.push(
              text((a + b) / 2, y + bh + 14, String(Number(seg.v.toFixed(1))), p, {
                anchor: "middle",
                size: SMALL,
              }),
            );
        });
        body.push(text(ax.x(total(r.med)) + 8, y + bh / 2 + 5, sec(total(r.med)), p));
      });
      body.push(
        text(
          24,
          bottom + 60,
          `Checkout and setup take more than work in ${count}. Shards count as one kind.`,
          p,
          { fill: p.sub, size: SMALL },
        ),
      );
      return body;
    },
  });
  return {
    svg,
    alt,
    caption: `Median seconds of each fast job, split into checkout, setup and work. The baseline test job takes ${sec(baseTotal)} and is not drawn.`,
  };
};

export const CHARTS: Record<string, Chart> = {
  "wall-time": wallTime,
  timeline,
  runs,
  steps,
};
