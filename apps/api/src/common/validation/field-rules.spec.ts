import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEmployeeDto, EmergencyContactDto } from '../../modules/employees/employees.dto';
import {
  NativeCompensationDto,
  NativeEmergencyContactDto,
} from '../../modules/employees/employees-native.dto';
import { NativeLeaveTypeDto } from '../../modules/leave/leave-native.dto';

/** What the API says back for a body, field by field, in the words the website shows. */
async function problems(type: new () => object, body: object) {
  const errors = await validate(plainToInstance(type, body));
  return Object.fromEntries(
    errors.map((error) => [error.property, Object.values(error.constraints ?? {})]),
  );
}

const employee = {
  firstName: 'Arjun',
  lastName: 'Mehta',
  employmentType: 'FULL_TIME',
  aadhaarNumber: '234123412346',
};

describe('field rules', () => {
  it('accepts a well-formed employee', async () => {
    expect(await problems(CreateEmployeeDto, employee)).toEqual({});
  });

  it('refuses digits in a name, and says so in words', async () => {
    const found = await problems(CreateEmployeeDto, { ...employee, firstName: 'Arjun2' });
    expect(found.firstName).toContain('First name cannot contain numbers.');
  });

  it('refuses a name longer than 60 characters', async () => {
    const found = await problems(CreateEmployeeDto, { ...employee, lastName: 'a'.repeat(61) });
    expect(found.lastName).toContain('Last name can be at most 60 characters.');
  });

  it('refuses letters in a phone number rather than dropping them', async () => {
    const found = await problems(CreateEmployeeDto, { ...employee, phone: '98765abc43210' });
    expect(found.phone).toContain('A phone number can contain only digits.');
  });

  it('holds an Indian mobile to 10 digits starting 6 to 9', async () => {
    expect((await problems(CreateEmployeeDto, { ...employee, phone: '98765' })).phone).toContain(
      'Enter a 10-digit mobile number.',
    );
    expect(
      (await problems(CreateEmployeeDto, { ...employee, phone: '+91 1234567890' })).phone,
    ).toContain('An Indian mobile number starts with 6, 7, 8 or 9.');
    expect(await problems(CreateEmployeeDto, { ...employee, phone: '+91 9876543210' })).toEqual({});
  });

  it('refuses an email that is not an address', async () => {
    const found = await problems(CreateEmployeeDto, { ...employee, workEmail: 'arjun@' });
    expect(found.workEmail).toContain('Enter an email address like name@company.com.');
  });

  it('refuses letters in an Aadhaar number, and one failing its check digit', async () => {
    expect(
      (await problems(CreateEmployeeDto, { ...employee, aadhaarNumber: '2341a2341234' }))
        .aadhaarNumber,
    ).toContain('An Aadhaar number can contain only digits.');
    expect(
      (await problems(CreateEmployeeDto, { ...employee, aadhaarNumber: '234123412345' }))
        .aadhaarNumber,
    ).toBeDefined();
  });

  it('refuses a joining date that is not a real date', async () => {
    const found = await problems(CreateEmployeeDto, { ...employee, dateOfJoining: '2026-02-30' });
    expect(found.dateOfJoining).toContain('Joining date is not a real date.');
  });

  it('holds money to a range with two decimal places', async () => {
    const body = {
      payType: 'SALARY',
      payFrequency: 'MONTHLY',
      currencyCode: 'INR',
      overtimeMultiplier: 1.5,
      effectiveFrom: '2026-09-01',
    };
    expect(
      (await problems(NativeCompensationDto, { ...body, baseAmount: -5 })).baseAmount,
    ).toContain('Salary cannot be negative.');
    expect(
      (await problems(NativeCompensationDto, { ...body, baseAmount: 10.123 })).baseAmount,
    ).toContain('Salary can have at most two decimal places.');
    expect(
      (await problems(NativeCompensationDto, { ...body, overtimeMultiplier: 9 }))
        .overtimeMultiplier,
    ).toContain('Overtime multiplier must be between 1 and 5.');
  });

  it("keeps a leave type's days within a year", async () => {
    const found = await problems(NativeLeaveTypeDto, {
      code: 'CL',
      name: 'Casual Leave',
      paid: true,
      accrualType: 'FIXED_ANNUAL',
      annualAllowance: 400,
      requiresAttachment: false,
    });
    expect(found.annualAllowance).toContain('Days a year must be between 0 and 366.');
  });

  it('refuses a required field that is missing, saying what to enter', async () => {
    const withoutName: Partial<typeof employee> = { ...employee };
    delete withoutName.firstName;
    expect((await problems(CreateEmployeeDto, withoutName)).firstName).toContain(
      'Enter a first name.',
    );
  });

  it('skips an optional field that is left out', async () => {
    expect((await problems(CreateEmployeeDto, employee)).middleName).toBeUndefined();
  });

  describe('federation keeps its contract', () => {
    const contact = { name: 'Ravi', relationship: 'Brother', phone: '12345' };

    it("the website's emergency contact needs a real phone number", async () => {
      expect((await problems(NativeEmergencyContactDto, contact)).phone).toBeDefined();
    });

    it('the shared emergency contact accepts what it always has', async () => {
      expect(await problems(EmergencyContactDto, contact)).toEqual({});
    });
  });
});
