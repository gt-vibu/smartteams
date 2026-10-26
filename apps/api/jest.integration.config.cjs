/**
 * Integration tests: the ones that need a real database.
 *
 * Kept out of the default `test` run so unit tests stay fast and runnable with no services up.
 * CI executes this on the job that already stands up Postgres.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.integration.setup.cjs'],
  testRegex: '.*\.integration\.spec\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testTimeout: 60000,
};
