/**
 * Loads the repository `.env` into `process.env` for integration tests.
 *
 * The application reads it through Nest's ConfigModule, which Jest does not boot — so without
 * this the suite finds no DATABASE_URL and skips itself, which would look like a pass.
 */
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

try {
  const text = readFileSync(resolve(__dirname, '../../.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
} catch {
  // CI supplies the environment directly; a missing file here is not an error.
}
