/* KIT — hand-rolled SVG charts.
   No charting library. Recharts/Chart.js cost 40-90KB gzipped, which is the
   entire JS budget for the page, and neither draws anything these tools need
   that a path string can't. Everything here is one <svg> built from strings.

   The SVG uses a fixed viewBox and is scaled by CSS to 100% width, so the
   host element reserves its height from CSS before any data exists — the
   chart cannot shift layout when it renders. */

export interface Series {
  name: string;
  color: string;
  points: number[];
  /** draw as a filled area under the line */
  fill?: boolean;
  dashed?: boolean;
}

export interface LineChartOpts {
  series: Series[];
  /** x tick positions given as indexes into the points array */
  xTicks?: Array<{ at: number; label: string }>;
  yFormat?: (n: number) => string;
  xFormat?: (i: number) => string;
  /** force the y axis to include zero (default true) */
  zeroBaseline?: boolean;
  height?: number;
  legend?: boolean;
  /** hover readout — the "drag and watch it move" affordance */
  crosshair?: boolean;
  /** logarithmic y axis. Correct when series span orders of magnitude — a
   *  percentile fan around a compounding balance squashes the median flat
   *  against the axis on a linear scale. Values at or below zero are floored. */
  logScale?: boolean;
}

const VB_W = 680;
const PAD = { t: 12, r: 14, b: 26, l: 52 };
const NS = 'http://www.w3.org/2000/svg';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Pick ~4 round-number gridlines spanning [min,max]. */
function ticks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min || 0];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) out.push(v);
  return out.length ? out : [min, max];
}

function path(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');
}

export function lineChart(host: HTMLElement, opts: LineChartOpts): void {
  const H = opts.height ?? 220;
  const series = opts.series.filter((s) => s.points.length > 0);
  if (!series.length) {
    host.innerHTML = `<div class="chart__empty" style="height:${H}px">No data</div>`;
    return;
  }

  const n = Math.max(...series.map((s) => s.points.length));
  const all = series.flatMap((s) => s.points).filter(Number.isFinite);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (opts.zeroBaseline !== false) lo = Math.min(lo, 0);
  if (lo === hi) { hi = lo + 1; }

  const plotW = VB_W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const X = (i: number) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  let yTicks: number[];
  let Y: (v: number) => number;

  if (opts.logScale) {
    // Floor at one order of magnitude below the smallest positive value so a
    // series that hits zero still has somewhere to sit.
    const positives = all.filter((v) => v > 0);
    const smallest = positives.length ? Math.min(...positives) : 1;
    const top = Math.max(hi, smallest * 10);
    // Never show more than four decades: a single near-zero path would
    // otherwise stretch the axis until everything else is a flat line.
    const floor = Math.max(
      Math.pow(10, Math.floor(Math.log10(smallest))),
      Math.pow(10, Math.ceil(Math.log10(top)) - 4),
    );
    // Ticks sit on powers of ten, but the axis itself ends at the real maximum
    // rather than rounding up a full decade and wasting half the plot.
    yTicks = [];
    for (let t = Math.pow(10, Math.ceil(Math.log10(floor))); t <= top; t *= 10) yTicks.push(t);
    const lgLo = Math.log10(floor);
    const lgHi = Math.log10(top);
    Y = (v: number) => {
      const lg = Math.log10(Math.max(v, floor));
      return PAD.t + plotH - ((lg - lgLo) / (lgHi - lgLo)) * plotH;
    };
    lo = floor; hi = top;
  } else {
    yTicks = ticks(lo, hi);
    lo = Math.min(lo, yTicks[0]);
    hi = Math.max(hi, yTicks[yTicks.length - 1]);
    Y = (v: number) => PAD.t + plotH - ((v - lo) / (hi - lo)) * plotH;
  }

  const yFmt = opts.yFormat ?? ((v: number) => String(Math.round(v)));

  const grid = yTicks.map((t) =>
    `<line x1="${PAD.l}" y1="${Y(t).toFixed(1)}" x2="${VB_W - PAD.r}" y2="${Y(t).toFixed(1)}"/>`
  ).join('');

  const yLabels = yTicks.map((t) =>
    `<text x="${PAD.l - 8}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end">${esc(yFmt(t))}</text>`
  ).join('');

  const xTicks = opts.xTicks ?? [];
  const xLabels = xTicks.map((t) =>
    `<text x="${X(t.at).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(t.label)}</text>`
  ).join('');

  // Area fills sit on the axis floor. On a log axis that floor is a positive
  // number, not zero, so it is computed once here rather than inline twice.
  const baseY = Y(opts.logScale ? lo : Math.max(lo, 0)).toFixed(1);

  const paths = series.map((s) => {
    const pts = s.points.map((v, i) => [X(i), Y(v)] as [number, number]);
    const d = path(pts);
    const area = s.fill
      ? `<path d="${d}L${X(s.points.length - 1).toFixed(1)} ${baseY}L${X(0).toFixed(1)} ${baseY}Z" fill="${s.color}" opacity=".10" stroke="none"/>`
      : '';
    return `${area}<path d="${d}" stroke="${s.color}"${s.dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
  }).join('');

  const zeroLine = lo < 0 && hi > 0
    ? `<line x1="${PAD.l}" y1="${Y(0).toFixed(1)}" x2="${VB_W - PAD.r}" y2="${Y(0).toFixed(1)}" stroke="var(--c-line-2)" stroke-width="1"/>` : '';

  host.innerHTML =
    `<svg viewBox="0 0 ${VB_W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))}" preserveAspectRatio="none" style="height:${H}px">` +
      `<g class="chart__grid">${grid}</g>${zeroLine}` +
      `<g class="chart__axis">${yLabels}${xLabels}</g>` +
      `<g class="chart__series">${paths}</g>` +
      (opts.crosshair ? `<g class="chart__hover" style="display:none"><line stroke="var(--c-ink-3)" stroke-width="1" stroke-dasharray="3 3"/>${series.map((s) => `<circle r="3.5" fill="${s.color}" stroke="var(--c-surface)" stroke-width="1.5"/>`).join('')}</g><rect x="${PAD.l}" y="${PAD.t}" width="${plotW}" height="${plotH}" fill="transparent" class="chart__hit"/>` : '') +
    `</svg>` +
    (opts.legend === false ? '' :
      `<div class="chart__legend">${series.map((s) =>
        `<span><i class="chart__swatch" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}` +
      `<span class="chart__readout" style="margin-left:auto;color:var(--c-ink-3)"></span></div>`);

  if (opts.crosshair) attachCrosshair(host, { series, n, X, Y, yFmt, xFormat: opts.xFormat, PAD, plotH });
}

interface CrosshairCtx {
  series: Series[];
  n: number;
  X: (i: number) => number;
  Y: (v: number) => number;
  yFmt: (n: number) => string;
  xFormat?: (i: number) => string;
  PAD: typeof PAD;
  plotH: number;
}

function attachCrosshair(host: HTMLElement, ctx: CrosshairCtx): void {
  const svg = host.querySelector('svg');
  const hit = host.querySelector<SVGRectElement>('.chart__hit');
  const group = host.querySelector<SVGGElement>('.chart__hover');
  const readout = host.querySelector<HTMLElement>('.chart__readout');
  if (!svg || !hit || !group) return;

  const line = group.querySelector('line')!;
  const dots = Array.from(group.querySelectorAll('circle'));

  function move(clientX: number) {
    const box = svg!.getBoundingClientRect();
    const vbX = ((clientX - box.left) / box.width) * VB_W;
    const frac = (vbX - ctx.PAD.l) / (VB_W - ctx.PAD.l - PAD.r);
    const i = Math.max(0, Math.min(ctx.n - 1, Math.round(frac * (ctx.n - 1))));
    const x = ctx.X(i);

    group!.style.display = '';
    line.setAttribute('x1', String(x)); line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(ctx.PAD.t)); line.setAttribute('y2', String(ctx.PAD.t + ctx.plotH));

    ctx.series.forEach((s, si) => {
      const v = s.points[Math.min(i, s.points.length - 1)];
      const dot = dots[si];
      if (dot && Number.isFinite(v)) {
        dot.setAttribute('cx', String(x));
        dot.setAttribute('cy', String(ctx.Y(v)));
        dot.style.display = '';
      } else if (dot) dot.style.display = 'none';
    });

    if (readout) {
      const label = ctx.xFormat ? ctx.xFormat(i) : `#${i}`;
      const vals = ctx.series
        .map((s) => `${s.name} ${ctx.yFmt(s.points[Math.min(i, s.points.length - 1)])}`)
        .join(' · ');
      readout.textContent = `${label} — ${vals}`;
    }
  }

  hit.addEventListener('pointermove', (e) => move(e.clientX));
  hit.addEventListener('pointerleave', () => {
    group.style.display = 'none';
    if (readout) readout.textContent = '';
  });
}

export interface BarChartOpts {
  /** one group per x position; each group is a stack of segments */
  groups: Array<{ label: string; segments: Array<{ value: number; color: string; name: string }> }>;
  yFormat?: (n: number) => string;
  height?: number;
  maxLabels?: number;
}

/** Stacked bars — principal vs interest per year, cost breakdowns. */
export function stackedBarChart(host: HTMLElement, opts: BarChartOpts): void {
  const H = opts.height ?? 220;
  const groups = opts.groups;
  if (!groups.length) {
    host.innerHTML = `<div class="chart__empty" style="height:${H}px">No data</div>`;
    return;
  }

  const totals = groups.map((g) => g.segments.reduce((a, s) => a + Math.max(0, s.value), 0));
  const hi = Math.max(...totals, 1);
  const yTicks = ticks(0, hi);
  const top = Math.max(hi, yTicks[yTicks.length - 1]);

  const plotW = VB_W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const slot = plotW / groups.length;
  const barW = Math.max(2, Math.min(slot * 0.68, 42));
  const Y = (v: number) => PAD.t + plotH - (v / top) * plotH;
  const yFmt = opts.yFormat ?? ((v: number) => String(Math.round(v)));

  const grid = yTicks.map((t) =>
    `<line x1="${PAD.l}" y1="${Y(t).toFixed(1)}" x2="${VB_W - PAD.r}" y2="${Y(t).toFixed(1)}"/>`).join('');
  const yLabels = yTicks.map((t) =>
    `<text x="${PAD.l - 8}" y="${(Y(t) + 3.5).toFixed(1)}" text-anchor="end">${esc(yFmt(t))}</text>`).join('');

  const every = Math.max(1, Math.ceil(groups.length / (opts.maxLabels ?? 10)));
  let bars = '', xLabels = '';
  groups.forEach((g, i) => {
    const cx = PAD.l + slot * i + slot / 2;
    let acc = 0;
    for (const seg of g.segments) {
      const v = Math.max(0, seg.value);
      const y = Y(acc + v), h = Math.max(0, Y(acc) - Y(acc + v));
      bars += `<rect x="${(cx - barW / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${seg.color}"><title>${esc(g.label)} — ${esc(seg.name)}: ${esc(yFmt(v))}</title></rect>`;
      acc += v;
    }
    if (i % every === 0) xLabels += `<text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(g.label)}</text>`;
  });

  const legendItems = groups[0].segments.map((s) =>
    `<span><i class="chart__swatch" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');

  host.innerHTML =
    `<svg viewBox="0 0 ${VB_W} ${H}" role="img" preserveAspectRatio="none" style="height:${H}px">` +
      `<g class="chart__grid">${grid}</g><g class="chart__axis">${yLabels}${xLabels}</g><g>${bars}</g>` +
    `</svg><div class="chart__legend">${legendItems}</div>`;
}
