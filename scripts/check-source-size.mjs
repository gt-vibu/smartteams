import fs from 'node:fs';
import path from 'node:path';

const ignored = new Set(['node_modules', 'generated', 'dist', '.next', 'coverage', '.turbo']);
const violations = [];
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(?:ts|tsx|prisma|mjs|cjs)$/.test(file)) {
      const source = fs.readFileSync(file, 'utf8');
      const lines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
      if (lines > 500) violations.push(`${file}: ${lines} lines`);
    }
  }
}
scan('apps');
scan('packages');
if (violations.length) {
  console.error(
    'Handwritten source files must contain at most 500 lines:\n' + violations.join('\n'),
  );
  process.exitCode = 1;
} else console.log('All handwritten application, schema and package files are within 500 lines.');
