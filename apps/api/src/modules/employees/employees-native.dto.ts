import { Type } from 'class-transformer';
import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { LIMITS } from '@smarteam/contracts';
import {
  IsAmount,
  IsCalendarDate,
  IsEmailAddress,
  IsNumberBetween,
  IsPersonName,
  IsPhoneNumber,
  IsText,
  IsWholeNumber,
  withRules,
  yearsFromToday,
} from '../../common/validation/field-rules';
import {
  CompensationDto,
  EmergencyContactDto,
  EmployeeBankAccountDto,
  EmployeePersonalProfileDto,
  EmployeeReferenceDto,
  EmploymentRecordDto,
} from './employees.dto';

/**
 * The website's own versions of the employee inputs federation shares.
 *
 * Each extends the shared input and adds the field rules the forms apply: lengths, characters,
 * ranges, real phone numbers and email addresses. The shared inputs are unchanged, so a partner's
 * request is accepted exactly as before; only the website's routes use these.
 */

const EARLIEST = '1950-01-01';

export class NativeEmergencyContactDto extends EmergencyContactDto {}
withRules(NativeEmergencyContactDto, {
  name: [IsPersonName('Contact name')],
  relationship: [IsText('Relationship', LIMITS.label, 2)],
  phone: [IsPhoneNumber()],
  email: [IsOptional(), IsEmailAddress()],
  sortOrder: [IsOptional(), IsWholeNumber('Order', 0, 100)],
});

export class NativeEmployeePersonalProfileDto extends EmployeePersonalProfileDto {}
withRules(NativeEmployeePersonalProfileDto, {
  fatherName: [IsOptional(), IsPersonName("Father's name")],
  motherName: [IsOptional(), IsPersonName("Mother's name")],
  spouseName: [IsOptional(), IsPersonName("Spouse's name")],
  presentAddress: [IsOptional(), IsText('Present address', LIMITS.address)],
  permanentAddress: [IsOptional(), IsText('Permanent address', LIMITS.address)],
});

export class NativeEmployeeBankAccountDto extends EmployeeBankAccountDto {}
withRules(NativeEmployeeBankAccountDto, {
  bankName: [IsOptional(), IsText('Bank name', LIMITS.title, 2)],
  accountHolderName: [IsOptional(), IsPersonName('Account holder name')],
  effectiveFrom: [
    IsOptional(),
    IsCalendarDate('Effective date', { earliest: EARLIEST, latest: yearsFromToday(1) }),
  ],
});

export class NativeEmployeeReferenceDto extends EmployeeReferenceDto {}
withRules(NativeEmployeeReferenceDto, {
  name: [IsPersonName('Reference name')],
  relationship: [IsOptional(), IsText('Relationship', LIMITS.label)],
  phone: [IsPhoneNumber()],
  sortOrder: [IsOptional(), IsWholeNumber('Order', 0, 100)],
});

export class NativeEmployeeReferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NativeEmployeeReferenceDto)
  references!: NativeEmployeeReferenceDto[];
}

export class NativeEmploymentRecordDto extends EmploymentRecordDto {}
withRules(NativeEmploymentRecordDto, {
  jobTitle: [IsOptional(), IsText('Job title', LIMITS.label)],
  department: [IsOptional(), IsText('Department', LIMITS.label)],
  effectiveFrom: [
    IsCalendarDate('Effective date', { earliest: EARLIEST, latest: yearsFromToday(1) }),
  ],
  effectiveTo: [
    IsOptional(),
    IsCalendarDate('End date', { earliest: EARLIEST, latest: yearsFromToday(50) }),
  ],
});

export class NativeCompensationDto extends CompensationDto {}
withRules(NativeCompensationDto, {
  baseAmount: [IsAmount('Salary')],
  currencyCode: [IsText('Currency', 3, 3)],
  overtimeMultiplier: [IsNumberBetween('Overtime multiplier', 1, 5)],
  effectiveFrom: [
    IsCalendarDate('Effective date', { earliest: EARLIEST, latest: yearsFromToday(1) }),
  ],
});
