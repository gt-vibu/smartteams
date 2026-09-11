/**
 * Pre-commit checks.
 *
 * Configured as functions rather than plain command strings so the file list can be capped.
 * Passing every staged path to ESLint blows Windows' ~32k command-line limit on a large change —
 * a 269-file commit failed outright, which pushes people toward `--no-verify` and quietly
 * disables the hook that is supposed to protect the branch.
 *
 * Above the cap the whole workspace is linted in one invocation instead. Slower, but it always
 * runs, and a change that large is touching enough that a full pass is warranted anyway.
 */
const MAX_FILES = 40;

module.exports = {
  '*.{js,mjs,cjs,ts,tsx,json,md,yml,yaml,css}': (files) =>
    files.length > MAX_FILES
      ? ['prettier --write .']
      : [`prettier --write ${files.map((f) => JSON.stringify(f)).join(' ')}`],

  '*.{ts,tsx}': (files) =>
    files.length > MAX_FILES
      ? ['pnpm run lint']
      : [
          `eslint --fix --max-warnings=0 --no-warn-ignored ${files
            .map((f) => JSON.stringify(f))
            .join(' ')}`,
        ],
};
