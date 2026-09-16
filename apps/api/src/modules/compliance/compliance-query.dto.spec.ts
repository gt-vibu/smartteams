import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ComplianceQueryDto } from './compliance.dto';

/**
 * The compliance record list accepts the employee filter the integration guide documents.
 *
 * Both controllers read `employeeId` from the query, but the DTO did not declare it, and the
 * global pipe (`whitelist` + `forbidNonWhitelisted`, see `main.ts`) refuses undeclared properties.
 * Every filtered request — native or federated — was answered 400.
 */
const PIPE = { whitelist: true, forbidNonWhitelisted: true };

async function errorsFor(query: Record<string, unknown>) {
  return validate(plainToInstance(ComplianceQueryDto, query), PIPE);
}

describe('ComplianceQueryDto', () => {
  it('accepts a native employee id', async () => {
    expect(await errorsFor({ employeeId: '55555555-5555-4555-8555-555555555555' })).toEqual([]);
  });

  it("accepts a partner's external employee id", async () => {
    expect(await errorsFor({ employeeId: 'BLZ-EMP-000123', schemeCode: 'PF' })).toEqual([]);
  });

  it('still refuses a property nobody declared', async () => {
    const errors = await errorsFor({ employeeId: 'x', organizationId: 'other' });
    expect(errors.map((error) => error.property)).toEqual(['organizationId']);
  });
});
