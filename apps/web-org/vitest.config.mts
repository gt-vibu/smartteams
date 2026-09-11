import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.mts'],
    // Only our own tests; never reach into node_modules or build output.
    include: ['modules/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    server: {
      deps: {
        // `contracts` and `config` are consumed as compiled JS; letting Vite transform them
        // makes it resolve their tsconfig, which extends a workspace preset it cannot locate
        // from here. `ui` resolves to TypeScript source, so Vite must transform it.
        external: [/packages[\/](contracts|config)[\/]/],
      },
    },
  },
});
