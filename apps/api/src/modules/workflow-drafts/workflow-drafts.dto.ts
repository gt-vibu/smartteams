import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export const WORKFLOW_DRAFT_KINDS = [
  'EMPLOYEE_ONBOARDING',
  'PAYROLL_RUN_FORM',
  'PAYROLL_POLICY',
  'PAYROLL_COMPONENT',
  'PAYROLL_SALARY',
] as const;

export class SaveWorkflowDraftDto {
  @IsIn(WORKFLOW_DRAFT_KINDS) kind!: (typeof WORKFLOW_DRAFT_KINDS)[number];
  @IsString() @MaxLength(160) title!: string;
  @IsObject() payload!: Record<string, unknown>;
}

export class ListWorkflowDraftsDto {
  @IsOptional() @IsIn(WORKFLOW_DRAFT_KINDS) kind?: (typeof WORKFLOW_DRAFT_KINDS)[number];
}
