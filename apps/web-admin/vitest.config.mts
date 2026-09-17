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
        // Workspace packages ship compiled JS. Letting Vite transform them makes it resolve
        // their tsconfig, which extends a workspace preset it cannot locate from here.
        external: [/packages[\/](contracts|ui|config)[\/]/],
      },
    },
  },
});
