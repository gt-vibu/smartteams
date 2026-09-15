module.exports = {
  collectCoverageFrom: ['src/**/*.ts', '!src/generated/**', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  // Integration tests need a live database, so they are excluded here and run by
  // `pnpm test:integration` (jest.integration.config.cjs). This suite must stay runnable
  // with no services up.
  testPathIgnorePatterns: ['\\.integration\\.spec\\.ts$'],
  testRegex: '.*\\.(spec|test)\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
};
