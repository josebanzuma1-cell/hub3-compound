import { defineConfig } from 'astro/config';

// Static output. Every page — including the ~50 state and ~400 metro
// programmatic pages — is prerendered at build time. Nothing calls a data
// source at request time; see src/data/README.md.
export default defineConfig({
  site: 'https://example.com', // TODO: real domain before launch
  output: 'static',
  trailingSlash: 'never',
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
  devToolbar: { enabled: false },
});
