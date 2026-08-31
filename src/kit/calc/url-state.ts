/* KIT — URL state.
   Inputs are encoded as query params (?loan=400000&rate=6.5&term=30) so a
   result is shareable. Shareable results are the only organic backlink a
   calculator page reliably earns, so this is load-bearing for the whole
   portfolio, not a convenience.

   Rules:
   - Only non-default values are written. A pristine page keeps a clean URL,
     which keeps the canonical tidy and avoids near-duplicate indexing.
   - Writes go through replaceState, never pushState: a slider drag must not
     fill the back button with 200 history entries.
   - Reads are clamped and type-checked. Query strings are user input. */

export type FieldValue = number | string | boolean;

export interface FieldSpec {
  /** short, stable param name — this is public URL surface, keep it terse */
  key: string;
  type: 'number' | 'text' | 'bool';
  default: FieldValue;
  min?: number;
  max?: number;
  /** decimal places kept in the URL; trailing zeros are stripped */
  dp?: number;
}

export type Values = Record<string, FieldValue>;

function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}

export function coerce(spec: FieldSpec, raw: string | null): FieldValue {
  if (raw === null || raw === '') return spec.default;
  if (spec.type === 'number') {
    const n = Number(raw.replace(/[,_$\s]/g, ''));
    if (!Number.isFinite(n)) return spec.default;
    return clamp(n, spec.min, spec.max);
  }
  if (spec.type === 'bool') return raw === '1' || raw === 'true';
  return raw;
}

/** Read values from the current URL, falling back to each field default. */
export function readValues(specs: FieldSpec[], search = location.search): Values {
  const params = new URLSearchParams(search);
  const out: Values = {};
  for (const spec of specs) out[spec.key] = coerce(spec, params.get(spec.key));
  return out;
}

function serialize(spec: FieldSpec, v: FieldValue): string {
  if (spec.type === 'bool') return v ? '1' : '0';
  if (spec.type === 'number' && typeof v === 'number') {
    const dp = spec.dp ?? 4;
    return String(Number(v.toFixed(dp)));
  }
  return String(v);
}

/** Build a query string containing only values that differ from defaults. */
export function toQuery(specs: FieldSpec[], values: Values): string {
  const params = new URLSearchParams();
  for (const spec of specs) {
    const v = values[spec.key];
    if (v === undefined || v === spec.default) continue;
    if (spec.type === 'number' && Number(v) === Number(spec.default)) continue;
    params.set(spec.key, serialize(spec, v));
  }
  const q = params.toString();
  return q ? `?${q}` : '';
}

export function writeUrl(specs: FieldSpec[], values: Values): void {
  const url = location.pathname + toQuery(specs, values) + location.hash;
  history.replaceState(history.state, '', url);
}

export function shareUrl(specs: FieldSpec[], values: Values): string {
  return location.origin + location.pathname + toQuery(specs, values);
}
