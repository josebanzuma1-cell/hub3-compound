/* Tool 16 — Lump sum versus dollar-cost averaging.

   The finding this tool exists to show is mechanical, not empirical: investing
   everything at once puts more money in the market for longer, so whenever the
   market rises over the period — which it does most of the time — lump sum
   wins. DCA is not a return strategy. It is a regret-management strategy that
   buys a narrower range of outcomes at the cost of a lower expected one.

   ON HISTORICAL DATA: the build plan asked for a backtest against real index
   returns. This simulates instead, and says so plainly. Shipping a hand-entered
   series of a hundred annual returns as "real historical data" would be the
   same failure as publishing an unsourced tax rate — plausible, unverifiable,
   and wrong in ways that change the conclusion. The mechanism is what matters
   and the simulation shows it honestly; drop a sourced CSV in later and the
   same model can replay it. */
import type { FieldSpec, Values } from '@kit/calc/url-state';

export const FIELDS: FieldSpec[] = [
  { key: 'amount', type: 'number', default: 120_000, min: 0, max: 100_000_000, dp: 0 },
  { key: 'months', type: 'number', default: 12,      min: 1, max: 120,         dp: 0 },
  { key: 'horizon',type: 'number', default: 10,      min: 1, max: 50,          dp: 0 },
  { key: 'ret',    type: 'number', default: 7,       min: -10, max: 25,        dp: 2 },
  { key: 'vol',    type: 'number', default: 15,      min: 0, max: 60,          dp: 2 },
  { key: 'cash',   type: 'number', default: 4,       min: 0, max: 20,          dp: 2 },
  { key: 'runs',   type: 'number', default: 2000,    min: 200, max: 10_000,    dp: 0 },
];

export const D = FIELDS.reduce<Record<string, number>>(
  (m, f) => ((m[f.key] = f.default as number), m), {});

export interface LumpDcaModel {
  lumpMedian: number;
  dcaMedian: number;
  lumpP10: number;
  dcaP10: number;
  lumpP90: number;
  dcaP90: number;
  lumpWinRate: number;
  medianAdvantage: number;
  medianAdvantagePct: number;
  /** how much narrower DCA's outcome range is */
  lumpSpread: number;
  dcaSpread: number;
  spreadReduction: number;
  worstCaseGap: number;
  dcaBetterInWorstCase: boolean;
  months: number;
  horizonMonths: number;
  runs: number;
  /** distribution of lump minus DCA, for the histogram */
  histogram: Array<{ from: number; to: number; count: number }>;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function pct(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function compute(v: Values): LumpDcaModel {
  const amount = Math.max(0, Number(v.amount) || 0);
  const months = Math.max(1, Math.round(Number(v.months) || 1));
  const horizonMonths = Math.max(months, Math.round((Number(v.horizon) || 1) * 12));
  const mean = (Number(v.ret) || 0) / 100;
  const vol = Math.max(0, Number(v.vol) || 0) / 100;
  const cash = Math.max(0, Number(v.cash) || 0) / 100;
  const runs = Math.max(100, Math.min(10_000, Math.round(Number(v.runs) || 2000)));

  // Monthly parameters. Volatility scales with the square root of time.
  const mMean = mean / 12;
  const mVol = vol / Math.sqrt(12);
  const mCash = cash / 12;
  const slice = amount / months;

  const seed = Math.abs(Math.round(amount + months * 977 + horizonMonths * 31 + mean * 1e6 + vol * 7e5 + runs)) || 1;

  const lumps: number[] = [];
  const dcas: number[] = [];
  const diffs: number[] = [];
  let lumpWins = 0;

  for (let r = 0; r < runs; r++) {
    const rand = mulberry32(seed + r * 2654435761);
    let lump = amount;
    let invested = 0;
    let waiting = amount;

    for (let m = 1; m <= horizonMonths; m++) {
      const shock = mMean + mVol * normal(rand);
      // Both experience the same market. The only difference is exposure.
      lump *= 1 + shock;
      invested *= 1 + shock;
      if (m <= months) {
        // Cash still on the sidelines earns the cash rate, then a slice moves in.
        waiting *= 1 + mCash;
        const put = Math.min(slice, waiting);
        waiting -= put;
        invested += put;
      }
    }
    const dca = invested + waiting;

    lumps.push(lump);
    dcas.push(dca);
    diffs.push(lump - dca);
    if (lump > dca) lumpWins++;
  }

  const sl = [...lumps].sort((a, b) => a - b);
  const sd = [...dcas].sort((a, b) => a - b);
  const sdiff = [...diffs].sort((a, b) => a - b);

  const lumpMedian = pct(sl, 0.5);
  const dcaMedian = pct(sd, 0.5);
  const lumpP10 = pct(sl, 0.1), lumpP90 = pct(sl, 0.9);
  const dcaP10 = pct(sd, 0.1), dcaP90 = pct(sd, 0.9);

  // Histogram of lump minus DCA, so the shape of the trade-off is visible:
  // a long right tail and a shorter left one is exactly the point.
  const lo = sdiff[0], hi = sdiff[sdiff.length - 1];
  const bins = 21;
  const width = (hi - lo) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, i) => ({
    from: lo + i * width, to: lo + (i + 1) * width, count: 0,
  }));
  for (const d of diffs) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((d - lo) / width)));
    histogram[idx].count++;
  }

  const lumpSpread = lumpP90 - lumpP10;
  const dcaSpread = dcaP90 - dcaP10;

  return {
    lumpMedian, dcaMedian, lumpP10, dcaP10, lumpP90, dcaP90,
    lumpWinRate: (lumpWins / runs) * 100,
    medianAdvantage: lumpMedian - dcaMedian,
    medianAdvantagePct: dcaMedian > 0 ? ((lumpMedian - dcaMedian) / dcaMedian) * 100 : 0,
    lumpSpread, dcaSpread,
    spreadReduction: lumpSpread > 0 ? ((lumpSpread - dcaSpread) / lumpSpread) * 100 : 0,
    worstCaseGap: dcaP10 - lumpP10,
    dcaBetterInWorstCase: dcaP10 > lumpP10,
    months, horizonMonths, runs, histogram,
  };
}
