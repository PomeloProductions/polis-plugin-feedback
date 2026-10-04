import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Builds the frontend deliverable bundle (`feedback-widget.js`) referenced by
 * the manifest's `frontend[].bundle`. `@polis/react`, React, and ReactDOM are
 * externalized — the host app provides them, so the plugin registers against the
 * host's single React/registry instance.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/plugin.ts',
      formats: ['es'],
      fileName: () => 'feedback-widget.js',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@polis/react'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // The real @polis/react is private + externalized at build time; tests use a
    // stub so plugin.ts can be imported in isolation.
    alias: {
      '@polis/react': new URL('./test/stubs/polis-react.ts', import.meta.url).pathname,
    },
  },
});
