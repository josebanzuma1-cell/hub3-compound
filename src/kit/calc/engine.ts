/* KIT — calculator engine.
   One mount() call wires a whole tool: input binding, clamping, debounced
   recompute, formatted output, chart hook, URL sync, share/reset buttons.

   INP is the constraint that shapes this. Recomputing a 360-row amortization
   schedule on every keystroke blocks the main thread and fails Core Web
   Vitals, so compute is debounced and the paint is handed to rAF. Slider
   drags feel immediate because the paired number input updates synchronously
   while the expensive work is deferred.

   Markup contract (all within the [data-calc] root):
     <input data-field="rate">              input, bound both ways
     <input data-field="rate" data-pair>    slider paired to the same key
     <b data-out="monthly" data-fmt="currency">   formatted output
     <b data-out="delta" data-fmt="currency" data-sign>  + pos/neg colouring
     <button data-action="share|reset">
*/
import { FORMATTERS } from './format';
import { readValues, writeUrl, shareUrl, coerce } from './url-state';
import type { FieldSpec, Values } from './url-state';

export type { FieldSpec, Values };

export interface CalcConfig<R> {
  /** must match data-calc on the root element */
  id: string;
  fields: FieldSpec[];
  compute: (v: Values) => R;
  /** charts, tables, anything not expressible as a single data-out value */
  onRender?: (result: R, values: Values, root: HTMLElement) => void;
  /** ms to wait before recomputing; raise for heavy models */
  debounceMs?: number;
}

export interface CalcInstance<R> {
  root: HTMLElement;
  values: Values;
  result: R | null;
  set(key: string, value: number | string | boolean): void;
  refresh(): void;
}

const specMap = (fields: FieldSpec[]) =>
  fields.reduce<Record<string, FieldSpec>>((m, f) => ((m[f.key] = f), m), {});

/** Flatten a result object so nested groups can still target data-out keys. */
function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}) {
  if (obj === null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

export function applyOutputs(root: HTMLElement, result: unknown): void {
  const flat = flatten(result);
  const nodes = root.querySelectorAll<HTMLElement>('[data-out]');
  for (const node of nodes) {
    const key = node.dataset.out!;
    if (!(key in flat)) continue;
    const raw = flat[key];
    const fmtName = node.dataset.fmt ?? 'number';
    const fmt = FORMATTERS[fmtName];
    if (!fmt && import.meta.env?.DEV) {
      // Falling back silently turns a typo into a plausible-looking wrong
      // number — 'percent2' rendering as '9' instead of '8.85%'. Say so.
      console.warn(`[calc] unknown data-fmt "${fmtName}" on [data-out="${key}"] — falling back to number`);
    }
    const use = fmt ?? FORMATTERS.number;
    node.textContent = typeof raw === 'number' ? use(raw) : String(raw ?? '—');
    if (node.dataset.sign !== undefined && typeof raw === 'number') {
      node.classList.toggle('stat__value--pos', raw > 0);
      node.classList.toggle('stat__value--neg', raw < 0);
    }
  }
}

export function mount<R>(config: CalcConfig<R>): CalcInstance<R> | null {
  const root = document.querySelector<HTMLElement>(`[data-calc="${config.id}"]`);
  if (!root) return null;

  const specs = specMap(config.fields);
  const values: Values = readValues(config.fields);
  const debounceMs = config.debounceMs ?? 80;

  let result: R | null = null;
  let computeTimer = 0;
  let urlTimer = 0;
  let frame = 0;

  const inputs = Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-field]'));

  /** Push a value into every control bound to that key (slider + number pairs). */
  function syncControls(key: string, source?: EventTarget | null) {
    const v = values[key];
    for (const el of inputs) {
      if (el.dataset.field !== key || el === source) continue;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(v);
      else if (el instanceof HTMLInputElement && el.type === 'radio') el.checked = el.value === String(v);
      else el.value = String(v);
    }
    const echo = root.querySelector<HTMLElement>(`[data-echo="${key}"]`);
    if (echo) {
      const fmt = FORMATTERS[echo.dataset.fmt ?? 'number'] ?? FORMATTERS.number;
      echo.textContent = typeof v === 'number' ? fmt(v) : String(v);
    }
  }

  function render() {
    result = config.compute(values);
    applyOutputs(root, result);
    config.onRender?.(result, values, root);
    root.dataset.state = 'ready';
  }

  function scheduleRender() {
    clearTimeout(computeTimer);
    computeTimer = window.setTimeout(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    }, debounceMs);

    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => writeUrl(config.fields, values), 400);
  }

  function handle(e: Event) {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const key = el?.dataset?.field;
    if (!key || !specs[key]) return;
    const spec = specs[key];

    let raw: string;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') raw = el.checked ? '1' : '0';
    else raw = el.value;

    // Don't clamp mid-typing — "40" on the way to "400000" would snap to the
    // minimum and fight the user. Clamp on blur/change instead.
    const isTyping = e.type === 'input' && el instanceof HTMLInputElement && el.type !== 'range';
    values[key] = isTyping && spec.type === 'number' && raw !== ''
      ? (Number(raw.replace(/[,_$\s]/g, '')) || 0)
      : coerce(spec, raw);

    syncControls(key, el);
    scheduleRender();
  }

  function clampOnBlur(e: Event) {
    const el = e.target as HTMLInputElement;
    const key = el?.dataset?.field;
    if (!key || !specs[key] || specs[key].type !== 'number') return;
    values[key] = coerce(specs[key], el.value);
    syncControls(key);
    scheduleRender();
  }

  root.addEventListener('input', handle);
  root.addEventListener('change', handle);
  root.addEventListener('focusout', clampOnBlur);

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'reset') {
      for (const spec of config.fields) values[spec.key] = spec.default;
      for (const spec of config.fields) syncControls(spec.key);
      history.replaceState(history.state, '', location.pathname);
      render();
    }

    if (action === 'share') {
      const url = shareUrl(config.fields, values);
      const done = () => {
        const original = btn.dataset.label ?? btn.textContent ?? 'Share';
        btn.dataset.label = original;
        btn.textContent = 'Link copied';
        btn.dataset.copied = 'true';
        setTimeout(() => {
          btn.textContent = original;
          delete btn.dataset.copied;
        }, 2000);
      };
      navigator.clipboard?.writeText(url).then(done, () => {
        // Clipboard blocked (insecure origin, permission). Fall back to
        // putting the URL in the address bar so it can still be copied.
        history.replaceState(history.state, '', url);
      });
    }
  });

  // Initial paint is synchronous: the results card is above the fold and
  // must be in the first frame, not debounced in after it.
  for (const spec of config.fields) syncControls(spec.key);
  render();

  return {
    root,
    values,
    get result() { return result; },
    set(key, value) {
      if (!specs[key]) return;
      values[key] = value;
      syncControls(key);
      scheduleRender();
    },
    refresh: render,
  };
}
