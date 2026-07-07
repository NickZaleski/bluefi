// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Set this to your production domain so social share images (og:image)
  // resolve to absolute URLs — required by Facebook, X/Twitter, etc.
  site: 'https://ola-celeste.example.com',
  // Static output — deploys anywhere as plain files.
  output: 'static',
  server: {
    host: true,
  },
});
