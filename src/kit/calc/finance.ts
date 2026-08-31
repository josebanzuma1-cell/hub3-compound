/* KIT — time-value-of-money primitives.
   Generic across hubs: mortgage (1), auto (9), debt payoff (10), savings (11).
   Mortgage-specific models live in src/lib/, not here. */

export const monthlyRate = (annualPct: number): number => annualPct / 100 / 12;

/** Level payment for a fully amortising loan. Handles the 0% edge case. */
export function pmt(annualPct: number, termMonths: number, principal: number): number {
  if (termMonths <= 0 || principal <= 0) return 0;
  const r = monthlyRate(annualPct);
  if (r === 0) return principal / termMonths;
  const f = Math.pow(1 + r, termMonths);
  return (principal * r * f) / (f - 1);
}

/** Remaining balance after k payments of a level-payment loan. */
export function balanceAfter(annualPct: number, termMonths: number, principal: number, k: number): number {
  const r = monthlyRate(annualPct);
  const p = pmt(annualPct, termMonths, principal);
  if (r === 0) return Math.max(0, principal - p * k);
  const f = Math.pow(1 + r, k);
  return Math.max(0, principal * f - p * ((f - 1) / r));
}

/** Future value of a lump sum plus a level monthly contribution. */
export function futureValue(annualPct: number, months: number, contribution: number, present = 0): number {
  const r = monthlyRate(annualPct);
  if (r === 0) return present + contribution * months;
  const f = Math.pow(1 + r, months);
  return present * f + contribution * ((f - 1) / r);
}

export function npv(annualPct: number, cashflows: number[]): number {
  const r = annualPct / 100;
  return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i), 0);
}

/** IRR by bisection — slower than Newton but cannot diverge, which matters
 *  when a user drags a slider into a nonsensical cashflow shape. */
export function irr(cashflows: number[], lo = -0.99, hi = 10): number | null {
  const f = (r: number) => cashflows.reduce((a, cf, i) => a + cf / Math.pow(1 + r, i), 0);
  let flo = f(lo), fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-7) return mid * 100;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return ((lo + hi) / 2) * 100;
}

export interface AmortRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  extra: number;
  balance: number;
}

export interface AmortInput {
  principal: number;
  annualPct: number;
  termMonths: number;
  /** additional principal applied every month */
  extraMonthly?: number;
  /** additional principal applied once a year, in the given month (1-12) */
  extraAnnual?: number;
  extraAnnualMonth?: number;
  /** one-off lump sum applied at this month index (1-based) */
  lumpSum?: number;
  lumpSumMonth?: number;
}

export interface AmortResult {
  schedule: AmortRow[];
  basePayment: number;
  totalInterest: number;
  totalPaid: number;
  payoffMonths: number;
}

/** Full amortisation schedule with optional extra principal.
 *  Iterative rather than closed-form because extra payments change the
 *  balance path, and users want to see the row where it hits zero. */
export function amortize(input: AmortInput): AmortResult {
  const { principal, annualPct, termMonths } = input;
  const extraMonthly = Math.max(0, input.extraMonthly ?? 0);
  const extraAnnual = Math.max(0, input.extraAnnual ?? 0);
  const extraAnnualMonth = input.extraAnnualMonth ?? 12;
  const lumpSum = Math.max(0, input.lumpSum ?? 0);
  const lumpSumMonth = input.lumpSumMonth ?? 0;

  const basePayment = pmt(annualPct, termMonths, principal);
  const r = monthlyRate(annualPct);
  const schedule: AmortRow[] = [];

  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  // Hard cap: a payment smaller than the monthly interest never amortises.
  // Bail rather than loop forever on a slider dragged to an absurd value.
  const cap = Math.min(termMonths, 1200);

  for (let m = 1; m <= cap && balance > 0.005; m++) {
    const interest = balance * r;
    let extra = extraMonthly;
    if (extraAnnual > 0 && m % 12 === extraAnnualMonth % 12) extra += extraAnnual;
    if (lumpSum > 0 && m === lumpSumMonth) extra += lumpSum;

    let principalPart = basePayment - interest;
    if (principalPart < 0) principalPart = 0; // negative amortisation guard

    // Final payment: never overshoot the remaining balance.
    if (principalPart + extra >= balance) {
      const payoffPrincipal = balance;
      const usedExtra = Math.max(0, Math.min(extra, Math.max(0, balance - principalPart)));
      const payment = Math.min(principalPart, balance) + interest;
      totalInterest += interest;
      totalPaid += payment + usedExtra;
      schedule.push({
        month: m, payment, interest,
        principal: Math.min(principalPart, payoffPrincipal),
        extra: usedExtra, balance: 0,
      });
      balance = 0;
      break;
    }

    balance -= principalPart + extra;
    totalInterest += interest;
    totalPaid += basePayment + extra;
    schedule.push({ month: m, payment: basePayment, interest, principal: principalPart, extra, balance });
  }

  return {
    schedule,
    basePayment,
    totalInterest,
    totalPaid,
    payoffMonths: schedule.length,
  };
}

/** Roll a monthly schedule up to calendar years — what the chart actually plots. */
export function byYear(schedule: AmortRow[]) {
  const years: Array<{ year: number; interest: number; principal: number; balance: number }> = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const chunk = schedule.slice(i, i + 12);
    years.push({
      year: Math.floor(i / 12) + 1,
      interest: chunk.reduce((a, r) => a + r.interest, 0),
      principal: chunk.reduce((a, r) => a + r.principal + r.extra, 0),
      balance: chunk[chunk.length - 1].balance,
    });
  }
  return years;
}
