import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class HolidayDto {
  @IsString() @MinLength(2) name!: string;
  @IsDateString() holidayDate!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsOptional() @IsBoolean() isOptional?: boolean;
}

/**
 * Only the name and the optional flag can change. The date and branch form the uniqueness key and
 * decide what past leave requests were charged, so moving a holiday is retiring one and adding
 * another.
 */
export class UpdateHolidayDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsBoolean() isOptional?: boolean;
}

export class HolidayDeactivationDto {
  @IsString() @MinLength(2) reason!: string;
}

export class HolidayQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
