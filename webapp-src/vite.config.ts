import { defineConfig } from 'vite';

// Deployed at mymaingoals.app/webapp/ — must stay isolated under this path so it never
// collides with the root static site (index.html, privacy-policy.html, support.html).
export default defineConfig({
  base: '/webapp/',
  build: {
    outDir: '../webapp',
    emptyOutDir: true,
  },
});
