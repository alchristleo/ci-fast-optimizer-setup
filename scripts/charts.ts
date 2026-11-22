// SVG charts for the README bench section. Pure functions: same data and theme, same bytes.
import { median, summarize, type BenchJob, type BenchRun, type Results } from "./bench";

export type Theme = "light" | "dark";
export type Chart = (res: Results, theme: Theme) => string;

const W = 720;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const PALETTE = {
  light: {
    bg: "#fcfcfb",
    ink: "#0b0b0b",
    sub: "#52514e",
    grid: "#e4e3df",
    series: ["#2a78d6", "#eb6834", "#1baf7a"],
  },
  dark: {
    bg: "#1a1a19",
    ink: "#f0efec",
    sub: "#c3c2b7",
    grid: "#33332f",
    series: ["#3987e5", "#d95926", "#199e70"],
  },
};
type Pal = (typeof PALETTE)[Theme];

const PIPELINES = [
  ["baseline", "full"],
  ["fast", "full"],
  ["fast", "pr"],
] as const;
const PIPELINE_LABELS = PIPELINES.map(([w, m]) => `${w} ${m}`);

const f = (n: number) => n.toFixed(1);
// Whole seconds stay whole, so "220 s" matches the README table.
const sec = (n: number) => `${Number(n.toFixed(1))} s`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
function bar(x0: number, x1: number, y: number, h: number, fill: string, round = true): string {
  const w = Math.max(x1 - x0, 1);
  const r = round ? Math.min(4, w, h / 2) : 0;
  if (!r) return `<rect x="${f(x0)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"/>`;
  const e = x0 + w;
  return `<path d="M${f(x0)} ${f(y)}H${f(e - r)}A${f(r)} ${f(r)} 0 0 1 ${f(e)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(e - r)} ${f(y + h)}H${f(x0)}Z" fill="${fill}"/>`;
}

type LegendItem = { label: string; color: string; tick?: boolean };
function legend(items: LegendItem[], x: number, y: number, p: Pal): string {
  let cx = x;
  const out: string[] = [];
  for (const it of items) {
    out.push(
      it.tick
        ? line(cx + 5, y - 10, cx + 5, y + 2, it.color, 2)
        : `<rect x="${f(cx)}" y="${f(y - 10)}" width="10" height="10" rx="2" fill="${it.color}"/>`,
      text(cx + 16, y, it.label, p),
    );
    cx += 16 + it.label.length * 7 + 22; // 7 px per character leaves slack for wider fonts
  }
  return out.join("\n");
}

function niceStep(max: number): number {
  return [5, 10, 20, 25, 50, 100, 200, 500].find((s) => max / s <= 7) ?? 1000;
}

type Frame = { title: string; desc: string; sub: string; height: number; body: string[] };
function frame(p: Pal, a: Frame): string {
  return (
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${a.height}" viewBox="0 0 ${W} ${a.height}" role="img" font-family="${FONT}" font-size="12">`,
      `<title>${esc(a.title)}</title>`,
      `<desc>${esc(a.desc)}</desc>`,
      `<rect width="${W}" height="${a.height}" fill="${p.bg}"/>`,
      text(24, 30, a.title, p, { size: 16, bold: true }),
      text(24, 50, a.sub, p, { fill: p.sub }),
      ...a.body,
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
      text(x(v), bottom + 16, String(v), p, { anchor: "middle", fill: p.sub, size: 11 }),
    );
  }
  out.push(text(x1, bottom + 32, unit, p, { anchor: "end", fill: p.sub, size: 11 }));
  return { x, markup: out };
}

const stats = (res: Results) => PIPELINES.map(([w, m]) => summarize(res.runs, w, m));

export const wallTime: Chart = (res, theme) => {
  const p = PALETTE[theme];
  const s = stats(res);
  const ratio = (s[0]!.median_wall_s / s[1]!.median_wall_s).toFixed(2);
  const [x0, x1, top, pitch, bh] = [140, 570, 92, 44, 16];
  const bottom = top + pitch * 3;
  const ax = axis(p, Math.max(...s.map((r) => r.p90_wall_s)), x0, x1, top, bottom, "wall time (s)");
  const body = [
    legend(
      PIPELINE_LABELS.map((label, i) => ({ label, color: p.series[i]! })),
      24,
      76,
      p,
    ),
  ];
  body.push(...ax.markup);
  s.forEach((r, i) => {
    const y = top + i * pitch + (pitch - bh) / 2;
    const mid = y + bh / 2;
    const [xm, xp] = [ax.x(r.median_wall_s), ax.x(r.p90_wall_s)];
    body.push(
      text(x0 - 12, mid + 4, PIPELINE_LABELS[i]!, p, { anchor: "end" }),
      bar(x0, xm, y, bh, p.series[i]!),
      line(xm, mid, xp, mid, p.sub, 1.5),
      line(xp, mid - 5, xp, mid + 5, p.sub, 1.5),
      text(xp + 10, mid + 4, `${sec(r.median_wall_s)}, p90 ${sec(r.p90_wall_s)}`, p),
    );
  });
  body.push(
    text(
      24,
      bottom + 56,
      `Whisker marks p90. With ${s[0]!.n} runs per pipeline, p90 is the slowest run.`,
      p,
      {
        fill: p.sub,
        size: 11,
      },
    ),
  );
  const title = `Median CI wall time, ${ratio}x faster`;
  return frame(p, {
    title,
    desc: `Horizontal bars of median wall time: baseline full ${sec(s[0]!.median_wall_s)}, fast full ${sec(s[1]!.median_wall_s)}, fast pr ${sec(s[2]!.median_wall_s)}. Whiskers mark p90.`,
    sub: `baseline full ${sec(s[0]!.median_wall_s)} to fast full ${sec(s[1]!.median_wall_s)}`,
    height: bottom + 68,
    body,
  });
};

// The run with the lower median wall time; the lower of the two middle runs on an even count.
const medianRun = (runs: BenchRun[]): BenchRun =>
  [...runs].sort((a, b) => a.wall_s - b.wall_s || a.run_id - b.run_id)[(runs.length - 1) >> 1]!;

export const timeline: Chart = (res, theme) => {
  const p = PALETTE[theme];
  const picked = PIPELINES.map(([w, m]) => medianRun(summarize(res.runs, w, m).ok));
  const end = (j: BenchJob) => (j.start_s ?? 0) + j.wall_s;
  const [x0, x1, pitch, bh] = [120, 560, 16, 10];
  let y = 92;
  const panels: string[] = [];
  const layout = picked.map((r) => {
    const jobs = [...r.jobs].sort(
      (a, b) => (a.start_s ?? 0) - (b.start_s ?? 0) || a.name.localeCompare(b.name),
    );
    const top = y;
    y += 22 + jobs.length * pitch + 14;
    return { r, jobs, top };
  });
  const bottom = y - 14;
  const maxEnd = Math.max(...picked.flatMap((r) => r.jobs.map(end)));
  const ax = axis(p, maxEnd, x0, x1, 92, bottom, "seconds since the run was created");
  layout.forEach(({ r, jobs, top }, i) => {
    const color = p.series[i]!;
    panels.push(
      text(
        24,
        top + 12,
        `${PIPELINE_LABELS[i]}, run wall ${sec(r.wall_s)}, axis from run created`,
        p,
        { bold: true },
      ),
    );
    const critical = jobs.reduce((a, b) => (end(b) > end(a) ? b : a));
    jobs.forEach((j, k) => {
      const by = top + 22 + k * pitch;
      panels.push(
        text(x0 - 10, by + bh - 1, j.name, p, { anchor: "end", size: 11 }),
        bar(ax.x(j.start_s ?? 0), ax.x(end(j)), by, bh, color),
      );
      if (j === critical)
        panels.push(
          text(ax.x(end(j)) + 8, by + bh - 1, `critical path, ${sec(end(j))}`, p, { size: 11 }),
        );
    });
  });
  const body = [
    legend(
      PIPELINE_LABELS.map((label, i) => ({ label, color: p.series[i]! })),
      24,
      76,
      p,
    ),
    ...ax.markup,
    ...panels,
  ];
  return frame(p, {
    title: "Where the time goes in one run",
    desc: `Gantt chart of the median run of each pipeline on one time axis, each job a bar from its start to its end. Critical path ends at ${PIPELINES.map(([w, m], i) => `${w} ${m} ${sec(Math.max(...picked[i]!.jobs.map(end)))}`).join(", ")}.`,
    sub: "Median-wall-time run of each pipeline, jobs from start to end",
    height: bottom + 44,
    body,
  });
};

export const runs: Chart = (res, theme) => {
  const p = PALETTE[theme];
  const s = stats(res);
  const [x0, x1, top, pitch] = [140, 570, 92, 40];
  const bottom = top + pitch * 3;
  const ax = axis(
    p,
    Math.max(...s.flatMap((r) => r.ok.map((o) => o.wall_s))),
    x0,
    x1,
    top,
    bottom,
    "wall time (s)",
  );
  const body = [
    legend(
      [
        ...PIPELINE_LABELS.map((label, i) => ({ label, color: p.series[i]! })),
        { label: "median", color: p.ink, tick: true },
      ],
      24,
      76,
      p,
    ),
    ...ax.markup,
  ];
  s.forEach((r, i) => {
    const mid = top + i * pitch + pitch / 2;
    const xs = r.ok.map((o) => ax.x(o.wall_s)).sort((a, b) => a - b);
    xs.forEach((x, k) => {
      // A dot within 8 px of an earlier one moves up or down so equal times stay visible.
      const near = xs.slice(0, k).filter((o) => x - o < 8).length;
      const dy = near === 0 ? 0 : (near % 2 ? -1 : 1) * Math.ceil(near / 2) * 5;
      body.push(
        `<circle cx="${f(x)}" cy="${f(mid + dy)}" r="4.5" fill="${p.series[i]!}" stroke="${p.bg}" stroke-width="1.5"/>`,
      );
    });
    body.push(
      text(x0 - 12, mid + 4, PIPELINE_LABELS[i]!, p, { anchor: "end" }),
      line(ax.x(r.median_wall_s), mid - 13, ax.x(r.median_wall_s), mid + 13, p.ink, 2),
      text(Math.max(...xs) + 12, mid + 4, `median ${sec(r.median_wall_s)}`, p),
    );
  });
  return frame(p, {
    title: "Every run, not just the median",
    desc: `Dot plot of the wall time of every successful run: ${s.map((r, i) => `${PIPELINE_LABELS[i]} ${r.ok.map((o) => sec(o.wall_s)).join(", ")}`).join("; ")}.`,
    sub: `One dot per run, ${s[0]!.n} runs per pipeline`,
    height: bottom + 44,
    body,
  });
};

const STEP_LABELS = ["checkout", "setup", "work"];
// Runner bookkeeping steps are left out, as in the README step table.
function stepCategory(name: string): number | null {
  if (/^(Set up job|Post |Complete job)/.test(name)) return null;
  if (/actions\/checkout/.test(name)) return 0;
  if (/actions\/setup|actions\/cache/.test(name)) return 1;
  return 2;
}

// Median seconds per job kind, split into checkout, setup and work: baseline first, then fast jobs.
export function stepRows(res: Results): { label: string; med: number[] }[] {
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
  const base = summarize(res.runs, "baseline", "full").ok.flatMap((r) => r.jobs);
  add("test (baseline)", base);
  const byKind = new Map<string, BenchJob[]>();
  for (const r of summarize(res.runs, "fast", "full").ok)
    for (const j of r.jobs) {
      // Shards are one job kind, as in the README step table.
      const kind = j.name.replace(/ \(shard \d+\)$/, " (shards)");
      byKind.set(kind, [...(byKind.get(kind) ?? []), j]);
    }
  for (const [kind, jobs] of byKind) add(kind, jobs);
  return rows;
}

export const steps: Chart = (res, theme) => {
  const p = PALETTE[theme];
  const rows = stepRows(res);
  const [x0, x1, top, pitch, bh] = [140, 570, 92, 22, 12];
  const bottom = top + pitch * rows.length;
  const total = (m: number[]) => m[0]! + m[1]! + m[2]!;
  const ax = axis(
    p,
    Math.max(...rows.map((r) => total(r.med))),
    x0,
    x1,
    top,
    bottom,
    "sum of median checkout, setup and work (s)",
  );
  const body = [
    legend(
      STEP_LABELS.map((label, i) => ({ label, color: p.series[i]! })),
      24,
      76,
      p,
    ),
    ...ax.markup,
  ];
  rows.forEach((r, i) => {
    const y = top + i * pitch + (pitch - bh) / 2;
    body.push(text(x0 - 12, y + bh - 2, r.label, p, { anchor: "end" }));
    let acc = 0;
    const live = r.med.map((v, c) => ({ v, c })).filter((s) => s.v > 0);
    live.forEach((seg, k) => {
      const last = k === live.length - 1;
      const [a, b] = [ax.x(acc), ax.x(acc + seg.v)];
      acc += seg.v;
      body.push(bar(a, last ? b : b - 2, y, bh, p.series[seg.c]!, last)); // 2 px gap between fills
    });
    body.push(text(ax.x(total(r.med)) + 8, y + bh - 2, sec(total(r.med)), p));
  });
  const [b, ...fast] = rows;
  return frame(p, {
    title: "Where each job spends its seconds",
    desc: `Stacked bars per job in successful full runs: the median seconds of checkout, setup and work, added up. ${b!.label} takes ${sec(total(b!.med))}. The longest fast job takes ${sec(Math.max(...fast.map((r) => total(r.med))))}.`,
    sub: "Median seconds per step group, successful full runs, runner bookkeeping left out",
    height: bottom + 44,
    body,
  });
};

export const CHARTS: Record<string, Chart> = {
  "wall-time": wallTime,
  timeline,
  runs,
  steps,
};
