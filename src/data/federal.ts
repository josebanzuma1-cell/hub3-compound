/* Federal tax parameters.

   SEEDED AND UNVERIFIED. Tax figures are indexed annually and this hub is the
   one where being wrong costs a visitor real money on a real filing. Every
   number here must be checked against IRS Rev. Proc. for the tax year before
   launch, and re-checked every November when the next year's figures publish.

   Sources to verify against:
   - Brackets and standard deduction: IRS Revenue Procedure (annual)
   - Social Security wage base: SSA annual announcement
   - Medicare and Additional Medicare: IRS Publication 15 */

export type FilingStatus = 'single' | 'married' | 'head';

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
  verified: boolean;
  source: string;
}

export const FEDERAL: FederalYear = {
  year: 2025,
  single: {
    standardDeduction: 15_000,
    brackets: [
      { upTo: 11_925, rate: 10 },
      { upTo: 48_475, rate: 12 },
      { upTo: 103_350, rate: 22 },
      { upTo: 197_300, rate: 24 },
      { upTo: 250_525, rate: 32 },
      { upTo: 626_350, rate: 35 },
      { upTo: null, rate: 37 },
    ],
  },
  married: {
    standardDeduction: 30_000,
    brackets: [
      { upTo: 23_850, rate: 10 },
      { upTo: 96_950, rate: 12 },
      { upTo: 206_700, rate: 22 },
      { upTo: 394_600, rate: 24 },
      { upTo: 501_050, rate: 32 },
      { upTo: 751_600, rate: 35 },
      { upTo: null, rate: 37 },
    ],
  },
  head: {
    standardDeduction: 22_500,
    brackets: [
      { upTo: 17_000, rate: 10 },
      { upTo: 64_850, rate: 12 },
      { upTo: 103_350, rate: 22 },
      { upTo: 197_300, rate: 24 },
      { upTo: 250_500, rate: 32 },
      { upTo: 626_350, rate: 35 },
      { upTo: null, rate: 37 },
    ],
  },
  fica: {
    socialSecurityRate: 6.2,
    socialSecurityWageBase: 176_100,
    medicareRate: 1.45,
    additionalMedicareRate: 0.9,
    additionalMedicareThreshold: { single: 200_000, married: 250_000, head: 200_000 },
  },
  verified: false,
  source: 'seeded estimate for tax year 2025 — unverified against IRS Rev. Proc.',
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

/* Long-term capital gains brackets. A separate rate schedule from ordinary
   income, applied to taxable income *including* the gain — which is why a
   large sale can push part of itself from 0% into 15%.

   SEEDED AND UNVERIFIED, like everything else here. */
export interface CapGainsYear {
  brackets: Record<FilingStatus, Bracket[]>;
  /** Net Investment Income Tax: 3.8% above these MAGI thresholds */
  niitRate: number;
  niitThreshold: Record<FilingStatus, number>;
  /** primary residence gain exclusion under IRC §121 */
  homeSaleExclusion: Record<FilingStatus, number>;
  verified: boolean;
  source: string;
}

export const CAP_GAINS: CapGainsYear = {
  brackets: {
    single:  [{ upTo: 48_350, rate: 0 }, { upTo: 533_400, rate: 15 }, { upTo: null, rate: 20 }],
    married: [{ upTo: 96_700, rate: 0 }, { upTo: 600_050, rate: 15 }, { upTo: null, rate: 20 }],
    head:    [{ upTo: 64_750, rate: 0 }, { upTo: 566_700, rate: 15 }, { upTo: null, rate: 20 }],
  },
  niitRate: 3.8,
  niitThreshold: { single: 200_000, married: 250_000, head: 200_000 },
  homeSaleExclusion: { single: 250_000, married: 500_000, head: 250_000 },
  verified: false,
  source: 'seeded estimate for tax year 2025 — unverified',
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
