/* Hub-specific configuration. */

export const SITE = {
  name: 'Compound',
  tagline: 'Retirement maths with the uncertainty left in',
  description:
    'Retirement and investing calculators that model ranges rather than single ' +
    'outcomes — Monte Carlo FIRE projections, 401(k) match optimisation, Roth ' +
    'conversion ladders and lump sum versus dollar-cost averaging.',
  url: 'https://example.com', // TODO: real domain before launch
  locale: 'en_US',
} as const;

export interface Tool {
  slug: string;
  title: string;
  nav: string;
  blurb: string;
  planId: number;
  built: boolean;
  group: 'plan' | 'invest';
}

export const TOOLS: Tool[] = [
  {
    slug: 'fire-calculator',
    title: 'FIRE Calculator with Monte Carlo',
    nav: 'FIRE projection',
    blurb: 'A thousand simulated market paths instead of one smooth average — because the order returns arrive in decides whether the money lasts.',
    planId: 14, built: true, group: 'plan',
  },
  {
    slug: '401k-match-calculator',
    title: '401(k) Match Optimizer',
    nav: '401(k) match',
    blurb: 'How much to contribute to capture every matched dollar, what front-loading costs you, and what vesting means if you leave.',
    planId: 13, built: true, group: 'plan',
  },
  {
    slug: 'roth-conversion-calculator',
    title: 'Roth Conversion Ladder',
    nav: 'Roth ladder',
    blurb: 'Multi-year bracket filling — how much to convert each year to move a traditional balance across at the lowest total tax.',
    planId: 15, built: false, group: 'plan',
  },
  {
    slug: 'lump-sum-vs-dca-calculator',
    title: 'Lump Sum vs Dollar-Cost Averaging',
    nav: 'Lump sum vs DCA',
    blurb: 'Investing all at once usually wins, and the times it loses are the ones people remember. Both, side by side.',
    planId: 16, built: false, group: 'invest',
  },
];

export const toolBySlug = (slug: string): Tool | undefined => TOOLS.find((t) => t.slug === slug);
export const BUILT = TOOLS.filter((t) => t.built);
export const toolsExcept = (slug: string): Tool[] => BUILT.filter((t) => t.slug !== slug);
/** Nav, cards and the sitemap only ever link to pages that exist. */
export const NAV = BUILT.map((t) => ({ href: `/tools/${t.slug}`, label: t.nav }));
