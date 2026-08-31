/* Tool 14 — FIRE projection with Monte Carlo.

   Why simulate rather than compound an average: a portfolio being drawn down
   is sensitive to the ORDER returns arrive in, not just their average. Two
   sequences with identical mean and identical volatility can leave one retiree
   solvent at ninety and the other broke at seventy-two, because the second
   met a bad decade while withdrawing. Compounding a single average return
   cannot show that — it produces one smooth line that is wrong in a specific,
   optimistic direction.

   Deliberate limitations, stated on the page:
   - Returns are drawn from a normal distribution. Real markets have fatter
     tails and some mean reversion, so this understates extreme outcomes.
   - Everything is in today's money: enter a REAL return, and spending stays
     constant in real terms.
   - Spending is a fixed real amount. Real retirees cut back in bad years,
     which raises success rates well above what a fixed rule produces. */
import type { FieldSpec, Values } from '@kit/calc/url-state';

export const FIELDS: FieldSpec[] = [
  { key: 'age',    type: 'number', default: 32,      min: 16, max: 90,         dp: 0 },
  { key: 'retire', type: 'number', default: 55,      min: 20, max: 95,         dp: 0 },
  { key: 'until',  type: 'number', default: 95,      min: 40, max: 110,        dp: 0 },
  { key: 'pot',    type: 'number', default: 120_000, min: 0,  max: 50_000_000, dp: 0 },
  { key: 'save',   type: 'number', default: 30_000,  min: 0,  max: 5_000_000,  dp: 0 },
  { key: 'spend',  type: 'number', default: 55_000,  min: 0,  max: 5_000_000,  dp: 0 },
  { key: 'ret',    type: 'number', default: 5.0,     min: -5, max: 20,         dp: 2 },
  { key: 'vol',    type: 'number', default: 15.0,    min: 0,  max: 60,         dp: 2 },
  { key: 'fees',   type: 'number', default: 0.15,    min: 0,  max: 5,          dp: 3 },
  { key: 'runs',   type: 'number', default: 1000,    min: 200, max: 5000,      dp: 0 },
];

export const D = FIELDS.reduce<Record<string, number>>(
  (m, f) => ((m[f.key] = f.default as number), m), {});

export interface FireModel {
  until: number;
  deterministicEnd: number;
  yearsToRetire: number;
  yearsInRetirement: number;
  fiNumber: number;
  potAtRetirementMedian: number;
  successRate: number;
  medianEnding: number;
  p10Ending: number;
  depletionAgeP10: number | null;
  medianDepletionAge: number | null;
  safeWithdrawalRate: number;
  firstYearWithdrawalRate: number;
  /** percentile bands, one point per year from now */
  p10: number[];
  p50: number[];
  p90: number[];
  ages: number[];
  runs: number;
  deterministic: number[];
  sequenceRiskGap: number;
}

/** Seeded PRNG. Results must be reproducible: a shared URL has to reproduce
 *  the same simulation, and a slider nudge should not reshuffle every path. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: two uniforms in, one standard normal out. */
function normal(rand: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function compute(v: Values): FireModel {
  const age = Math.round(Number(v.age) || 0);
  const retire = Math.max(age, Math.round(Number(v.retire) || age));
  const until = Math.max(retire + 1, Math.round(Number(v.until) || retire + 1));
  const pot0 = Math.max(0, Number(v.pot) || 0);
  const save = Math.max(0, Number(v.save) || 0);
  const spend = Math.max(0, Number(v.spend) || 0);
  const mean = (Number(v.ret) || 0) / 100;
  const vol = Math.max(0, Number(v.vol) || 0) / 100;
  const fees = Math.max(0, Number(v.fees) || 0) / 100;
  const runs = Math.max(50, Math.min(5000, Math.round(Number(v.runs) || 1000)));

  const netMean = mean - fees;
  const yearsToRetire = retire - age;
  const yearsInRetirement = until - retire;
  const totalYears = until - age;

  // Seed from the inputs, so the same scenario always produces the same paths
  // while a genuinely different scenario gets different ones.
  const seed = Math.abs(Math.round(
    pot0 * 7 + save * 13 + spend * 17 + retire * 101 + until * 211 + mean * 100003 + vol * 70001 + runs,
  )) || 1;

  // balances[year][run] would be the obvious shape; transposing to
  // perYear[year] = sorted balances lets us read percentiles directly.
  const perYear: number[][] = Array.from({ length: totalYears + 1 }, () => []);
  let successes = 0;
  const endings: number[] = [];
  const potsAtRetirement: number[] = [];
  const depletionAges: number[] = [];

  for (let r = 0; r < runs; r++) {
    const rand = mulberry32(seed + r * 2654435761);
    let bal = pot0;
    let depleted: number | null = null;
    perYear[0].push(bal);

    for (let y = 1; y <= totalYears; y++) {
      const currentAge = age + y;
      const shock = netMean + vol * normal(rand);
      // Contributions and withdrawals happen across the year; applying half
      // before growth and half after avoids the systematic bias of doing
      // either entirely at one end.
      const flow = currentAge <= retire ? save : -spend;
      bal = (bal + flow / 2) * (1 + shock) + flow / 2;
      if (bal <= 0) { bal = 0; if (depleted === null) depleted = currentAge; }
      perYear[y].push(bal);
      if (currentAge === retire) potsAtRetirement.push(bal);
    }

    endings.push(bal);
    if (depleted === null) successes++; else depletionAges.push(depleted);
  }

  for (const col of perYear) col.sort((a, b) => a - b);
  const sortedEndings = [...endings].sort((a, b) => a - b);
  const sortedPots = [...potsAtRetirement].sort((a, b) => a - b);
  const sortedDepletion = [...depletionAges].sort((a, b) => a - b);

  // The deterministic path: the same inputs compounded at the average, with no
  // variance at all. Shown alongside so the gap is visible.
  const deterministic: number[] = [pot0];
  let d = pot0;
  for (let y = 1; y <= totalYears; y++) {
    const currentAge = age + y;
    const flow = currentAge <= retire ? save : -spend;
    d = Math.max(0, (d + flow / 2) * (1 + netMean) + flow / 2);
    deterministic.push(d);
  }

  const safeWithdrawalRate = 4;
  const fiNumber = spend * (100 / safeWithdrawalRate);
  const medianPot = percentile(sortedPots, 0.5);

  return {
    until,
    deterministicEnd: deterministic[deterministic.length - 1],
    yearsToRetire,
    yearsInRetirement,
    fiNumber,
    potAtRetirementMedian: medianPot,
    successRate: (successes / runs) * 100,
    medianEnding: percentile(sortedEndings, 0.5),
    p10Ending: percentile(sortedEndings, 0.1),
    depletionAgeP10: sortedDepletion.length ? percentile(sortedDepletion, 0.1) : null,
    medianDepletionAge: sortedDepletion.length ? percentile(sortedDepletion, 0.5) : null,
    safeWithdrawalRate,
    firstYearWithdrawalRate: medianPot > 0 ? (spend / medianPot) * 100 : 0,
    p10: perYear.map((c) => percentile(c, 0.1)),
    p50: perYear.map((c) => percentile(c, 0.5)),
    p90: perYear.map((c) => percentile(c, 0.9)),
    ages: Array.from({ length: totalYears + 1 }, (_, i) => age + i),
    runs,
    deterministic,
    // How much the smooth-average path overstates the median simulation.
    sequenceRiskGap: deterministic[deterministic.length - 1] - percentile(sortedEndings, 0.5),
  };
}
