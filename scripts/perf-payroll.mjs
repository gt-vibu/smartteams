#!/usr/bin/env node
/**
 * Payroll calculation performance harness.
 *
 * Payroll is the one operation whose cost grows with the size of the tenant, so it is the one
 * operation whose cost has to be measured rather than assumed. This seeds a tenant at a given
 * headcount, calculates a run, and reports wall time alongside the exact number of database
 * statements the calculation issued — read from the API's own `/metrics`, so the count is what
 * the database actually saw rather than an estimate from reading the code.
 *
 * Employees, compensation and attendance are inserted directly rather than through the API: the
 * subject under test is the calculation, and seeding ten thousand employees over HTTP would take
 * far longer than the thing being measured.
 *
 *   pnpm perf:payroll                  # 10, 100, 1000
 *   pnpm perf:payroll 10 100 1000 5000
 *
 * Requires the API and database to be running.
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolveDatabaseUrl } from './lib/database-url.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');

const BASE = process.env.PERF_API_URL ?? 'http://localhost:4000';
const DB = resolveDatabaseUrl();
const METRICS_TOKEN = process.env.METRICS_TOKEN ?? '';
/** Attendance rows seeded per employee. The product of this and headcount is what used to be scanned per employee. */
const ATTENDANCE_DAYS = Number(process.env.PERF_ATTENDANCE_DAYS ?? 20);

const headcounts = process.argv
  .slice(2)
  .map(Number)
  .filter((n) => Number.isFinite(n) && n > 0);
const sizes = headcounts.length > 0 ? headcounts : [10, 100, 1000];

function jar() {
  const store = new Map();
  return {
    absorb(response) {
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        if (value === '') store.delete(name);
        else store.set(name, value);
      }
    },
    header: () => [...store].map(([k, v]) => k + '=' + v).join('; '),
  };
}

async function call(cookies, method, path, body, extra) {
  const headers = { Accept: 'application/json', ...(extra ?? {}) };
  if (body) headers['Content-Type'] = 'application/json';
  const cookie = cookies.header();
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  cookies.absorb(response);
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { status: response.status, payload, text };
}

const good = (r) => [200, 201, 204].includes(r.status);
const detail = (r) => {
  try {
    return JSON.parse(r.text).detail;
  } catch {
    return String(r.status);
  }
};
const iso = (d) => d.toISOString().slice(0, 10);

/** Total database time the API has spent, from its own metrics. */
async function dbSeconds() {
  const response = await fetch(BASE + '/metrics', {
    headers: METRICS_TOKEN ? { Authorization: 'Bearer ' + METRICS_TOKEN } : {},
  });
  if (!response.ok) return null;
  for (const line of (await response.text()).split(String.fromCharCode(10)))
    if (line.startsWith('smarteam_db_statement_duration_seconds_sum'))
      return Number(line.slice(line.lastIndexOf(' ') + 1));
  return null;
}

/** One gauge or counter from the API's `/metrics`, or null when it is not exposed. */
async function metric(name) {
  const response = await fetch(BASE + '/metrics', {
    headers: METRICS_TOKEN ? { Authorization: 'Bearer ' + METRICS_TOKEN } : {},
  });
  if (!response.ok) return null;
  for (const line of (await response.text()).split(String.fromCharCode(10)))
    if (line.startsWith(name + ' ')) return Number(line.slice(name.length + 1));
  return null;
}

/**
 * The API process's peak resident memory while `work` runs, sampled from its own metrics.
 *
 * A sample every 100 ms can miss a short spike, so this is a lower bound on the true peak.
 */
async function withPeakMemory(work) {
  let peak = (await metric('process_resident_memory_bytes')) ?? 0;
  let sampling = true;
  const sampler = (async () => {
    while (sampling) {
      const rss = await metric('process_resident_memory_bytes');
      if (rss !== null && rss > peak) peak = rss;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })();
  try {
    return { result: await work(), peakRss: () => peak };
  } finally {
    sampling = false;
    await sampler;
  }
}

/** Total database statements the API has issued, from its own metrics. */
async function statementCount() {
  const response = await fetch(BASE + '/metrics', {
    headers: METRICS_TOKEN ? { Authorization: 'Bearer ' + METRICS_TOKEN } : {},
  });
  if (!response.ok) return null;
  const body = await response.text();
  let total = 0;
  for (const line of body.split('\n')) {
    if (!line.startsWith('smarteam_db_statements_total{')) continue;
    const value = Number(line.slice(line.lastIndexOf('}') + 1).trim());
    if (Number.isFinite(value)) total += value;
  }
  return total;
}

async function seedTenant(db, headcount) {
  const cookies = jar();
  const slug = 'perf' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  const credentials = {
    organizationName: 'PERF ' + slug,
    timezone: 'Asia/Kolkata',
    currencyCode: 'INR',
    email: 'boss@' + slug + '.test',
    displayName: 'Boss Person',
    password: 'Str0ng-Passw0rd!',
  };
  let response = await call(cookies, 'POST', '/v1/auth/register', credentials);
  for (let attempt = 0; response.status === 429 && attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20000));
    response = await call(cookies, 'POST', '/v1/auth/register', credentials);
  }
  if (!good(response))
    throw new Error('registration failed: HTTP ' + response.status + ' ' + detail(response));
  const csrf = { 'x-csrf-token': response.payload.csrfToken };
  const orgId = (await call(cookies, 'GET', '/v1/auth/me')).payload.organization.id;
  const org = (method, path, body) =>
    call(
      cookies,
      method,
      '/v1/organizations/' + orgId + path,
      body,
      method === 'GET' ? undefined : csrf,
    );

  const today = new Date();
  const monthStart = iso(today).slice(0, 8) + '01';

  // Bulk seed. Multi-row inserts keep the seed itself from dominating the measurement.
  const employeeIds = [];
  const CHUNK = 500;
  for (let start = 0; start < headcount; start += CHUNK) {
    const size = Math.min(CHUNK, headcount - start);
    const employeeValues = [];
    const employeeParams = [];
    const compensationValues = [];
    const compensationParams = [];
    for (let i = 0; i < size; i += 1) {
      const id = randomUUID();
      employeeIds.push(id);
      const n = start + i;
      const base = employeeParams.length;
      employeeParams.push(id, orgId, 'PERF-' + String(n).padStart(6, '0'), 'Perf', 'N' + n);
      employeeValues.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},'NATIVE','ACTIVE','FULL_TIME',now())`,
      );
      const cbase = compensationParams.length;
      compensationParams.push(randomUUID(), orgId, id, 30000 + (n % 40) * 750);
      compensationValues.push(
        `($${cbase + 1},$${cbase + 2},$${cbase + 3},'SALARY','MONTHLY',$${cbase + 4},'INR',1.5,DATE '2026-01-01',now())`,
      );
    }
    await db.query(
      `INSERT INTO employees (id, organization_id, employee_number, first_name, last_name, identity_source, status, employment_type, updated_at)
       VALUES ${employeeValues.join(',')}`,
      employeeParams,
    );
    await db.query(
      `INSERT INTO employee_compensation (id, organization_id, employee_id, pay_type, pay_frequency, base_amount, currency_code, overtime_multiplier, effective_from, updated_at)
       VALUES ${compensationValues.join(',')}`,
      compensationParams,
    );
  }

  // Attendance, so the per-employee reduction has a realistic amount of data to work through.
  let attendanceRows = 0;
  for (let start = 0; start < employeeIds.length; start += 200) {
    const slice = employeeIds.slice(start, start + 200);
    const values = [];
    const params = [];
    for (const employeeId of slice) {
      for (let day = 1; day <= ATTENDANCE_DAYS; day += 1) {
        const workDate = monthStart.slice(0, 8) + String(day).padStart(2, '0');
        const base = params.length;
        params.push(randomUUID(), orgId, employeeId, workDate);
        values.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},'NATIVE',480,0,'PRESENT',now())`,
        );
        attendanceRows += 1;
      }
    }
    if (values.length > 0)
      await db.query(
        `INSERT INTO attendance_records (id, organization_id, employee_id, work_date, source_access_mode, worked_minutes, overtime_minutes, day_status, updated_at)
         VALUES ${values.join(',')}`,
        params,
      );
  }

  return { org, orgId, monthStart, today: iso(today), attendanceRows };
}

const db = new Client({ connectionString: DB });
await db.connect();

console.log(
  'headcount |   attendance |    wall ms | statements | stmts/employee | ms/employee |     db time      | outcome',
);
console.log(
  '----------+--------------+------------+------------+----------------+-------------+------------------+--------',
);

const details = [];
for (const headcount of sizes) {
  const tenant = await seedTenant(db, headcount);
  const run = await tenant.org('POST', '/payroll/runs', {
    periodStart: tenant.monthStart,
    periodEnd: tenant.today,
    payFrequency: 'MONTHLY',
  });
  if (!good(run)) throw new Error('run creation failed: ' + detail(run));

  const before = await statementCount();
  const dbBefore = await dbSeconds();
  const cpuBefore = await metric('process_cpu_seconds_total');
  const rssBefore = await metric('process_resident_memory_bytes');
  const started = process.hrtime.bigint();
  const measured = await withPeakMemory(() =>
    tenant.org('POST', '/payroll/runs/' + run.payload.id + '/calculate', {}),
  );
  const calculated = measured.result;
  const wall = Number(process.hrtime.bigint() - started) / 1e6;
  const after = await statementCount();
  const dbAfter = await dbSeconds();
  const cpuAfter = await metric('process_cpu_seconds_total');
  const dbMs = dbBefore !== null && dbAfter !== null ? (dbAfter - dbBefore) * 1000 : null;
  const cpuMs = cpuBefore !== null && cpuAfter !== null ? (cpuAfter - cpuBefore) * 1000 : null;

  // What the calculation wrote, and how large the two full-run JSON documents are.
  const written = (
    await db.query(
      `SELECT
         (SELECT count(*)::int FROM payroll_line_items WHERE payroll_run_id = $1) AS lines,
         (SELECT count(*)::int FROM payroll_line_item_components c
            JOIN payroll_line_items l ON l.id = c.payroll_line_item_id
           WHERE l.payroll_run_id = $1) AS components,
         (SELECT coalesce(max(pg_column_size(after_state)), 0)::int FROM audit_logs
           WHERE entity_id = $1 AND action = 'PAYROLL_RUN_CALCULATED') AS audit_bytes,
         (SELECT coalesce(max(pg_column_size(payload)), 0)::int FROM outbox_events
           WHERE aggregate_id = $1 AND event_type = 'payroll.run.calculated') AS outbox_bytes`,
      [run.payload.id],
    )
  ).rows[0];
  const lines = written.lines;
  details.push({
    headcount,
    attendanceRows: tenant.attendanceRows,
    wallMs: Math.round(wall),
    dbMs: dbMs === null ? null : Math.round(dbMs),
    cpuMs: cpuMs === null ? null : Math.round(cpuMs),
    rssBeforeMb: rssBefore === null ? null : Math.round(rssBefore / 1048576),
    peakRssMb: Math.round(measured.peakRss() / 1048576),
    lines,
    components: written.components,
    auditKb: Math.round(written.audit_bytes / 1024),
    outboxKb: Math.round(written.outbox_bytes / 1024),
  });
  const statements = before !== null && after !== null ? after - before : null;
  const outcome = good(calculated)
    ? lines === headcount
      ? 'ok'
      : 'LINE COUNT ' + lines + ' != ' + headcount
    : 'FAILED ' + calculated.status + ' ' + detail(calculated);

  console.log(
    [
      String(headcount).padStart(9),
      String(tenant.attendanceRows).padStart(12),
      wall.toFixed(0).padStart(10),
      (statements === null ? 'n/a' : String(statements)).padStart(10),
      (statements === null ? 'n/a' : (statements / headcount).toFixed(2)).padStart(14),
      (wall / headcount).toFixed(2).padStart(11),
      (dbMs === null
        ? 'n/a'
        : dbMs.toFixed(0) + 'ms db / ' + ((dbMs / wall) * 100).toFixed(0) + '%'
      ).padStart(16),
      outcome,
    ].join(' | '),
  );
}

// Resources per run: CPU and memory of the API process, rows written, and the size of the audit
// and outbox documents, each of which carries every line of the run.
console.log('');
console.table(details);

await db.end();
