import { writeSync } from 'node:fs';

/**
 * Makes the API's exit explain itself.
 *
 * The local API once died mid-request with nothing in its log: no stack, no signal, no crash
 * record. Part of why is Windows: Node writes to a pipe asynchronously there, so a process that
 * reports a fatal error and exits can be gone before the report is written. These handlers write
 * synchronously to stderr first, then leave exactly as Node would have.
 *
 * - An uncaught exception or unhandled rejection still ends the process with code 1, as Node's
 *   default does; the only change is that its stack is guaranteed to reach the log.
 * - A shutdown signal is named before Nest's own shutdown hooks run. `once`, not `on`: Nest
 *   removes its listeners and re-sends the signal to itself to finish exiting, and a listener left
 *   behind here would swallow that and keep the process alive.
 * - The exit code is recorded on the way out. A process terminated from outside runs none of this,
 *   which is itself the signal: a supervisor sees the exit, and the log shows no reason given.
 */
export function installProcessDiagnostics(): void {
  process.on('uncaughtException', (error, origin) => {
    report(`fatal ${origin}: ${describe(error)}`);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    report(`fatal unhandledRejection: ${describe(reason)}`);
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
    process.once(signal, () => report(`received ${signal}; shutting down`));
  }
  process.once('exit', (code) => report(`exiting with code ${code}`));
}

function describe(value: unknown): string {
  return value instanceof Error ? (value.stack ?? value.message) : String(value);
}

function report(message: string): void {
  try {
    writeSync(2, `[smarteam-api] ${new Date().toISOString()} ${message}\n`);
  } catch {
    // stderr itself is gone; there is nowhere left to say it.
  }
}
