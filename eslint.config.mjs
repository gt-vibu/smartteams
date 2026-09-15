import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'apps/api/jest.integration.config.cjs',
      'apps/api/jest.integration.setup.cjs',
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/src/generated/**',
      // Test-runner configuration lives outside the app tsconfig projects, so the
      // type-aware rules cannot resolve it.
      '**/vitest.config.*',
      '**/vitest.setup.*',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
  },
  /**
   * The Rules of Hooks, on the React surfaces only.
   *
   * `rules-of-hooks` is the one that matters here: a hook placed below an early return exists
   * only on the renders that get past it, and React aborts the whole tree when the count changes
   * between two renders of the same component. That is not theoretical — it took down the
   * Employee Workspace the moment an administrator gained an employee record while the profile
   * panels were mounted, which is exactly what self-enrollment does.
   *
   * Enabling it costs nothing today: the codebase has zero violations of it.
   *
   * `exhaustive-deps` is deliberately off, not forgotten. It reports 9 pre-existing findings in 6
   * files, all of them in shared infrastructure — `use-async-resource`, `standard-data-table`,
   * `use-anchored-panel`, `use-screen-tab`, `use-leave`, `auth-context`. Acting on them means
   * changing memoization and effect timing underneath every screen that uses those, which is a
   * piece of work in its own right rather than a footnote to a feature branch. Lint runs with
   * `--max-warnings=0`, so leaving the rule at "warn" would just break the build without anyone
   * having decided to do that work. Turn it on in the change that does it.
   */
  {
    files: [
      'apps/web-org/**/*.{ts,tsx}',
      'apps/web-admin/**/*.{ts,tsx}',
      'packages/ui/**/*.{ts,tsx}',
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  prettier,
);
