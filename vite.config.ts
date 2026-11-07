/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build also works from a GitHub Pages sub-path (Phase 5).
  base: './',
  test: {
    environment: 'node',
  },
});
