/* Federal tax parameters — TAX YEAR 2026.
 *
 * VERIFIED against primary sources. Every figure below carries a provenance
 * record naming the document it came from and the date it was checked.
 *
 * Sources:
 *   Rev. Proc. 2025-32 (Internal Revenue Bulletin 2025-45)
 *     — rate schedules, standard deduction, capital gains rate amounts,
 *       child tax credit
 *   IRS Topic 751 — Social Security and Medicare withholding rates
 *   SSA Contribution and Benefit Base — 2026 wage base
 *   IRC §1411 / §3101(b)(2) — NIIT and Additional Medicare thresholds
 *     (statutory, NOT inflation-indexed, unchanged since 2013)
 *   IRC §121 — residence gain exclusion (statutory, not indexed)
 *
 * RE-CHECK EVERY NOVEMBER, when the following year's Revenue Procedure
 * publishes. The build gate fails rows checked more than 400 days ago. */

export type FilingStatus = 'single' | 'married' | 'head';

/** Evidence that a value was checked, rather than merely believed. */
export interface Provenance {
  checkedOn: string;
  source: string;
  by: string;
}
export type Verified = Provenance | false;

export interface Bracket {
  /** upper bound of this bracket; null = no ceiling */
  upTo: number | null;
  rate: number;
}

export interface StatusParams {
  brackets: Bracket[];
  standardDeduction: number;
}

export interface FederalYear {
  year: number;
  single: StatusParams;
  married: StatusParams;
  head: StatusParams;
  fica: {
    socialSecurityRate: number;
    socialSecurityWageBase: number;
    medicareRate: number;
    additionalMedicareRate: number;
    additionalMedicareThreshold: Record<FilingStatus, number>;
  };
  verified: Verified;
  source: string;
}

const REV_PROC = 'IRS Rev. Proc. 2025-32 (IRB 2025-45), tax year 2026';
const CHECKED = '2026-08-31';

export const FEDERAL: FederalYear = {
  year: 2026,
  single: {
    standardDeduction: 16_100,
    brackets: [
      { upTo: 12_400, rate: 10 },
      { upTo: 50_400, rate: 12 },
      { upTo: 105_700, rate: 22 },
      { upTo: 201_775, rate: 24 },
      { upTo: 256_225, rate: 32 },
      { upTo: 640_600, rate: 35 },
      { upTo: null, rate: 37 },
    ],
  },
  married: {
    standardDeduction: 32_200,
    brackets: [
      { upTo: 24_800, rate: 10 },
      { upTo: 100_800, rate: 12 },
      { upTo: 211_400, rate: 22 },
      { upTo: 403_550, rate: 24 },
      { upTo: 512_450, rate: 32 },
      { upTo: 768_700, rate: 35 },
      { upTo: null, rate: 37 },
    ],
  },
  head: {
    standardDeduction: 24_150,
    brackets: [
      { upTo: 17_700, rate: 10 },
      { upTo: 67_450, rate: 12 },
      { upTo: 105_700, rate: 22 },
      { upTo: 201_750, rate: 24 },
      { upTo: 256_200, rate: 32 },
      { upTo: 640_600, rate: 35 },
      { upTo: null, rate: 37 },
    ],
  },
  fica: {
    socialSecurityRate: 6.2,
    socialSecurityWageBase: 184_500,
    medicareRate: 1.45,
    additionalMedicareRate: 0.9,
    // Statutory under §3101(b)(2) and never indexed — the same figures since 2013.
    additionalMedicareThreshold: { single: 200_000, married: 250_000, head: 200_000 },
  },
  verified: {
    checkedOn: CHECKED,
    source: `${REV_PROC}; IRS Topic 751; SSA Contribution and Benefit Base 2026`,
    by: 'BAMU',
  },
  source: REV_PROC,
};

/** Progressive tax on an amount, given a bracket table. */
export function taxFromBrackets(taxable: number, brackets: Bracket[]): number {
  if (taxable <= 0) return 0;
  let tax = 0;
  let floor = 0;
  for (const b of brackets) {
    const ceiling = b.upTo ?? Infinity;
    if (taxable <= floor) break;
    const slice = Math.min(taxable, ceiling) - floor;
    if (slice > 0) tax += slice * (b.rate / 100);
    floor = ceiling;
    if (!Number.isFinite(ceiling)) break;
  }
  return tax;
}

/** The rate applied to the next dollar earned. */
export function marginalRate(taxable: number, brackets: Bracket[]): number {
  let floor = 0;
  for (const b of brackets) {
    const ceiling = b.upTo ?? Infinity;
    if (taxable > floor && taxable <= ceiling) return b.rate;
    floor = ceiling;
  }
  return brackets[brackets.length - 1].rate;
}

/* Long-term capital gains. A separate rate schedule from ordinary income,
   applied to taxable income INCLUDING the gain — which is why a large sale can
   push part of itself from 0% into 15%.

   The bracket ceilings below are the "Maximum Zero Rate Amount" and "Maximum
   15-Percent Rate Amount" published in Rev. Proc. 2025-32. */
export interface CapGainsYear {
  brackets: Record<FilingStatus, Bracket[]>;
  niitRate: number;
  niitThreshold: Record<FilingStatus, number>;
  homeSaleExclusion: Record<FilingStatus, number>;
  verified: Verified;
  source: string;
}

export const CAP_GAINS: CapGainsYear = {
  brackets: {
    single:  [{ upTo: 49_450, rate: 0 }, { upTo: 545_500, rate: 15 }, { upTo: null, rate: 20 }],
    married: [{ upTo: 98_900, rate: 0 }, { upTo: 613_700, rate: 15 }, { upTo: null, rate: 20 }],
    head:    [{ upTo: 66_200, rate: 0 }, { upTo: 579_600, rate: 15 }, { upTo: null, rate: 20 }],
  },
  niitRate: 3.8,
  // §1411, statutory and never indexed — which is why more filers pay it each year.
  niitThreshold: { single: 200_000, married: 250_000, head: 200_000 },
  // §121, statutory and never indexed since 1997.
  homeSaleExclusion: { single: 250_000, married: 500_000, head: 250_000 },
  verified: {
    checkedOn: CHECKED,
    source: `${REV_PROC} (capital gains rate amounts); IRC §1411 and §121 for the unindexed thresholds`,
    by: 'BAMU',
  },
  source: REV_PROC,
};

/** Rate that applies to the marginal dollar of long-term gain. */
export function capGainsRate(taxableIncludingGain: number, status: FilingStatus): number {
  return marginalRate(taxableIncludingGain, CAP_GAINS.brackets[status]);
}

/** Long-term gain stacks on top of ordinary income, so only the portion of the
 *  gain sitting above each threshold is taxed at the higher rate. */
export function longTermGainsTax(ordinaryTaxable: number, gain: number, status: FilingStatus): number {
  if (gain <= 0) return 0;
  const brackets = CAP_GAINS.brackets[status];
  const below = taxFromBrackets(ordinaryTaxable, brackets);
  const withGain = taxFromBrackets(ordinaryTaxable + gain, brackets);
  return Math.max(0, withGain - below);
}
