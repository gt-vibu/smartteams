#!/usr/bin/env node
/**
 * The API's development loop: rebuild on change, run, and keep it running.
 *
 * This replaces `nest start --watch`, which restarts the API only after a rebuild. When the API
 * process ended any other way, the watcher went on waiting for a file change and said nothing, so
 * the local API stayed down — every request a 500 through the web proxy — until someone noticed
 * and restarted it by hand. That is what happened when it died mid-request one afternoon, and
 * because it logged nothing on the way out, there was no telling why.
 *
 * Here the compiler and the server are separate processes. `nest build --watch` compiles; this
 * script starts `dist/main.js` after each clean build, and when the server exits without being
 * asked to, it says how (exit code or signal, with the Windows status decoded) and starts it
 * again. If it keeps dying — five times inside a minute — it stops retrying and waits for the next
 * build, so a server that cannot start does not spin.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(apiRoot, 'package.json'));
const nestCli = join(dirname(require.resolve('@nestjs/cli/package.json')), 'bin', 'nest.js');

const CRASH_WINDOW_MS = 60_000;
const MAX_CRASHES = 5;

let server = null;
let stopping = false;
let crashes = [];
let pendingRestart = null;

const log = (message) => console.log(`\x1b[35m[api-dev]\x1b[0m ${message}`);

/** Windows reports fatal conditions as NTSTATUS codes in the exit code. */
const WINDOWS_STATUS = {
  0xc0000005: 'access violation — a native module crashed',
  0xc00000fd: 'stack overflow',
  0xc0000409: 'fail-fast / abort',
  0xc000013a: 'terminated by Ctrl+C',
  // What Task Manager, `Stop-Process -Force` and `process.kill()` leave behind on Windows.
  0xffffffff: 'terminated from outside',
};

function describeExit(code, signal) {
  if (signal) return `killed by ${signal}`;
  if (code === null) return 'ended without an exit code';
  const unsigned = code >>> 0;
  const status = WINDOWS_STATUS[unsigned];
  if (status) return `exit code 0x${unsigned.toString(16)} (${status})`;
  if (code === 0) return 'exit code 0 (it stopped on its own)';
  if (code === 1)
    return 'exit code 1 — a fatal error printed just above, or, with nothing above, terminated from outside';
  return unsigned > 0xffff ? `exit code 0x${unsigned.toString(16)}` : `exit code ${code}`;
}

function startServer() {
  pendingRestart = null;
  const child = spawn(
    process.execPath,
    ['--enable-source-maps', join(apiRoot, 'dist', 'main.js')],
    {
      cwd: apiRoot,
      stdio: 'inherit',
    },
  );
  server = child;
  child.on('exit', (code, signal) => {
    if (server !== child) return; // replaced on purpose by a rebuild
    server = null;
    if (stopping) return;

    const now = Date.now();
    crashes = crashes.filter((at) => now - at < CRASH_WINDOW_MS);
    crashes.push(now);
    log(`API stopped unexpectedly: ${describeExit(code, signal)}.`);
    if (crashes.length > MAX_CRASHES) {
      log(
        `It has stopped ${crashes.length} times in a minute; waiting for a code change before trying again.`,
      );
      return;
    }
    const delay = 1_000 * crashes.length;
    log(`Restarting in ${delay / 1000}s.`);
    pendingRestart = setTimeout(startServer, delay);
  });
}

/** After a clean build: replace the running server, or start one if none is up. */
function restartForBuild() {
  crashes = [];
  if (pendingRestart) clearTimeout(pendingRestart);
  const previous = server;
  if (!previous) return startServer();
  server = null;
  // The new server starts only once the old one has released the port.
  previous.once('exit', startServer);
  previous.kill();
}

const compiler = spawn(process.execPath, [nestCli, 'build', '--watch'], {
  cwd: apiRoot,
  stdio: ['ignore', 'pipe', 'inherit'],
});
createInterface({ input: compiler.stdout }).on('line', (line) => {
  console.log(line);
  // The TypeScript watcher's own report of a clean pass, after the first build and every rebuild.
  if (/Found 0 errors\. Watching for file changes\./.test(line)) restartForBuild();
});
compiler.on('exit', (code) => {
  if (stopping) return;
  log(`The compiler exited (${describeExit(code, null)}); stopping.`);
  shutdown(code ?? 1);
});

function shutdown(code) {
  stopping = true;
  if (pendingRestart) clearTimeout(pendingRestart);
  server?.kill();
  compiler.kill();
  process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => shutdown(0));
