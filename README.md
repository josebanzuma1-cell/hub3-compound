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

| Tool | Plan | Status |
|---|---|---|
| FIRE projection with Monte Carlo | 14 | Live |
| 401(k) match optimizer | 13 | Live |
| Roth conversion ladder | 15 | Not built |
| Lump sum vs dollar-cost averaging | 16 | Not built |

Unbuilt tools carry `built: false` in `src/lib/site.ts`, which keeps them out of
nav, cards, the sitemap and structured data until their pages exist.

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

`npm test` runs 43 checks under plain node with no browser, including that the
simulation is reproducible, percentile bands never cross, zero volatility
collapses onto the deterministic path, and the smooth-average path always beats
the median simulation.
