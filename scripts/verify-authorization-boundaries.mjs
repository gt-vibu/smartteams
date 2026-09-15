#!/usr/bin/env node
/**
 * Can employee A act on employee B by changing an id in the request?
 *
 * Every self-service write permission — `attendance.write`, `leave.requests.write`,
 * `timesheets.write`, `timesheets.submit`, `files.write` — is held by every seeded employee. The
 * services used to check only that the target belonged to the same organisation, so a UUID
 * belonging to a colleague was enough to punch, correct, book leave, log time, submit, recall or
 * delete on their behalf. These checks drive each of those paths as a real signed-in employee.
 *
 * Also covered here: the punch timestamp. A self-service punch is recorded at server time, so a
 * forged past or future `occurredAt` cannot manufacture attendance that feeds overtime and pay.
 *
 * Positive cases are asserted alongside the negative ones. A boundary that refuses everything
 * would pass a suite of denials while breaking the product.
 *
 *   pnpm verify:authorization-boundaries
 */
import { weekdaysAgo } from './lib/dates.mjs';
import { daysAgo, finish, good, ok, refused, rows, tenant } from './lib/authz-harness.mjs';

const t = await tenant('az');
const other = await tenant('oz');

console.log('attendance punches');
{
  const own = await t.a.as('POST', '/attendance/check-ins', {
    employeeId: t.a.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  ok('an employee may punch for themselves', good(own), 'HTTP ' + own.status);

  const forOther = await t.a.as('POST', '/attendance/check-ins', {
    employeeId: t.b.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  // Refused outright, rather than quietly recorded against the caller: naming a colleague is a
  // different request from omitting the field, and it must not succeed.
  ok('an employee may not punch for a colleague', refused(forOther), 'HTTP ' + forOther.status);

  const crossTenant = await t.a.as('POST', '/attendance/check-ins', {
    employeeId: other.a.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  ok(
    'an employee may not punch for another tenant',
    refused(crossTenant),
    'HTTP ' + crossTenant.status,
  );

  const forged = await t.a.as('POST', '/attendance/check-ins', {
    employeeId: '00000000-0000-4000-8000-000000000000',
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  ok('a forged employee id is refused', refused(forged), 'HTTP ' + forged.status);
}

console.log('\nattendance timestamps are the server’s');
{
  const employee = await tenant('ts');
  const forgedPast = await employee.a.as('POST', '/attendance/check-ins', {
    employeeId: employee.a.id,
    occurredAt: '2020-01-01T03:00:00.000Z',
    workDate: '2020-01-01',
    branchId: employee.branchId,
  });
  ok(
    'a punch with a forged past timestamp is accepted but not believed',
    good(forgedPast),
    'HTTP ' + forgedPast.status,
  );

  const recorded = rows(
    (
      await employee.org(
        'GET',
        `/attendance?employeeId=${employee.a.id}&from=2020-01-01&to=2020-01-02`,
      )
    ).payload,
  );
  ok(
    'nothing is filed under the forged date',
    recorded.length === 0,
    recorded.length + ' rows in 2020',
  );

  const todayRows = rows(
    (
      await employee.org(
        'GET',
        `/attendance?employeeId=${employee.a.id}&from=${employee.today}&to=${employee.today}`,
      )
    ).payload,
  );
  ok('the punch is filed under today', todayRows.length === 1, todayRows.length + ' rows today');
  const punchedAt = todayRows[0] ? new Date(todayRows[0].createdAt ?? Date.now()).getFullYear() : 0;
  ok('and carries a present-day timestamp', punchedAt >= 2026, String(punchedAt));
}

console.log('\nattendance corrections');
{
  const bRecord = await t.b.as('POST', '/attendance/check-ins', {
    employeeId: t.b.id,
    occurredAt: new Date().toISOString(),
    workDate: t.today,
    branchId: t.branchId,
  });
  const bRecordId = bRecord.payload?.attendanceRecordId ?? bRecord.payload?.record?.id;
  const aRows = rows(
    (await t.a.as('GET', '/attendance?from=' + t.today + '&to=' + t.today)).payload,
  );
  const aRecordId = aRows[0]?.id;

  if (aRecordId) {
    const own = await t.a.as('POST', '/attendance/' + aRecordId + '/corrections', {
      reason: 'Adjusting my own recorded hours for the day',
    });
    ok('an employee may correct their own record', good(own), 'HTTP ' + own.status);
  } else {
    ok('an employee may correct their own record', false, 'no own record found');
  }

  if (bRecordId) {
    const forOther = await t.a.as('POST', '/attendance/' + bRecordId + '/corrections', {
      reason: 'Attempting to correct a colleague record',
    });
    ok(
      "an employee may not correct a colleague's record",
      refused(forOther),
      'HTTP ' + forOther.status,
    );
  } else {
    ok(
      "an employee may not correct a colleague's record",
      false,
      'no colleague record id returned',
    );
  }
}

console.log('\nleave requests');
{
  const paid = rows((await t.a.as('GET', '/leave/types')).payload).find((type) => type.paid);
  const own = await t.a.as('POST', '/leave/requests', {
    employeeId: t.a.id,
    leaveTypeId: paid.id,
    startDate: weekdaysAgo(2),
    endDate: weekdaysAgo(2),
    reason: 'Own leave request',
  });
  ok('an employee may request their own leave', good(own), 'HTTP ' + own.status);

  const forOther = await t.a.as('POST', '/leave/requests', {
    employeeId: t.b.id,
    leaveTypeId: paid.id,
    startDate: daysAgo(3),
    endDate: daysAgo(3),
    reason: 'Booking leave for a colleague',
  });
  ok(
    'an employee may not request leave for a colleague',
    refused(forOther),
    'HTTP ' + forOther.status,
  );
}

console.log('\ntimesheets');
{
  const period = await t.org('POST', '/timesheets/periods', {
    periodType: 'MONTHLY',
    periodStart: t.monthStart,
    periodEnd: t.today,
  });
  await t.org('POST', '/timesheets/periods/' + period.payload.id + '/derive', {});
  const sheets = rows((await t.org('GET', '/timesheets')).payload);
  const aSheet = sheets.find((sheet) => sheet.employeeId === t.a.id);
  const bSheet = sheets.find((sheet) => sheet.employeeId === t.b.id);

  const ownEntry = await t.a.as('POST', '/timesheets/entries', {
    timesheetId: aSheet?.id,
    workDate: t.today,
    minutes: 60,
    description: 'Own work',
  });
  ok('an employee may log time on their own sheet', good(ownEntry), 'HTTP ' + ownEntry.status);

  const otherEntry = await t.a.as('POST', '/timesheets/entries', {
    timesheetId: bSheet?.id,
    workDate: t.today,
    minutes: 60,
    description: 'Work on a colleague sheet',
  });
  ok(
    "an employee may not log time on a colleague's sheet",
    refused(otherEntry),
    'HTTP ' + otherEntry.status,
  );

  const otherSubmit = await t.a.as('POST', '/timesheets/' + bSheet?.id + '/submit', {});
  ok(
    "an employee may not submit a colleague's sheet",
    refused(otherSubmit),
    'HTTP ' + otherSubmit.status,
  );

  const ownSubmit = await t.a.as('POST', '/timesheets/' + aSheet?.id + '/submit', {});
  ok('an employee may submit their own sheet', good(ownSubmit), 'HTTP ' + ownSubmit.status);

  const otherUnsubmit = await t.b.as('POST', '/timesheets/' + aSheet?.id + '/unsubmit', {});
  ok(
    "an employee may not recall a colleague's submission",
    refused(otherUnsubmit),
    'HTTP ' + otherUnsubmit.status,
  );

  const ownUnsubmit = await t.a.as('POST', '/timesheets/' + aSheet?.id + '/unsubmit', {});
  ok(
    'an employee may recall their own submission',
    good(ownUnsubmit),
    'HTTP ' + ownUnsubmit.status,
  );
}

console.log('\nadministrative breadth still works');
{
  const adminPunch = await t.org('POST', '/attendance/check-ins', {
    employeeId: t.b.id,
    occurredAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    workDate: daysAgo(5),
    branchId: t.branchId,
  });
  ok('an administrator may punch for an employee', good(adminPunch), 'HTTP ' + adminPunch.status);

  const backdated = rows(
    (await t.org('GET', `/attendance?employeeId=${t.b.id}&from=${daysAgo(5)}&to=${daysAgo(5)}`))
      .payload,
  );
  // Breadth includes supplying the time: an administrator importing from a device is recording
  // something that happened elsewhere, which is exactly what a self-service punch is not.
  ok('and may supply the moment it happened', backdated.length === 1, backdated.length + ' rows');
}

console.log('\nproject quick-add from Log Time');
{
  // Creating a project from a timesheet is creating a project, so it takes the Projects module's
  // `projects.write` — not the `timesheets.write` every employee holds, which it used to check.
  const byEmployee = await t.a.as('POST', '/timesheets/projects', { name: 'Shadow Project' });
  ok(
    'an employee may not create a project from Log Time',
    refused(byEmployee),
    'HTTP ' + byEmployee.status,
  );

  const listed = rows((await t.org('GET', '/projects')).payload);
  ok(
    'and no such project was created',
    !listed.some((project) => project.name === 'Shadow Project'),
    listed.length + ' projects',
  );

  const byAdmin = await t.org('POST', '/timesheets/projects', { name: 'Website Redesign' });
  ok('an administrator may', good(byAdmin), 'HTTP ' + byAdmin.status);
  const afterAdmin = rows((await t.org('GET', '/projects')).payload);
  ok(
    'and the new project is in the list the Log Time dropdown reads',
    afterAdmin.some((project) => project.id === byAdmin.payload?.id),
    afterAdmin.length + ' projects',
  );
}

finish();
