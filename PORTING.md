# Porting this build to the next hub

Each hub is its own workspace and its own repo. The reusable half is
`src/kit/` — copy that one folder and you inherit the design system, the
calculator engine, the charts and the page furniture. Everything else is
hub-specific and gets rewritten.

## What to copy

```
src/kit/                    <- copy wholesale, do not edit per hub
  styles/tokens.css         <- edit ONLY --c-accent* and the fonts
  styles/base.css
  styles/forms.css
  styles/components.css
  calc/engine.ts            <- mount(), input binding, debounce, URL state
  calc/finance.ts           <- pmt, amortize, futureValue, npv, irr
  calc/format.ts            <- currency/percent/months formatters
  calc/chart.ts             <- hand-rolled SVG line + stacked bar
  calc/url-state.ts
  components/*.astro        <- Field, SelectField, Segmented, Chart,
                               Logo, DataNote, ToolShell, RelatedTools
scripts/alias-loader.mjs    <- lets plain `node` run the model modules
astro.config.mjs
tsconfig.json               <- keep the @kit/* @data/* path aliases
```

Also copy `scripts/check-data.mjs` if the hub has programmatic data.

## What to rewrite

| File | What changes |
|---|---|
| `src/lib/site.ts` | Name, tagline, the `TOOLS` registry. This is the single source for nav, cards, footer and internal links. |
| `src/lib/tools/*.ts` | One module per calculator: `FIELDS`, `D`, `compute()`. |
| `src/styles/surfaces.css` | **The layout layer, and deliberately NOT in the kit.** This is what stops the portfolio looking like one template. Hub 1 uses a dark centred hero with a selector pill; Hub 2 a light split hero with a salary input and cards lifted over the hero edge. Rewrite it per hub. |
| `src/pages/**` | Page shells and prose. |
| `src/data/*` | Programmatic data sets. |
| `src/layouts/BaseLayout.astro` | Footer links and JSON-LD. Structure stays. |
| `--c-accent*`, `--c-deep*`, `--c-pop*` in `tokens.css` | The palette. `--c-deep` is the hero/header band, `--c-pop` the CTA that has to pop against it.
| `src/kit/components/Logo.astro`, `public/favicon.svg` | The mark. It fills from `--c-accent`, so the SVG only needs redrawing if the hub wants a different symbol. |

## The pattern for a new calculator

Four files, always in this order:

**1. Model** — `src/lib/tools/<name>.ts`

```ts
export const FIELDS: FieldSpec[] = [
  { key: 'loan', type: 'number', default: 400_000, min: 1_000, max: 10_000_000, dp: 0 },
];
export const D = FIELDS.reduce((m, f) => ((m[f.key] = f.default), m), {});
export interface MyModel { monthlyPayment: number; /* ... */ }
export function compute(v: Values): MyModel { /* pure function, no DOM */ }
```

Keep `compute` pure and DOM-free. That is what makes it testable with
`node --import ./scripts/alias-loader.mjs`, and testing the model is the
only thing standing between you and publishing wrong numbers at scale.

**2. Page** — `src/pages/tools/<slug>.astro`

```astro
<ToolShell title="..." intro="..." breadcrumbs={[...]} calcId="x">
  <form slot="controls" id="x-form"> <Field name="loan" value={D.loan} ... /> </form>
  <div slot="results" class="results">
    <b data-out="monthlyPayment" data-fmt="currency">—</b>
  </div>
  <section class="prose"> ... 800–1,500 words ... </section>
</ToolShell>
```

**3. Island** — a `<script>` at the bottom of the page

```ts
import { mount } from '@kit/calc/engine';
import { FIELDS, compute } from '../../lib/tools/<name>';
document.getElementById('x-form')?.addEventListener('submit', e => e.preventDefault());
mount<MyModel>({ id: 'x', fields: FIELDS, compute, onRender(m) { /* charts, tables */ } });
```

**4. Register** it in `src/lib/site.ts` so it appears in nav, cards and footer.

## Traps this build already hit

Four bugs found here. All four will recur in Hub 2 if you forget them.

1. **Never name a component prop `slot`.** `slot` is Astro's reserved
   slot-assignment attribute. Any `<Thing slot="x" />` passed as a component's
   child is routed to a named slot — and silently discarded if none matches.
   No error, no output. Cost an entire ad tier here before it was spotted.

2. **The engine root must enclose every `data-out`.** `mount()` queries within
   `[data-calc]`. Scope it to just the controls/results grid and any figure in
   a section below stays an em dash forever. `ToolShell` puts it on the
   outermost `.page` div.

3. **Prose figures drift from the model.** The worked examples in the copy were
   wrong until the model tests printed the real numbers. Any figure you state
   in prose, print from the model first, then paste it.

4. **`npx astro` resolves the wrong Astro** if the shell's working directory is
   not the project. Use `./node_modules/.bin/astro` or `npm run build`.

## Advertising

This hub ships with no ad slots. If a later hub needs them, the original
reserved-height `AdSlot` component and its `--ad-h-*` tokens are recoverable
from git history at commit `bdc82c3`. The rule if you bring it back: fix the
container height in CSS before any ad script runs — never let a unit size
itself, or CLS goes with it.

## Checklist before launching a hub

- [ ] `npm run build` passes
- [ ] `node --import ./scripts/alias-loader.mjs scripts/test-finance.mjs` passes
- [ ] Every tool page has 800–1,500 words of prose
- [ ] Exactly one `<h1>` per page; canonical on every page
- [ ] All data rows `verified: true`, `PUBLIC_REQUIRE_VERIFIED=1` set in prod
- [ ] `SITE.url` set to the real domain (also in `robots.txt`)
- [ ] Every prose figure re-checked against model output

## Page furniture

Three band treatments, so every page reads as part of one system:

- **Homepage** — `.band`, a full-bleed `--c-deep` hero with a centred headline
  (wrap the emphasised word in `<em>` for the --c-pop highlight), the `.picker`
  selector + CTA, then `.trust` and `.tiles`.
- **Tool pages** — `.tool-band`, a soft mint gradient behind the breadcrumbs and
  h1 only. The calculator stays on plain ground: a results card has to read as
  an instrument, not another marketing panel.
- **Index and static pages** — `.page-band`, the same gradient, applied by
  wrapping the breadcrumbs and `.tool-hero` and reopening `.page` after it.

The `.trust` strip carries **verifiable properties of the product only** —
counts, guarantees you actually make. No ratings, no review counts, no
testimonials. Comparison sites lean hard on social proof; inventing it is how a
site loses the trust the strip is there to build.

5. **Don't use `perl -0pi -e 's|...|...|'` on markdown tables.** The `|`
   delimiter terminates at the first pipe in the replacement, silently
   truncating it and fusing the remainder into the next line. It corrupted this
   file's heading twice. Use `node -e` with explicit string ops for anything
   containing pipes.

## Why surfaces.css is not in the kit

The kit holds primitives that should behave identically everywhere: tokens,
form controls, the calculator engine, charts, the results card. The *layout* —
header treatment, hero shape, how cards sit on the page — is the thing that
has to differ, so it lives in `src/styles/surfaces.css` per hub.

This matters beyond aesthetics. The build plan warns that duplicating page
structure across a domain portfolio is the pattern doorway-page and
scaled-content detection targets. Different layouts reduce that footprint.
They are not the main protection though — genuinely different content, formulas
and internal linking are, and those come from each hub being about a different
subject. Treat the layout difference as hygiene, not as the defence.

Class names are the contract between the kit and the layout layer. `ToolShell`
renders `.tool-band`; each hub decides what that looks like.
## The kit boundary

Three things are per-hub and must NOT sit in `src/kit/`:

| Per-hub | Why |
|---|---|
| `src/styles/surfaces.css` | Layout. The hero shape, header treatment and card placement are what make two hubs look like two products. |
| `src/components/Logo.astro` | The mark. Each hub gets its own silhouette — at favicon size the outline is the only thing distinguishing them. |
| `src/kit/styles/tokens.css` **values** | The palette. Token *names* are the shared contract and never change; the hex values are rewritten per hub. This one file stays in the kit because its structure is shared even though its values are not. |

Everything else in `src/kit/` should be byte-identical across hubs. Check with:

```bash
diff -r src/kit ../hub-01-mortgage/src/kit --exclude=tokens.css
```

If that prints anything, a fix landed in one hub and not the other — port it
before the two drift further.
## Chart: log scale

`lineChart` takes an optional `logScale`. Use it when series span orders of
magnitude — a Monte Carlo percentile fan is the obvious case: the 90th
percentile reached $12M while the median ended near $800k, and on a linear
axis the two lines that mattered were flat against the bottom.

Ticks sit on powers of ten; the axis ends at the real maximum rather than
rounding up a decade. Values at or below zero are floored, so a depleted
portfolio renders instead of producing `log10(0)`.

Backported to hubs 1 and 2 — all three kits carry it.
## A third calculator layout

Hub 3 does not use `ToolShell`. It has `src/components/ToolCockpit.astro`:
the headline figure and its chart occupy a full-width dark panel, with the
controls in a horizontal rail beneath. Projections are thirty-year curves and a
half-width card wastes them.

That makes three layouts across three hubs — side-by-side (1), side-by-side on
a light split page (2), and cockpit (3). Pick per hub based on what the tool
actually needs to show, not for variety's sake; but do not default to copying
the last one either.

## Known divergence

Hub 1 still keeps `surfaces.css` and `Logo.astro` inside `src/kit/`. Hubs 2 and
3 moved them out, because layout and mark are per-hub by definition. Everything
else in the kit is byte-identical across all three (`tokens.css` values aside).

Aligning Hub 1 means moving two files and updating two imports in
`BaseLayout.astro`. Worth doing next time that workspace is open; it changes no
behaviour.
