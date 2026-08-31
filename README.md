# Compound — Hub 3: Retirement & Investing

Retirement and investing calculators built around the range of outcomes rather
than a single projected figure. Hub 3 of the utility site portfolio.

Astro 5, static, one vanilla-TS island per page, no UI framework.

## Quick start

```bash
npm install
npm run dev     # http://localhost:3027
npm run build
npm test        # model checks — run after touching any model
```

## What is here

| Tool | Plan | What it does |
|---|---|---|
| FIRE projection with Monte Carlo | 14 | 1,000 simulated paths; success rate rather than one smooth line |
| 401(k) match optimizer | 13 | Full-match rate, the front-loading trap, vesting |
| Roth conversion ladder | 15 | Year-by-year bracket filling vs converting all at once |
| Lump sum vs dollar-cost averaging | 16 | Win rate, median cost of waiting, how much range DCA buys |

All four plan tools are live. `built: false` in `src/lib/site.ts` is the switch
that keeps an unfinished tool out of nav, cards, the sitemap and structured data.

## What makes these different

**The FIRE tool simulates rather than compounds.** A conventional calculator
applies one average return every year and draws a smooth line. A portfolio being
drawn down is sensitive to the *order* returns arrive in, not just their
average — a bad decade while withdrawing forces you to sell more units to fund
the same spending, and they are gone when the recovery comes.

At the shipped defaults the difference is stark: compounding a flat 5% predicts
an ending balance of **$4.1M**, while the median of 1,000 simulated paths with
the same mean and volatility ends at **$804k**, and only 59% of paths last. That
gap is the product.

The simulation is **seeded from its inputs**, so a shared URL reproduces exactly
the result the sender saw and nudging a slider changes the answer because the
assumption changed — not because the dice were rerolled.

**The 401(k) tool models the front-loading trap.** Most employers match per pay
period. Contribute 60% of each cheque, hit the deferral limit in month five, and
the match stops for every remaining period — $2,192 forfeited at the defaults,
unless the plan trues up. Nothing on a statement announces it.

## Layout

This hub uses `src/components/ToolCockpit.astro`, not the kit's `ToolShell`.
The headline figure and chart run full width across a dark panel; controls sit
in a horizontal rail beneath. See `PORTING.md`.

## Before launch

1. **Set the domain** — `SITE.url` and `astro.config.mjs`.
2. **Review the return assumptions.** Defaults are plausible, not researched:
   5% real return, 15% volatility. They are assumptions the user is meant to
   change, and the page says so, but they anchor.
3. **The model's limits are stated on the page** and should stay there: normal
   returns rather than fat-tailed, fixed real spending rather than flexible, no
   taxes, no Social Security.

## Testing

`npm test` runs 77 checks under plain node with no browser, including that both
simulations are reproducible from their inputs, percentile bands never cross,
zero volatility collapses onto the deterministic path, a one-month drip equals a
lump sum, and Roth laddering always costs less tax than converting at once.

Two of those assertions were wrong when first written and the model was right:
a ladder converts *more* than the opening balance, because the remainder keeps
growing between conversions; and a higher bracket ceiling converts *less* in
total, because it clears the account sooner and collects fewer years of growth.

## A note on the DCA tool and historical data

The build plan asked for a backtest against real index returns. This simulates
instead, and the page says so plainly. Hand-entering a century of annual returns
and labelling it "real historical data" would be unverifiable and wrong in ways
that change the conclusion — the same failure as publishing an unsourced tax
rate.

The mechanism transfers regardless. At a 0% cash yield the model reports lump
sum ahead in 63% of runs, matching the ~2/3 figure the historical studies find;
the shipped 4% cash default legitimately lowers that to 57%. Drop a sourced CSV
in later and the same comparison can replay it.
