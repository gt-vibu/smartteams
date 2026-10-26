/* global document, window */

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { tenant } from './lib/authz-harness.mjs';
import fs from 'node:fs';
const t = await tenant('browserapprovals');
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(
    t.cookies
      .header()
      .split('; ')
      .map((pair) => {
        const i = pair.indexOf('=');
        return {
          name: pair.slice(0, i),
          value: pair.slice(i + 1),
          url: 'http://localhost:3000',
          sameSite: 'Lax',
        };
      }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(6000);

  fs.mkdirSync('scratch/approval-browser', { recursive: true });
  await page.screenshot({ path: 'scratch/approval-browser/initial.png', fullPage: true });
  await page.getByRole('button', { name: 'Approvals', exact: true }).first().click();
  await page.getByRole('button', { name: 'Approval workflows', exact: true }).click();
  await page.getByRole('button', { name: 'New policy', exact: true }).click();
  await page.getByLabel('Approval mode', { exact: true }).click();
  await page.getByRole('option', { name: 'Conditional automatic approval', exact: true }).click();
  await page.getByLabel('Maximum leave days', { exact: true }).fill('2');
  await page.getByLabel('Minimum advance notice (days)', { exact: true }).fill('3');
  await page.screenshot({
    path: 'scratch/approval-browser/automation-settings-desktop.png',
    fullPage: true,
  });
  console.log('Automation settings render with rule limits and scope controls');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'scratch/approval-browser/automation-settings-mobile.png',
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
    'Mobile page must fit the viewport',
  );
  assert.deepEqual(errors, [], 'Browser must have no runtime errors');
  console.log('Desktop/mobile approval settings smoke checks passed');
} finally {
  await browser.close();
}
