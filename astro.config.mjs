// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Static output — deploys anywhere as plain files.
  output: 'static',
  server: {
    host: true,
  },
});
