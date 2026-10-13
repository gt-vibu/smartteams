import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.mts'],
    // Only our own tests; never reach into node_modules or build output.
    include: ['{components,lib}/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    server: {
      deps: {
        // Contracts/config ship compiled JS; UI exports TypeScript and is transformed.
        // External compiled packages do not need workspace tsconfig resolution.
        external: [/packages[\/](contracts|config)[\/]/],
      },
    },
  },
});
