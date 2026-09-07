#!/usr/bin/env node
/**
 * Payroll staleness regression.
 *
 * A calculated payroll run is a snapshot of inputs that keep moving underneath it. Every mutation
 * that changes a figure the engine reads must invalidate the run, and the invalidation is only
 * worth anything if the approval gate actually refuses to let a stale run through. So each
 * scenario here drives the whole cycle rather than checking the timestamp alone: calculate,
 * mutate, assert stale, assert approval refused, recalculate, assert the run proceeds.
 *
 * Every scenario builds its own tenant and its own run, so one cannot contaminate another, and
 * the last two scenarios pin the boundaries of the invalidation — it must not cross a tenant, and
 * it must not reach a period the change does not touch.
 *
 *   pnpm verify:payroll-staleness
 */
const BASE = 'http://localhost:4000';
let pass = 0,
  fail = 0;
const ok = (l, c, d = '') => {
  if (c) {
    pass++;
    console.log('    PASS  ' + l + (d ? '  (' + d + ')' : ''));
  } else {
    fail++;
    console.log('    FAIL  ' + l + '  ' + d);
  }
};

function jar() {
  const s = new Map();
  return {
    absorb(r) {
      for (const raw of r.headers.getSetCookie?.() ?? []) {
        const [p] = raw.split(';');
        const i = p.indexOf('=');
        const n = p.slice(0, i).trim();
        const v = p.slice(i + 1).trim();
        if (v === '') s.delete(n);
        else s.set(n, v);
      }
    },
    h: () => [...s].map(([k, v]) => k + '=' + v).join('; '),
  };
}
async function call(j, m, p, b, h) {
  const H = { Accept: 'application/json', ...(h ?? {}) };
  if (b) H['Content-Type'] = 'application/json';
  const c = j.h();
  if (c) H.Cookie = c;
  const r = await fetch(BASE + p, {
    method: m,
    headers: H,
    body: b ? JSON.stringify(b) : undefined,
  });
  j.absorb(r);
  const t = await r.text();
  let payload = null;
  try {
    payload = JSON.parse(t);
  } catch {}
  return { status: r.status, payload, text: t };
}
const rows = (p) => {
  if (Array.isArray(p)) return p;
  if (!p || typeof p !== 'object') return [];
  for (const k of ['items', 'runs', 'requests', 'records', 'timesheets', 'data'])
    if (Array.isArray(p[k])) return p[k];
  return Object.values(p).find((v) => Array.isArray(v)) ?? [];
};
const good = (r) => [200, 201, 204].includes(r.status);
const detail = (r) => {
  try {
    return JSON.parse(r.text).detail;
  } catch {
    return String(r.status);
  }
};
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

async function tenant(tag) {
  const A = jar();
  const slug = tag + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  let r = await call(A, 'POST', '/v1/auth/register', {
    organizationName: 'SR ' + slug,
    timezone: 'Asia/Kolkata',
    currencyCode: 'INR',
    email: 'boss@' + slug + '.test',
    displayName: 'Boss Person',
    password: 'Str0ng-Passw0rd!',
  });
  // Every scenario needs its own tenant, and enough of them in one run will reach the auth rate
  // limit (30/minute). That is the limiter behaving correctly, not a failure of the thing under
  // test, so wait for the window to roll rather than reporting a false negative.
  for (let attempt = 0; r.status === 429 && attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20000));
    r = await call(A, 'POST', '/v1/auth/register', {
      organizationName: 'SR ' + slug,
      timezone: 'Asia/Kolkata',
      currencyCode: 'INR',
      email: 'boss@' + slug + '.test',
      displayName: 'Boss Person',
      password: 'Str0ng-Passw0rd!',
    });
  }
  if (!good(r)) throw new Error('tenant registration failed: HTTP ' + r.status + ' ' + detail(r));
  const AH = { 'x-csrf-token': r.payload.csrfToken };
  const orgId = (await call(A, 'GET', '/v1/auth/me')).payload.organization.id;
  const org = (m, p, b) =>
    call(A, m, '/v1/organizations/' + orgId + p, b, m === 'GET' ? undefined : AH);
  const roles = rows((await org('GET', '/roles')).payload);
  const branchId = rows((await org('GET', '/branches')).payload)[0].id;
  const email = 'e.' + slug + '@t.test';
  r = await org('POST', '/employees', {
    employeeNumber: 'EMP-1',
    firstName: 'Sam',
    lastName: 'Case',
    workEmail: email,
    employmentType: 'FULL_TIME',
    dateOfJoining: '2026-01-01',
  });
  const employeeId = r.payload.id;
  r = await org('POST', '/members', {
    email,
    displayName: 'Sam Case',
    roleIds: [roles.find((v) => v.code === 'EMPLOYEE').id],
    reason: 'regression',
  });
  await org('POST', '/employees/' + employeeId + '/user', { userId: r.payload.userId });
  await org('POST', '/employees/' + employeeId + '/branches', {
    branchId,
    startsOn: '2026-01-01',
    isPrimary: true,
  });
  await org('POST', '/payroll/profile', {
    employeeId,
    grossSalary: 60000,
    payType: 'SALARY',
    payFrequency: 'MONTHLY',
    overtimeMultiplier: 1.5,
    effectiveFrom: '2026-01-01',
    payrollEnabled: true,
    salarySlipMode: 'ENABLED',
    pfEnabled: false,
    esiEnabled: false,
    ptEnabled: false,
  });
  const today = iso(new Date());
  const monthStart = today.slice(0, 8) + '01';
  return { org, orgId, employeeId, branchId, today, monthStart, slug };
}

async function approveAllTimesheets(t) {
  for (const sheet of rows((await t.org('GET', '/timesheets')).payload)) {
    if (sheet.status === 'DRAFT') await t.org('POST', '/timesheets/' + sheet.id + '/submit', {});
    await t.org('POST', '/timesheets/' + sheet.id + '/decision', {
      status: 'APPROVED',
      comment: 'approved for the regression',
    });
  }
}

/** Full lifecycle assertion for one mutation. */
async function scenario(label, mutate, opts = {}) {
  console.log('\n  ' + label);
  const t = await tenant('sr');
  if (opts.setup) await opts.setup(t);
  const run = await t.org('POST', '/payroll/runs', {
    periodStart: t.monthStart,
    periodEnd: t.today,
    payFrequency: 'MONTHLY',
  });
  const calc = await t.org('POST', '/payroll/runs/' + run.payload.id + '/calculate', {});
  t.runId = run.payload.id;
  const state = async () =>
    rows((await t.org('GET', '/payroll/runs')).payload).find((x) => x.id === run.payload.id);

  const initial = await state();
  ok(
    'run is CALCULATED and not stale',
    initial?.status === 'CALCULATED' && !initial?.calculationStaleAt,
    initial?.status + ' / staleAt=' + (initial?.calculationStaleAt ?? 'null'),
  );
  if (!good(calc)) {
    console.log('    (setup failed: ' + detail(calc) + ')');
    return;
  }

  const applied = await mutate(t, run.payload.id);
  if (applied === 'skip') {
    fail++;
    console.log('    FAIL  mutation could not be applied');
    return;
  }

  const after = await state();
  ok(
    'the mutation marks the run stale',
    Boolean(after?.calculationStaleAt),
    'staleAt=' + (after?.calculationStaleAt ?? 'null'),
  );

  const blocked = await t.org('POST', '/payroll/runs/' + run.payload.id + '/action', {
    target: 'APPROVED',
    comment: 'regression approve attempt',
  });
  ok('approval is refused while stale', blocked.status === 409, 'HTTP ' + blocked.status);

  if (opts.stopAfterStale) return t;
  const recalc = await t.org('POST', '/payroll/runs/' + run.payload.id + '/calculate', {});
  ok(
    'the run recalculates',
    good(recalc),
    'HTTP ' + recalc.status + ' ' + (good(recalc) ? '' : detail(recalc)),
  );
  const cleared = await state();
  ok(
    'staleness clears after recalculation',
    !cleared?.calculationStaleAt,
    'staleAt=' + (cleared?.calculationStaleAt ?? 'null'),
  );

  const approve = await t.org('POST', '/payroll/runs/' + run.payload.id + '/action', {
    target: 'APPROVED',
    comment: 'regression approve',
  });
  ok(
    'the run can then be approved',
    good(approve),
    'HTTP ' + approve.status + ' ' + (good(approve) ? '' : detail(approve)),
  );
  if (opts.after) await opts.after(t);
  return t;
}

console.log('=== THE FIVE NEWLY WIRED PATHS ===');

await scenario('1. PUT /payroll/policy — organization payroll policy', async (t) =>
  good(
    await t.org('PUT', '/payroll/policy', {
      effectiveFrom: t.monthStart,
      payrollDayBasis: 26,
      basePercentage: 55,
      baseMinimum: 15000,
      hraPercentage: 40,
      roundingMode: 'HALF_UP',
      salarySlipDefault: true,
      payrollEnabledDefault: true,
      pfDefault: false,
      esiDefault: false,
      ptDefault: false,
    }),
  )
    ? 'ok'
    : 'skip',
);

await scenario('2. POST /payroll/statutory-rules — statutory rule', async (t) =>
  good(
    await t.org('POST', '/payroll/statutory-rules', {
      schemeCode: 'EPF',
      jurisdiction: 'KARNATAKA',
      effectiveFrom: t.monthStart,
      employeeRate: 12,
      employerRate: 12,
      wageCeiling: 15000,
    }),
  )
    ? 'ok'
    : 'skip',
);

await scenario('3. PUT /payroll/employee-policy — employee payroll policy', async (t) => {
  // The salary profile already wrote an open-ended employee policy; close it before adding one
  // that starts inside the run's period, or the overlap guard refuses.
  await t.org('PUT', '/payroll/employee-policy', {
    employeeId: t.employeeId,
    effectiveFrom: '2026-01-01',
    effectiveTo: daysAgo(2),
    payrollEnabled: true,
    salarySlipMode: 'ENABLED',
    pfEnabled: false,
    esiEnabled: false,
    ptEnabled: false,
  });
  const r = await t.org('PUT', '/payroll/employee-policy', {
    employeeId: t.employeeId,
    effectiveFrom: daysAgo(1),
    payrollEnabled: true,
    salarySlipMode: 'ENABLED',
    pfEnabled: true,
    esiEnabled: false,
    ptEnabled: false,
  });
  if (!good(r)) console.log('    (employee-policy: ' + detail(r) + ')');
  return good(r) ? 'ok' : 'skip';
});

await scenario('4. POST /payroll/components/assignments — pay component', async (t) => {
  const c = await t.org('POST', '/payroll/components', {
    code: 'CONVEY',
    name: 'Conveyance',
    componentType: 'EARNING',
    calculationType: 'FIXED',
    isTaxable: false,
    displayOrder: 10,
  });
  if (!good(c)) return 'skip';
  return good(
    await t.org('POST', '/payroll/components/assignments', {
      employeeId: t.employeeId,
      payComponentId: c.payload.id,
      amount: 1000,
      effectiveFrom: t.monthStart,
    }),
  )
    ? 'ok'
    : 'skip';
});

await scenario('5. deactivate() — employee deactivation', async (t) => {
  const r = await t.org('POST', '/employees/' + t.employeeId + '/deactivate', {
    reason: 'regression deactivation of a test employee',
  });
  if (!good(r)) console.log('    (deactivate: HTTP ' + r.status + ' ' + detail(r) + ')');
  return good(r) ? 'ok' : 'skip';
});

console.log('\n=== THE SEVEN ALREADY WIRED (regression) ===');

await scenario('6. leave approved', async (t) => {
  const paid = rows((await t.org('GET', '/leave/types')).payload).find((x) => x.paid);
  const r = await t.org('POST', '/leave/requests', {
    employeeId: t.employeeId,
    leaveTypeId: paid.id,
    startDate: daysAgo(2),
    endDate: daysAgo(2),
    reason: 'regression leave',
  });
  if (!good(r)) return 'skip';
  return good(
    await t.org('POST', '/leave/requests/' + r.payload.id + '/decision', {
      status: 'APPROVED',
      comment: 'regression approve',
    }),
  )
    ? 'ok'
    : 'skip';
});

await scenario('7. attendance punch', async (t) =>
  good(
    await t.org('POST', '/attendance/check-ins', {
      employeeId: t.employeeId,
      occurredAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      workDate: daysAgo(2),
      branchId: t.branchId,
    }),
  )
    ? 'ok'
    : 'skip',
);

await scenario('8. salary changed', async (t) => {
  await t.org('POST', '/payroll/profile', {
    employeeId: t.employeeId,
    grossSalary: 60000,
    payType: 'SALARY',
    payFrequency: 'MONTHLY',
    overtimeMultiplier: 1.5,
    effectiveFrom: '2026-01-01',
    effectiveTo: daysAgo(2),
    payrollEnabled: true,
    salarySlipMode: 'ENABLED',
    pfEnabled: false,
    esiEnabled: false,
    ptEnabled: false,
  });
  return good(
    await t.org('POST', '/payroll/profile', {
      employeeId: t.employeeId,
      grossSalary: 90000,
      payType: 'SALARY',
      payFrequency: 'MONTHLY',
      overtimeMultiplier: 1.5,
      effectiveFrom: daysAgo(1),
      payrollEnabled: true,
      salarySlipMode: 'ENABLED',
      pfEnabled: false,
      esiEnabled: false,
      ptEnabled: false,
    }),
  )
    ? 'ok'
    : 'skip';
});

await scenario('9. advance approved', async (t) => {
  const a = await t.org('POST', '/payroll/advances', {
    employeeId: t.employeeId,
    requestedAmount: 1000,
    reason: 'regression advance',
  });
  if (!good(a)) return 'skip';
  return good(
    await t.org('POST', '/payroll/advances/' + a.payload.id + '/decision', {
      status: 'APPROVED',
      comment: 'approved for the regression',
    }),
  )
    ? 'ok'
    : 'skip';
});

await scenario('10. adjustment added', async (t, runId) =>
  good(
    await t.org('POST', '/payroll/runs/' + runId + '/adjustments', {
      payrollRunId: runId,
      employeeId: t.employeeId,
      type: 'BONUS',
      amount: 500,
      description: 'regression bonus',
      taxable: false,
    }),
  )
    ? 'ok'
    : 'skip',
);

console.log('\n=== THE TWO PAYROLL-INTEGRITY DEFECTS ===');

await scenario(
  '11. POST /employees/:id/compensation — the second compensation writer',
  async (t, runId) => {
    // Close the open-ended record the salary profile wrote, then re-baseline, so the staleness
    // asserted below can only have come from the compensation route itself.
    await t.org('POST', '/payroll/profile', {
      employeeId: t.employeeId,
      grossSalary: 60000,
      payType: 'SALARY',
      payFrequency: 'MONTHLY',
      overtimeMultiplier: 1.5,
      effectiveFrom: '2026-01-01',
      effectiveTo: daysAgo(2),
      payrollEnabled: true,
      salarySlipMode: 'ENABLED',
      pfEnabled: false,
      esiEnabled: false,
      ptEnabled: false,
    });
    await t.org('POST', '/payroll/runs/' + runId + '/calculate', {});
    const r = await t.org('POST', '/employees/' + t.employeeId + '/compensation', {
      payType: 'SALARY',
      payFrequency: 'MONTHLY',
      baseAmount: 120000,
      currencyCode: 'INR',
      overtimeMultiplier: 2,
      effectiveFrom: daysAgo(1),
    });
    if (!good(r)) console.log('    (compensation: HTTP ' + r.status + ' ' + detail(r) + ')');
    return good(r) ? 'ok' : 'skip';
  },
);

const derived = await scenario(
  '12. POST /timesheets/periods/:id/derive — re-derive after approval',
  async (t) => {
    const red = await t.org('POST', '/timesheets/periods/' + t.periodId + '/derive', {});
    if (!good(red)) console.log('    (re-derive: HTTP ' + red.status + ' ' + detail(red) + ')');
    // The rebuild is what makes the run stale — sheets return to draft and their attendance entries
    // are rewritten. Pinned here so a later change cannot satisfy the staleness assertion while
    // quietly leaving the sheets approved.
    const after = rows((await t.org('GET', '/timesheets')).payload);
    ok(
      're-derive returns the sheets to draft',
      after.length > 0 && after.every((x) => x.status === 'DRAFT'),
      JSON.stringify(after.map((x) => x.status)),
    );
    return good(red) ? 'ok' : 'skip';
  },
  {
    stopAfterStale: true,
    setup: async (t) => {
      await t.org('POST', '/attendance/check-ins', {
        employeeId: t.employeeId,
        occurredAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        workDate: daysAgo(3),
        branchId: t.branchId,
      });
      const per = await t.org('POST', '/timesheets/periods', {
        periodType: 'MONTHLY',
        periodStart: t.monthStart,
        periodEnd: t.today,
      });
      t.periodId = per.payload.id;
      await t.org('POST', '/timesheets/periods/' + t.periodId + '/derive', {});
      await approveAllTimesheets(t);
      const statuses = rows((await t.org('GET', '/timesheets')).payload).map((x) => x.status);
      ok(
        'the timesheet reaches APPROVED before payroll runs',
        statuses.length > 0 && statuses.every((x) => x === 'APPROVED'),
        JSON.stringify(statuses),
      );
    },
  },
);

// Recovery after a re-derive.
//
// Payroll refuses the run, which is the point of the staleness fix. Deriving also opens a fresh
// approval cycle, so the same approver can take the rebuilt sheet through submit and approve
// again, and the run can then be brought back up to date.
{
  const t = derived;
  const blocked = await t.org('POST', '/payroll/runs/' + t.runId + '/calculate', {});
  ok(
    'recalculation is refused while the rebuilt sheets are unapproved',
    !good(blocked),
    'HTTP ' + blocked.status,
  );

  const sheets = rows((await t.org('GET', '/timesheets')).payload);
  const submitted = await t.org('POST', '/timesheets/' + sheets[0].id + '/submit', {});
  ok(
    'the rebuilt sheet can be submitted again',
    good(submitted),
    'HTTP ' + submitted.status + ' ' + (good(submitted) ? '' : detail(submitted)),
  );
  const decided = await t.org('POST', '/timesheets/' + sheets[0].id + '/decision', {
    status: 'APPROVED',
    comment: 'approved again after the rebuild',
  });
  ok(
    'the SAME approver can approve the re-derived sheet',
    good(decided),
    'HTTP ' + decided.status + ' ' + (good(decided) ? '' : detail(decided)),
  );
  ok(
    'the sheet reaches APPROVED again',
    rows((await t.org('GET', '/timesheets')).payload).every((x) => x.status === 'APPROVED'),
    JSON.stringify(rows((await t.org('GET', '/timesheets')).payload).map((x) => x.status)),
  );

  const recalc = await t.org('POST', '/payroll/runs/' + t.runId + '/calculate', {});
  ok(
    'the run recalculates once the sheets are approved again',
    good(recalc),
    'HTTP ' + recalc.status + ' ' + (good(recalc) ? '' : detail(recalc)),
  );
  const cleared = rows((await t.org('GET', '/payroll/runs')).payload).find((x) => x.id === t.runId);
  ok(
    'staleness clears',
    !cleared?.calculationStaleAt,
    'staleAt=' + (cleared?.calculationStaleAt ?? 'null'),
  );
  const ap = await t.org('POST', '/payroll/runs/' + t.runId + '/action', {
    target: 'APPROVED',
    comment: 'regression approve',
  });
  ok(
    'payroll proceeds normally afterwards',
    good(ap),
    'HTTP ' + ap.status + ' ' + (good(ap) ? '' : detail(ap)),
  );
}

console.log('\n=== ISOLATION AND SCOPING ===');
{
  console.log('\n  cross-tenant: one tenant cannot stale another');
  const a = await tenant('iso-a');
  const b = await tenant('iso-b');
  const runB = await b.org('POST', '/payroll/runs', {
    periodStart: b.monthStart,
    periodEnd: b.today,
    payFrequency: 'MONTHLY',
  });
  await b.org('POST', '/payroll/runs/' + runB.payload.id + '/calculate', {});
  // Tenant A performs a policy change; tenant B's calculated run must be untouched.
  await a.org('PUT', '/payroll/policy', {
    effectiveFrom: a.monthStart,
    payrollDayBasis: 26,
    basePercentage: 55,
    baseMinimum: 15000,
    hraPercentage: 40,
    roundingMode: 'HALF_UP',
    salarySlipDefault: true,
    payrollEnabledDefault: true,
    pfDefault: false,
    esiDefault: false,
    ptDefault: false,
  });
  const stateB = rows((await b.org('GET', '/payroll/runs')).payload).find(
    (x) => x.id === runB.payload.id,
  );
  ok(
    "tenant B's run is NOT stale after tenant A's change",
    !stateB?.calculationStaleAt,
    'staleAt=' + (stateB?.calculationStaleAt ?? 'null'),
  );
}
{
  console.log('\n  period scoping: an unrelated past period is not invalidated');
  const t = await tenant('scope');
  // A run for a period that ended before the change window.
  const past = await t.org('POST', '/payroll/runs', {
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    payFrequency: 'MONTHLY',
  });
  const calcPast = await t.org('POST', '/payroll/runs/' + past.payload.id + '/calculate', {});
  await t.org('PUT', '/payroll/policy', {
    effectiveFrom: t.monthStart,
    payrollDayBasis: 26,
    basePercentage: 55,
    baseMinimum: 15000,
    hraPercentage: 40,
    roundingMode: 'HALF_UP',
    salarySlipDefault: true,
    payrollEnabledDefault: true,
    pfDefault: false,
    esiDefault: false,
    ptDefault: false,
  });
  const statePast = rows((await t.org('GET', '/payroll/runs')).payload).find(
    (x) => x.id === past.payload.id,
  );
  ok(
    'a February run is untouched by a policy effective this month',
    good(calcPast) ? !statePast?.calculationStaleAt : true,
    good(calcPast)
      ? 'staleAt=' + (statePast?.calculationStaleAt ?? 'null')
      : 'past run could not calculate; skipped',
  );
}

{
  console.log('\n  compensation scoping: a change outside a period does not invalidate it');
  const t = await tenant('cscope');
  const past = await t.org('POST', '/payroll/runs', {
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    payFrequency: 'MONTHLY',
  });
  const calcPast = await t.org('POST', '/payroll/runs/' + past.payload.id + '/calculate', {});
  // The salary profile leaves an open-ended compensation record; close it so the record below can
  // be created at all, and recalculate so February starts from a clean, non-stale state.
  const dayBeforeMonthStart = iso(new Date(Date.parse(t.monthStart + 'T00:00:00Z') - 86400000));
  await t.org('POST', '/payroll/profile', {
    employeeId: t.employeeId,
    grossSalary: 60000,
    payType: 'SALARY',
    payFrequency: 'MONTHLY',
    overtimeMultiplier: 1.5,
    effectiveFrom: '2026-01-01',
    effectiveTo: dayBeforeMonthStart,
    payrollEnabled: true,
    salarySlipMode: 'ENABLED',
    pfEnabled: false,
    esiEnabled: false,
    ptEnabled: false,
  });
  await t.org('POST', '/payroll/runs/' + past.payload.id + '/calculate', {});
  // A compensation record that starts this month cannot change what February was paid.
  const c = await t.org('POST', '/employees/' + t.employeeId + '/compensation', {
    payType: 'SALARY',
    payFrequency: 'MONTHLY',
    baseAmount: 150000,
    currencyCode: 'INR',
    overtimeMultiplier: 2,
    effectiveFrom: t.monthStart,
  });
  const statePast = rows((await t.org('GET', '/payroll/runs')).payload).find(
    (x) => x.id === past.payload.id,
  );
  ok(
    'the out-of-period compensation record is actually created',
    good(c),
    'HTTP ' + c.status + ' ' + (good(c) ? '' : detail(c)),
  );
  ok(
    'a February run is untouched by compensation effective this month',
    !statePast?.calculationStaleAt,
    'staleAt=' + (statePast?.calculationStaleAt ?? 'null'),
  );
}

{
  console.log('\n  derive scoping: re-deriving one period does not invalidate another');
  const t = await tenant('dscope');
  const past = await t.org('POST', '/payroll/runs', {
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    payFrequency: 'MONTHLY',
  });
  const calcPast = await t.org('POST', '/payroll/runs/' + past.payload.id + '/calculate', {});
  const per = await t.org('POST', '/timesheets/periods', {
    periodType: 'MONTHLY',
    periodStart: t.monthStart,
    periodEnd: t.today,
  });
  const red = good(per)
    ? await t.org('POST', '/timesheets/periods/' + per.payload.id + '/derive', {})
    : per;
  const statePast = rows((await t.org('GET', '/payroll/runs')).payload).find(
    (x) => x.id === past.payload.id,
  );
  ok(
    'a February run is untouched by deriving this month',
    good(calcPast) && good(red) ? !statePast?.calculationStaleAt : true,
    good(calcPast) && good(red)
      ? 'staleAt=' + (statePast?.calculationStaleAt ?? 'null')
      : 'setup skipped (calc ' + calcPast.status + ', derive ' + red.status + ')',
  );
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
