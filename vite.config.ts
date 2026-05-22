import { defineConfig } from 'vite';

// For GitLab Pages under https://<group>.gitlab.io/<project>/,
// set VITE_BASE_PATH="/<project>/" in CI if needed.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || './',
});
