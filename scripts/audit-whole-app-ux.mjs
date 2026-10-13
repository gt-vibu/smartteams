/* global document, innerWidth, getComputedStyle */

import { chromium } from 'playwright';
import fs from 'node:fs';
import { tenant, good } from './lib/authz-harness.mjs';
import { seedUxLists, extraUxCases } from './lib/ux-audit-fixtures.mjs';

// Read-only navigation in a newly created test organization. Never approves or releases payroll.
const t = await tenant('whole-app-ux');
await t.a.completeOnboarding();
await t.b.completeOnboarding();
await seedUxLists(t);
const dir = 'scratch/whole-app-ux';
const appBase = process.env.ORG_UI_URL ?? 'http://localhost:3000';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const errors = [];
const contexts = [];
try {
  for (const [persona, cookies, space, modules] of [
    [
      'admin',
      t.cookies,
      'organization',
      [
        'home',
        'employees',
        'onboarding',
        'time-off',
        'attendance',
        'holidays',
        'timesheet',
        'teams',
        'projects',
        'payroll',
        'shifts',
        'approvals',
        'files',
        'reports',
      ],
    ],
    [
      'employee',
      t.a.cookies,
      'my-space',
      [
        'home',
        'time-off',
        'holidays',
        'timesheet',
        'attendance',
        'projects',
        'payroll',
        'approvals',
        'files',
      ],
    ],
    [
      'manager',
      t.b.cookies,
      'my-space',
      ['home', 'approvals', 'time-off', 'timesheet', 'attendance', 'projects'],
    ],
    [
      'hr',
      t.b.cookies,
      'organization',
      [
        'home',
        'employees',
        'onboarding',
        'time-off',
        'attendance',
        'shifts',
        'holidays',
        'timesheet',
        'files',
        'reports',
      ],
    ],
    ['finance', t.a.cookies, 'organization', ['home', 'payroll', 'reports']],
  ]) {
    if (persona === 'hr') {
      const role = t.roles.find((role) => role.code === 'HR_ADMIN');
      if (
        !role ||
        !good(await t.org('POST', '/role-assignments', { userId: t.b.userId, roleId: role.id }))
      )
        throw new Error('Cannot prepare HR role');
    }
    if (persona === 'finance') {
      const role = await t.org('POST', '/roles', {
        code: 'UX_FINANCE',
        name: 'Payroll reviewer',
        scope: 'ORGANIZATION',
        permissionKeys: [
          'employees.read',
          'employees.read.all',
          'branches.read',
          'payroll.runs.read',
          'payroll.employee-profile.read',
          'payroll.employee-profile.read.all',
          'payroll.components.read',
          'payroll.policy.read',
          'payroll.payslips.read.all',
          'attendance.read',
          'attendance.read.all',
          'leave.requests.read',
          'leave.requests.read.all',
          'timesheets.read',
          'timesheets.read.all',
        ],
      });
      if (
        !good(role) ||
        !good(
          await t.org('POST', '/role-assignments', { userId: t.a.userId, roleId: role.payload.id }),
        )
      )
        throw new Error('Cannot prepare payroll review role');
    }
    const context = await browser.newContext();
    contexts.push(context);
    const proxyFrom = process.env.PLAYWRIGHT_API_PROXY_FROM;
    const proxyTo = process.env.PLAYWRIGHT_API_PROXY_TO;
    if (proxyFrom && proxyTo) {
      await context.route(`${proxyFrom.replace(/\/$/, '')}/**`, (route) =>
        route
          .fetch({ url: route.request().url().replace(proxyFrom, proxyTo) })
          .then((response) => route.fulfill({ response })),
      );
    }
    await context.addCookies(
      cookies
        .header()
        .split('; ')
        .map((pair) => {
          const i = pair.indexOf('=');
          return {
            name: pair.slice(0, i),
            value: pair.slice(i + 1),
            url: appBase,
            sameSite: 'Lax',
          };
        }),
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push({ persona, error: error.message }));
    const cases = [...modules.map((module) => [module, '']), ...(extraUxCases[persona] ?? [])];
    for (const [module, extra, clicks = []] of cases) {
      const caseName = [module, extra, ...clicks]
        .filter(Boolean)
        .join('-')
        .replace(/[^\w-]/g, '_');
      await page.setViewportSize({ width: 1366, height: 900 });
      await page.goto(`${appBase}/?space=${space}&module=${module}&${extra}`, {
        waitUntil: 'networkidle',
        timeout: 60000,
      });
      // The client-only workspace can still be importing/authenticating after networkidle.
      // Wait for its real layout before treating a loading shell as a valid screen capture.
      await page.getByRole('main').waitFor({ state: 'visible', timeout: 60000 });
      for (const label of clicks) {
        const root = page.locator('main');
        await root
          .getByRole('button', { name: label, exact: true })
          .or(root.getByRole('tab', { name: label, exact: true }))
          .click();
      }
      for (const [size, width, height] of [
        ['desktop', 1366, 900],
        ['mobile', 390, 844],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(300);
        // Responsive layouts remount resources; wait for their requests before capturing.
        await page.waitForLoadState('networkidle');
        const pendingLoad = page
          .locator('main')
          .getByText(/^Loading\b/)
          .first();
        await pendingLoad.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
        await page.screenshot({
          path: `${dir}/${persona}-${caseName}-${size}.png`,
          fullPage: true,
        });
        const snapshot = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          headings: [...document.querySelectorAll('h1,h2,h3')].map((e) => e.textContent),
          alerts: [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent),
          unnamedButtons: [...document.querySelectorAll('button')].filter(
            (e) =>
              e.getBoundingClientRect().width &&
              !e.textContent.trim() &&
              !e.getAttribute('aria-label') &&
              !e.getAttribute('title'),
          ).length,
          clippedSectionLabels: [
            ...document.querySelectorAll(
              '[aria-label="Payroll sections"] button, [aria-label^="Approval sections"] button',
            ),
          ].filter((button) => button.scrollWidth > button.clientWidth + 1).length,
          unscrollableSectionRows: [
            ...document.querySelectorAll(
              '[aria-label="Payroll sections"], [aria-label^="Approval sections"]',
            ),
          ].filter((row) => {
            const canOverflow = row.scrollWidth > row.clientWidth + 1;
            const scrollable = /auto|scroll/.test(getComputedStyle(row).overflowX);
            return canOverflow && !scrollable;
          }).length,
          text: document.querySelector('main')?.innerText ?? document.body.innerText,
        }));
        results.push({ persona, module, caseName, size, ...snapshot });
        fs.writeFileSync(`${dir}/results.json`, JSON.stringify({ results, errors }, null, 2));
        console.log(
          `${persona}/${caseName}/${size}: overflow=${snapshot.overflow} unnamedButtons=${snapshot.unnamedButtons} alerts=${snapshot.alerts.length}`,
        );
      }
      if (persona === 'admin' && caseName === 'approvals-Workload') {
        await page.getByRole('button', { name: 'Configure automation' }).click();
        await page
          .locator('[aria-label^="Approval sections"] button[aria-pressed="true"]')
          .filter({ hasText: 'Approval workflows' })
          .waitFor({ state: 'visible' });
        await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
        await page.getByRole('combobox', { name: 'Approval mode' }).waitFor({ state: 'visible' });
        await page.screenshot({ path: `${dir}/approval-automation-settings.png`, fullPage: true });
        await page.getByRole('combobox', { name: 'Approval mode' }).click();
        await page.getByRole('option', { name: 'Automatic approval', exact: true }).waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        console.log('Workload → Configure automation → Approval mode passed.');
      }
      if (persona === 'admin' && caseName === 'home-orgSection_reporting') {
        for (const [size, width, height] of [
          ['desktop', 1366, 900],
          ['mobile', 390, 844],
        ]) {
          await page.setViewportSize({ width, height });
          const search = page.getByRole('textbox', { name: 'Search reporting lines' });
          await search.fill('Bea');
          const manager = page.getByRole('button', { name: 'View 1 report for Bea Case' });
          await manager.waitFor({ state: 'visible' });
          await manager.click();
          await page.getByText(/Direct reports to Bea Case/).waitFor({ state: 'visible' });
          await search.fill('');
          await page.getByText('Ada Case', { exact: true }).waitFor({ state: 'visible' });
          if (await page.getByRole('button', { name: /View .* reports for Ada Case/ }).count())
            throw new Error(`${size}: a leaf employee was shown as having reports`);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          );
          if (overflow) throw new Error(`${size}: reporting drill-down overflows the viewport`);
          await page.screenshot({
            path: `${dir}/admin-reporting-drill-${size}.png`,
            fullPage: true,
          });
          results.push({
            persona,
            module: 'home',
            caseName: 'reporting-drill',
            size,
            overflow,
            alerts: [],
            unnamedButtons: 0,
            clippedSectionLabels: 0,
            unscrollableSectionRows: 0,
          });
          await page.getByRole('button', { name: 'Back to top level' }).click();
          await page
            .getByRole('button', { name: 'View 1 report for Bea Case' })
            .waitFor({ state: 'visible' });
          console.log(`admin/reporting-drill/${size}: manager → report → back passed`);
        }
      }
    }
  }
  fs.writeFileSync(`${dir}/results.json`, JSON.stringify({ results, errors }, null, 2));
  console.log(
    `Audited ${results.length} screen/viewport combinations; ${errors.length} browser errors. Details: ${dir}/results.json`,
  );
  if (
    errors.length ||
    results.some(
      (r) =>
        /^Loading Smarteam EMS|^Restoring your session/.test(r.text ?? '') ||
        (r.text ?? '').includes("Can't reach Smarteam right now") ||
        r.overflow ||
        r.unnamedButtons ||
        r.clippedSectionLabels ||
        r.unscrollableSectionRows ||
        r.alerts.length,
    )
  )
    process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
