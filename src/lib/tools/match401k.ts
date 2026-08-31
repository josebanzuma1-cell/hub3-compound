/* Tool 13 — 401(k) match optimiser.

   Two things worth more than the usual "contribute enough to get the match":

   1. THE FRONT-LOADING TRAP. Most employers match per pay period, not on an
      annual total. Contribute heavily early, hit the annual deferral limit in
      September, and your contributions stop — so the match stops too, for every
      remaining period. Employers with a "true-up" repair this after year end.
      Many do not, and the forfeited match is invisible unless you look.

   The deferral limit default is the 2026 figure (IRS IR-2025-111). It is an
   input rather than fixed data, but a stale default quietly misleads anyone
   who does not change it.

   2. VESTING. Match is not yours until it vests. Leaving before a cliff
      forfeits all of it; leaving mid-schedule forfeits part. */
import type { FieldSpec, Values } from '@kit/calc/url-state';

export const FIELDS: FieldSpec[] = [
  { key: 'salary', type: 'number', default: 95_000, min: 0, max: 10_000_000, dp: 0 },
  { key: 'freq',   type: 'number', default: 26,     min: 1, max: 52,         dp: 0 },
  { key: 'pct',    type: 'number', default: 10,     min: 0, max: 100,        dp: 2 },
  { key: 'm1pct',  type: 'number', default: 100,    min: 0, max: 200,        dp: 1 },
  { key: 'm1cap',  type: 'number', default: 3,      min: 0, max: 50,         dp: 2 },
  { key: 'm2pct',  type: 'number', default: 50,     min: 0, max: 200,        dp: 1 },
  { key: 'm2cap',  type: 'number', default: 2,      min: 0, max: 50,         dp: 2 },
  { key: 'limit',  type: 'number', default: 24_500, min: 1_000, max: 100_000, dp: 0 },
  { key: 'trueup', type: 'bool',   default: false },
  { key: 'vest',   type: 'number', default: 3,      min: 0, max: 10,         dp: 0 },
  { key: 'years',  type: 'number', default: 2,      min: 0, max: 50,         dp: 1 },
];

export const D = FIELDS.reduce<Record<string, number | string | boolean>>(
  (m, f) => ((m[f.key] = f.default), m), {});

export interface Match401kModel {
  perPeriodPay: number;
  yourContribution: number;
  matchEarned: number;
  matchIfSpreadEvenly: number;
  matchForfeited: number;
  hitLimitAtPeriod: number | null;
  fullMatchPct: number;
  capturingFullMatch: boolean;
  shortfallPct: number;
  missedByUnderContributing: number;
  vestedNow: number;
  unvestedNow: number;
  vestedPct: number;
  totalIntoAccount: number;
  effectiveReturn: number;
  periods: number;
}

/** Employer match on one period's contribution rate, two-tier formula. */
function matchOnRate(rate: number, m1pct: number, m1cap: number, m2pct: number, m2cap: number): number {
  const tier1 = Math.min(rate, m1cap) * (m1pct / 100);
  const tier2 = Math.max(0, Math.min(rate - m1cap, m2cap)) * (m2pct / 100);
  return tier1 + tier2;
}

export function compute(v: Values): Match401kModel {
  const salary = Math.max(0, Number(v.salary) || 0);
  const periods = Math.max(1, Math.round(Number(v.freq) || 26));
  const pct = Math.max(0, Number(v.pct) || 0);
  const m1pct = Math.max(0, Number(v.m1pct) || 0);
  const m1cap = Math.max(0, Number(v.m1cap) || 0);
  const m2pct = Math.max(0, Number(v.m2pct) || 0);
  const m2cap = Math.max(0, Number(v.m2cap) || 0);
  const limit = Math.max(0, Number(v.limit) || 0);
  const trueup = Boolean(v.trueup);
  const vestYears = Math.max(0, Math.round(Number(v.vest) || 0));
  const tenure = Math.max(0, Number(v.years) || 0);

  const perPeriodPay = salary / periods;
  const fullMatchPct = m1cap + (m2pct > 0 ? m2cap : 0);

  // Walk period by period, because that is how the limit bites and how the
  // match is actually credited.
  let contributed = 0;
  let matchEarned = 0;
  let hitLimitAtPeriod: number | null = null;

  for (let p = 1; p <= periods; p++) {
    const wanted = perPeriodPay * (pct / 100);
    const room = Math.max(0, limit - contributed);
    const actual = Math.min(wanted, room);
    if (actual <= 0 && wanted > 0 && hitLimitAtPeriod === null) hitLimitAtPeriod = p;
    contributed += actual;
    const effectiveRate = perPeriodPay > 0 ? (actual / perPeriodPay) * 100 : 0;
    matchEarned += perPeriodPay * (matchOnRate(effectiveRate, m1pct, m1cap, m2pct, m2cap) / 100);
  }

  // What the match would be if contributions were spread so every period still
  // received one — which is exactly what a true-up restores.
  const evenRate = Math.min(pct, limit > 0 && salary > 0 ? (limit / salary) * 100 : pct);
  const matchIfSpreadEvenly = salary * (matchOnRate(evenRate, m1pct, m1cap, m2pct, m2cap) / 100);

  const forfeitedByFrontLoading = Math.max(0, matchIfSpreadEvenly - matchEarned);
  const finalMatch = trueup ? matchIfSpreadEvenly : matchEarned;

  const maxMatch = salary * (matchOnRate(fullMatchPct, m1pct, m1cap, m2pct, m2cap) / 100);
  const missedByUnderContributing = Math.max(0, maxMatch - matchIfSpreadEvenly);

  const vestedPct = vestYears <= 0 ? 100 : Math.min(100, (tenure / vestYears) * 100);
  const vestedNow = finalMatch * (vestedPct / 100);

  return {
    perPeriodPay,
    yourContribution: contributed,
    matchEarned: finalMatch,
    matchIfSpreadEvenly,
    matchForfeited: trueup ? 0 : forfeitedByFrontLoading,
    hitLimitAtPeriod,
    fullMatchPct,
    capturingFullMatch: pct >= fullMatchPct - 1e-9,
    shortfallPct: Math.max(0, fullMatchPct - pct),
    missedByUnderContributing,
    vestedNow,
    unvestedNow: finalMatch - vestedNow,
    vestedPct,
    totalIntoAccount: contributed + finalMatch,
    // The match expressed as a return on your own money, before markets.
    effectiveReturn: contributed > 0 ? (finalMatch / contributed) * 100 : 0,
    periods,
  };
}
