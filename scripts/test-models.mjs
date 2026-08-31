/* Model checks. Run: npm test */
import { compute as fire, D as FD } from '../src/lib/tools/fire.ts';

let pass = 0, fail = 0;
const chk = (n, a, e, t = 0.5) => {
  const ok = Math.abs(a - e) <= t; ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : `\n      got ${a} expected ~${e}`}`);
};

const base = { ...FD };
const r = fire(base);

chk('FIRE: years to retire', r.yearsToRetire, 55 - 32);
chk('FIRE: years in retirement', r.yearsInRetirement, 95 - 55);
chk('FIRE: FI number is 25x spending', r.fiNumber, 55000 * 25);
chk('FIRE: one band point per year', r.p50.length, 95 - 32 + 1, 0);
chk('FIRE: ages line up with bands', r.ages.length, r.p50.length, 0);
chk('FIRE: first band point is the starting pot', r.p50[0], 120000);
chk('FIRE: success rate is a percentage', r.successRate >= 0 && r.successRate <= 100 ? 1 : 0, 1, 0);
chk('FIRE: p10 never exceeds p50', r.p10.every((x, i) => x <= r.p50[i] + 1e-6) ? 1 : 0, 1, 0);
chk('FIRE: p50 never exceeds p90', r.p50.every((x, i) => x <= r.p90[i] + 1e-6) ? 1 : 0, 1, 0);
chk('FIRE: no negative balances', r.p10.every((x) => x >= 0) ? 1 : 0, 1, 0);

// Reproducibility: identical inputs must give identical output, or a shared
// URL would show the reader a different answer from the one that was shared.
const again = fire(base);
chk('FIRE: deterministic for identical inputs', again.successRate, r.successRate, 0.0001);
chk('FIRE: identical median path', again.p50[20], r.p50[20], 0.0001);

// Directional sanity
chk('FIRE: saving more raises success', fire({ ...base, save: 60000 }).successRate >= r.successRate ? 1 : 0, 1, 0);
chk('FIRE: spending more lowers success', fire({ ...base, spend: 90000 }).successRate <= r.successRate ? 1 : 0, 1, 0);
chk('FIRE: retiring later raises success', fire({ ...base, retire: 62 }).successRate >= r.successRate ? 1 : 0, 1, 0);
chk('FIRE: higher fees lower success', fire({ ...base, fees: 1.0 }).successRate <= r.successRate ? 1 : 0, 1, 0);

// Zero volatility must collapse onto the deterministic path.
const flat = fire({ ...base, vol: 0 });
chk('FIRE: zero volatility gives one path', flat.p10[30], flat.p90[30], 1);
chk('FIRE: zero volatility matches deterministic', flat.p50[30], flat.deterministic[30], 1);
chk('FIRE: zero volatility is 0% or 100% success', flat.successRate === 0 || flat.successRate === 100 ? 1 : 0, 1, 0);

// Sequence risk: with volatility, the smooth average overstates the median.
chk('FIRE: average path beats the median simulation', r.sequenceRiskGap > 0 ? 1 : 0, 1, 0);

// Edges
chk('FIRE: zero spending never depletes', fire({ ...base, spend: 0 }).successRate, 100);
chk('FIRE: absurd spending always depletes', fire({ ...base, spend: 2000000 }).successRate, 0);
chk('FIRE: run count honoured', fire({ ...base, runs: 400 }).runs, 400, 0);
chk('FIRE: retire age below current age is clamped', fire({ ...base, age: 60, retire: 40 }).yearsToRetire, 0, 0);

// ============ Tool 13: 401(k) match ============
import { compute as m401, D as MD } from '../src/lib/tools/match401k.ts';
const mb = { ...MD };
const k = m401(mb);

chk('401k: full-match rate is tier1 + tier2 caps', k.fullMatchPct, 5);
chk('401k: 10% clears the 5% full-match rate', k.capturingFullMatch ? 1 : 0, 1, 0);
// 100% of first 3% + 50% of next 2% = 3% + 1% = 4% of salary
chk('401k: match is 4% of salary', k.matchIfSpreadEvenly, 95000 * 0.04, 1);
chk('401k: nothing missed above the full rate', k.missedByUnderContributing, 0, 0.5);

const low = m401({ ...mb, pct: 2 });
chk('401k: 2% captures only tier 1', low.matchIfSpreadEvenly, 95000 * 0.02, 1);
chk('401k: shortfall reported', low.shortfallPct, 3);
chk('401k: missed match quantified', low.missedByUnderContributing, 95000 * 0.02, 1);

// Front-loading: a high rate hits the limit early and the match stops.
const front = m401({ ...mb, pct: 60 });
chk('401k: hits the limit before year end', front.hitLimitAtPeriod !== null ? 1 : 0, 1, 0);
chk('401k: front-loading forfeits match', front.matchForfeited > 0 ? 1 : 0, 1, 0);
const fixed = m401({ ...mb, pct: 60, trueup: true });
chk('401k: true-up restores it', fixed.matchForfeited, 0, 0.001);
chk('401k: true-up pays the even-spread match', fixed.matchEarned, fixed.matchIfSpreadEvenly, 0.5);
chk('401k: contributions never exceed the limit', front.yourContribution <= 23500.5 ? 1 : 0, 1, 0);

chk('401k: 2 of 3 years is 67% vested', m401({ ...mb, vest: 3, years: 2 }).vestedPct, 66.67, 0.1);
chk('401k: past the schedule is fully vested', m401({ ...mb, vest: 3, years: 5 }).vestedPct, 100);
chk('401k: no schedule means fully vested', m401({ ...mb, vest: 0, years: 0 }).vestedPct, 100);
chk('401k: vested plus unvested is the match', k.vestedNow + k.unvestedNow, k.matchEarned, 0.5);

chk('401k: match is a 40% return at 10% contribution', k.effectiveReturn, 40, 0.5);
chk('401k: zero contribution earns zero match', m401({ ...mb, pct: 0 }).matchEarned, 0);
chk('401k: zero salary is safe', m401({ ...mb, salary: 0 }).totalIntoAccount, 0);

// ============ Tool 15: Roth conversion ladder ============
import { compute as roth, D as RD } from '../src/lib/tools/roth-ladder.ts';
import { FEDERAL, taxFromBrackets } from '../src/data/federal.ts';
const rb = { ...RD };
const L1 = roth(rb);

chk('roth: one ladder row per year', L1.ladder.length, 10, 0);
// married, $25k other income, std deduction $30k -> taxable 0; headroom is the
// whole 12% bracket ceiling.
chk('roth: headroom fills to the bracket ceiling', L1.headroomPerYear, FEDERAL.married.brackets[1].upTo, 1);
// Total converted EXCEEDS the starting balance, and should: the un-converted
// remainder keeps growing between conversions, so a ladder moves more than it
// started with. The invariant that matters is that it never goes negative.
chk('roth: growth means more is converted than the starting balance', L1.totalConverted > 800000 ? 1 : 0, 1, 0);
chk('roth: no growth means converted is capped by the balance', roth({ ...rb, growth: 0 }).totalConverted <= 800000 + 1 ? 1 : 0, 1, 0);
chk('roth: tax is positive when converting', L1.totalTax > 0 ? 1 : 0, 1, 0);
chk('roth: effective rate is below the ceiling', L1.effectiveRate < 12 ? 1 : 0, 1, 0);

// The headline comparison: laddering must beat converting everything at once.
chk('roth: all-at-once costs more tax', L1.allAtOnceTax > L1.totalTax ? 1 : 0, 1, 0);
chk('roth: saving is the difference', L1.savingVsAllAtOnce, L1.allAtOnceTax - L1.totalTax, 0.5);
chk('roth: all-at-once hits a much higher rate', L1.allAtOnceRate > L1.effectiveRate ? 1 : 0, 1, 0);

// A higher ceiling converts more per year and finishes sooner.
const hi = roth({ ...rb, ceil: 24 });
chk('roth: higher ceiling gives more headroom', hi.headroomPerYear > L1.headroomPerYear ? 1 : 0, 1, 0);
// A higher ceiling does NOT convert more in total — it finishes the balance
// sooner, so fewer years of growth get converted. What it does is clear the
// account, which the 12% ladder fails to do inside ten years.
chk('roth: higher ceiling finishes the balance', hi.fullyConverted ? 1 : 0, 1, 0);
chk('roth: the 12% ladder does not finish in ten years', L1.fullyConverted ? 1 : 0, 0, 0);
chk('roth: leftover is reported', L1.leftUnconverted > 0 ? 1 : 0, 1, 0);
chk('roth: higher ceiling costs a higher effective rate', hi.effectiveRate > L1.effectiveRate ? 1 : 0, 1, 0);

// Other income eats the headroom.
const busy = roth({ ...rb, income: 120000 });
chk('roth: other income reduces headroom', busy.headroomPerYear < L1.headroomPerYear ? 1 : 0, 1, 0);

// Paying tax from inside the account puts less into the Roth.
const inside = roth({ ...rb, payfrom: 'inside' });
chk('roth: paying tax from inside lands less in the Roth', inside.rothEnd < L1.rothEnd ? 1 : 0, 1, 0);

// Conversion tax must be marginal, not an average rate on the slice.
const y1 = L1.ladder[0];
const rothBase = Math.max(0, 25000 - FEDERAL.married.standardDeduction);
chk('roth: year-one tax is the marginal difference', y1.federalTax,
  taxFromBrackets(rothBase + y1.converted, FEDERAL.married.brackets) - taxFromBrackets(rothBase, FEDERAL.married.brackets), 0.5);

chk('roth: state tax applied when set', roth({ ...rb, state: 5 }).totalTax > L1.totalTax ? 1 : 0, 1, 0);
chk('roth: zero balance is safe', roth({ ...rb, bal: 0 }).totalTax, 0);
chk('roth: balances never go negative', L1.ladder.every((r) => r.remaining >= -0.5) ? 1 : 0, 1, 0);

// ============ Tool 16: lump sum vs DCA ============
import { compute as ld, D as LD } from '../src/lib/tools/lump-vs-dca.ts';
const lb = { ...LD };
const S = ld(lb);

chk('dca: lump sum wins most of the time', S.lumpWinRate > 55 ? 1 : 0, 1, 0);
chk('dca: win rate is a percentage', S.lumpWinRate >= 0 && S.lumpWinRate <= 100 ? 1 : 0, 1, 0);
chk('dca: lump median beats DCA median', S.lumpMedian > S.dcaMedian ? 1 : 0, 1, 0);
chk('dca: advantage matches the medians', S.medianAdvantage, S.lumpMedian - S.dcaMedian, 1);
chk('dca: DCA has the narrower spread', S.dcaSpread < S.lumpSpread ? 1 : 0, 1, 0);
chk('dca: spread reduction is positive', S.spreadReduction > 0 ? 1 : 0, 1, 0);
chk('dca: percentiles ordered', S.lumpP10 <= S.lumpMedian && S.lumpMedian <= S.lumpP90 ? 1 : 0, 1, 0);
chk('dca: histogram covers every run', S.histogram.reduce((a, b) => a + b.count, 0), S.runs, 0);

// Reproducibility, same reason as the FIRE tool.
chk('dca: deterministic for identical inputs', ld(lb).lumpWinRate, S.lumpWinRate, 0.0001);

// Spreading over one month is a lump sum, so the two must converge.
const one = ld({ ...lb, months: 1 });
chk('dca: one-month DCA is a lump sum', Math.abs(one.lumpMedian - one.dcaMedian) / one.lumpMedian < 0.02 ? 1 : 0, 1, 0);

// A longer DCA period widens the gap, because more money sits out longer.
const slow = ld({ ...lb, months: 48 });
chk('dca: a longer drip costs more', slow.medianAdvantage > S.medianAdvantage ? 1 : 0, 1, 0);

// If cash yields more than equities, DCA should stop losing.
const flip = ld({ ...lb, ret: 1, cash: 8, months: 36 });
chk('dca: high cash yield reduces the lump advantage', flip.lumpWinRate < S.lumpWinRate ? 1 : 0, 1, 0);

// Zero volatility: no uncertainty, lump wins deterministically on a rising market.
const calm = ld({ ...lb, vol: 0 });
chk('dca: zero volatility gives a certain winner', calm.lumpWinRate === 100 || calm.lumpWinRate === 0 ? 1 : 0, 1, 0);
chk('dca: zero amount is safe', ld({ ...lb, amount: 0 }).lumpMedian, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);