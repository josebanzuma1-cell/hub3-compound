/* KIT — number formatting. Hub-agnostic.
   Formatters are created once and reused; Intl.NumberFormat construction
   is expensive enough to matter inside a debounced recompute loop. */

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isFinite_ = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export const currency = (n: number): string => (isFinite_(n) ? usd0.format(n) : '—');
export const currency2 = (n: number): string => (isFinite_(n) ? usd2.format(n) : '—');

/** Compact currency for chart axis labels: $1.2M, $450k. */
export function currencyCompact(n: number): string {
  if (!isFinite_(n)) return '—';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}$${num1.format(a / 1_000_000)}M`;
  if (a >= 10_000) return `${sign}$${num0.format(a / 1000)}k`;
  if (a >= 1000) return `${sign}$${num1.format(a / 1000)}k`;
  return `${sign}$${num0.format(a)}`;
}

export const percent = (n: number, dp = 2): string =>
  isFinite_(n) ? `${(dp === 0 ? num0 : dp === 1 ? num1 : num2).format(n)}%` : '—';

export const number = (n: number, dp = 0): string =>
  isFinite_(n) ? (dp === 0 ? num0 : dp === 1 ? num1 : num2).format(n) : '—';

/** 87 -> "7 yr 3 mo". Used for payoff timelines everywhere. */
export function months(m: number): string {
  if (!isFinite_(m) || m < 0) return '—';
  const total = Math.round(m);
  const y = Math.floor(total / 12);
  const mo = total % 12;
  if (y === 0) return `${mo} mo`;
  if (mo === 0) return `${y} yr`;
  return `${y} yr ${mo} mo`;
}

/** Absolute payoff date, given a start date and a term in months. */
export function dateAfterMonths(m: number, from: Date = new Date()): string {
  if (!isFinite_(m)) return '—';
  const d = new Date(from.getFullYear(), from.getMonth() + Math.round(m), 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export const signed = (n: number, fmt: (v: number) => string = currency): string =>
  !isFinite_(n) ? '—' : n > 0 ? `+${fmt(n)}` : fmt(n);

export type Formatter = (n: number) => string;

/** Registry used by the engine to resolve data-fmt="..." on output elements. */
export const FORMATTERS: Record<string, Formatter> = {
  currency,
  currency2,
  currencyCompact,
  percent: (n) => percent(n, 2),
  percent1: (n) => percent(n, 1),
  percent0: (n) => percent(n, 0),
  number: (n) => number(n, 0),
  number1: (n) => number(n, 1),
  number2: (n) => number(n, 2),
  months,
  date: (n) => dateAfterMonths(n),
  signed: (n) => signed(n),
  x: (n) => (isFinite_(n) ? `${num2.format(n)}x` : '—'),
  raw: (n) => String(n),
};
