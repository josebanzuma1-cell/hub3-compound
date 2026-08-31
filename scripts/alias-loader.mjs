/* Lets plain `node` resolve what Vite resolves during the Astro build:
   tsconfig path aliases (@kit/*, @data/*) and extensionless relative imports.

   Without this the model modules would only be runnable inside a bundler,
   which would mean the tax math could not be tested independently — and on
   this site the math is the product. */
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ALIASES = { '@kit/': 'src/kit/', '@data/': 'src/data/', '@components/': 'src/components/' };

const withTs = (abs) => (fs.existsSync(abs) ? abs : fs.existsSync(`${abs}.ts`) ? `${abs}.ts` : abs);

registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const [prefix, target] of Object.entries(ALIASES)) {
      if (specifier.startsWith(prefix)) {
        const rel = specifier.slice(prefix.length);
        const abs = path.join(root, target, rel.endsWith('.ts') ? rel : `${rel}.ts`);
        return nextResolve(pathToFileURL(abs).href, context);
      }
    }
    // Relative imports written without an extension, e.g. `./paycheck`.
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      if (!path.extname(specifier) && context.parentURL?.startsWith('file:')) {
        const parentDir = path.dirname(new URL(context.parentURL).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
        const abs = withTs(path.resolve(parentDir, specifier));
        if (abs.endsWith('.ts')) return nextResolve(pathToFileURL(abs).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
