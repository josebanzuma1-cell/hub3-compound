/* Tool 15 — Roth conversion ladder.

   The idea: a traditional balance is taxed when it comes out. If you have low-
   income years — early retirement before pensions and Social Security start —
   you can move the balance across to Roth a slice at a time, deliberately
   filling the cheap brackets each year and stopping before the expensive ones.

   Converting the whole balance in one year stacks it all on top of itself and
   pushes most of it into the top brackets. Spreading the same balance over ten
   years can move the entire thing at the 10% and 12% rates. The difference is
   routinely six figures, and it is the entire point of the tool.

   What the model does NOT know about, all stated on the page: IRMAA Medicare
   surcharges, ACA premium subsidy cliffs, and the separate five-year clock
   each conversion starts. Those constraints often bind before the brackets do. */
import { FEDERAL, taxFromBrackets, marginalRate } from '@data/federal';
import type { FilingStatus, Bracket } from '@data/federal';
import type { FieldSpec, Values } from '@kit/calc/url-state';

export const FIELDS: FieldSpec[] = [
  { key: 'bal',    type: 'number', default: 800_000, min: 0, max: 50_000_000, dp: 0 },
  { key: 'income', type: 'number', default: 25_000,  min: 0, max: 10_000_000, dp: 0 },
  { key: 'status', type: 'text',   default: 'married' },
  { key: 'years',  type: 'number', default: 10,      min: 1, max: 40,         dp: 0 },
  { key: 'ceil',   type: 'number', default: 12,      min: 10, max: 37,        dp: 0 },
  { key: 'growth', type: 'number', default: 5,       min: -10, max: 20,       dp: 2 },
  { key: 'state',  type: 'number', default: 0,       min: 0, max: 15,         dp: 2 },
  { key: 'payfrom',type: 'text',   default: 'outside' },
];

export const D = FIELDS.reduce<Record<string, number | string | boolean>>(
  (m, f) => ((m[f.key] = f.default), m), {});

export interface LadderYear {
  year: number;
  startingBalance: number;
  converted: number;
  federalTax: number;
  stateTax: number;
  marginalRate: number;
  effectiveOnConversion: number;
  rothBalance: number;
  remaining: number;
}

export interface RothModel {
  ladder: LadderYear[];
  totalConverted: number;
  totalTax: number;
  effectiveRate: number;
  leftUnconverted: number;
  fullyConverted: boolean;
  headroomPerYear: number;
  ceilingLabel: number;
  /* the alternative: convert everything in one year */
  allAtOnceTax: number;
  allAtOnceRate: number;
  savingVsAllAtOnce: number;
  /* the other alternative: never convert, withdraw later at your later rate */
  yearsNeededToFinish: number | null;
  rothEnd: number;
  traditionalEnd: number;
}

/** Top of the bracket whose rate equals `ceiling`, in taxable-income terms. */
function ceilingOfBracket(brackets: Bracket[], ceiling: number): number {
  for (const b of brackets) if (b.rate >= ceiling) return b.upTo ?? Infinity;
  return Infinity;
}

export function compute(v: Values): RothModel {
  const startBal = Math.max(0, Number(v.bal) || 0);
  const otherIncome = Math.max(0, Number(v.income) || 0);
  const status: FilingStatus =
    v.status === 'single' ? 'single' : v.status === 'head' ? 'head' : 'married';
  const years = Math.max(1, Math.round(Number(v.years) || 1));
  const ceiling = Math.max(10, Number(v.ceil) || 12);
  const growth = (Number(v.growth) || 0) / 100;
  const stateRate = Math.max(0, Number(v.state) || 0) / 100;
  const payFromOutside = v.payfrom !== 'inside';

  const fed = FEDERAL[status];
  const sd = fed.standardDeduction;
  const bracketTop = ceilingOfBracket(fed.brackets, ceiling);

  // Taxable income from other sources, after the standard deduction. Room to
  // convert is whatever is left below the chosen bracket ceiling.
  const baseTaxable = Math.max(0, otherIncome - sd);
  const headroomPerYear = Math.max(0, bracketTop - baseTaxable);

  const ladder: LadderYear[] = [];
  let remaining = startBal;
  let roth = 0;
  let totalTax = 0;
  let totalConverted = 0;

  for (let y = 1; y <= years; y++) {
    const startingBalance = remaining;
    const converted = Math.min(remaining, headroomPerYear);

    // Tax on the conversion is the difference the conversion makes, not an
    // average rate applied to it — the conversion stacks on other income.
    const taxWithout = taxFromBrackets(baseTaxable, fed.brackets);
    const taxWith = taxFromBrackets(baseTaxable + converted, fed.brackets);
    const federalTax = taxWith - taxWithout;
    const stateTax = converted * stateRate;
    const yearTax = federalTax + stateTax;

    remaining -= converted;
    // Paying the tax from outside the account is what makes conversions
    // powerful: the full converted amount lands in the Roth and compounds.
    roth += payFromOutside ? converted : Math.max(0, converted - yearTax);

    ladder.push({
      year: y,
      startingBalance,
      converted,
      federalTax,
      stateTax,
      marginalRate: marginalRate(baseTaxable + converted, fed.brackets),
      effectiveOnConversion: converted > 0 ? (yearTax / converted) * 100 : 0,
      rothBalance: roth,
      remaining,
    });

    totalTax += yearTax;
    totalConverted += converted;

    // Both sides keep growing between conversions.
    remaining *= 1 + growth;
    roth *= 1 + growth;
  }

  // The alternative: convert the whole balance in a single year.
  const allTaxWithout = taxFromBrackets(baseTaxable, fed.brackets);
  const allTaxWith = taxFromBrackets(baseTaxable + startBal, fed.brackets);
  const allAtOnceTax = (allTaxWith - allTaxWithout) + startBal * stateRate;

  // How many years the ladder would actually need, accounting for growth on
  // the un-converted remainder outrunning the annual headroom.
  let probe = startBal;
  let needed: number | null = null;
  for (let y = 1; y <= 100 && probe > 0; y++) {
    probe = Math.max(0, probe - headroomPerYear) * (1 + growth);
    if (probe <= 0) { needed = y; break; }
  }

  return {
    ladder,
    totalConverted,
    totalTax,
    effectiveRate: totalConverted > 0 ? (totalTax / totalConverted) * 100 : 0,
    leftUnconverted: remaining,
    fullyConverted: remaining <= 0.5,
    headroomPerYear,
    ceilingLabel: ceiling,
    allAtOnceTax,
    allAtOnceRate: startBal > 0 ? (allAtOnceTax / startBal) * 100 : 0,
    savingVsAllAtOnce: allAtOnceTax - totalTax,
    yearsNeededToFinish: needed,
    rothEnd: roth,
    traditionalEnd: remaining,
  };
}
