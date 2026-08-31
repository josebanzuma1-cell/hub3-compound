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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);