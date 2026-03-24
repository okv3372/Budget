import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Packaged Electron app loads from file://, so assets must be relative in production builds.
  base: command === 'build' ? './' : '/',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true
  }
}));
