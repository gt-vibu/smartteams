import { Injectable } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { requirePermission, type DomainContext } from '../../common/context/domain-context';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

export class ApproverSearchDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @IsUUID() userId?: string;
}

@Injectable()
export class ApproverSearchService {
  constructor(private readonly database: TenantDatabaseService) {}
  search(context: DomainContext, input: ApproverSearchDto) {
    requirePermission(context, 'approval-policies.write');
    return this.database.run(context, async (tx) => {
      const search = input.search?.trim();
      const rows = await tx.employee.findMany({
        where: {
          organizationId: context.organizationId,
          status: 'ACTIVE',
          ...(context.branchId ? { primaryBranchId: context.branchId } : {}),
          userId: input.userId ?? { not: null },
          user: {
            is: {
              isActive: true,
              memberships: { some: { organizationId: context.organizationId, status: 'ACTIVE' } },
            },
          },
          ...(search
            ? {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { employeeNumber: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        take: 51,
        select: {
          id: true,
          userId: true,
          firstName: true,
          lastName: true,
          employeeNumber: true,
          primaryBranch: { select: { name: true } },
        },
      });
      return {
        items: rows
          .slice(0, 50)
          .map((row) => ({
            userId: row.userId!,
            name: `${row.firstName} ${row.lastName}`,
            employeeNumber: row.employeeNumber,
            branchName: row.primaryBranch?.name ?? null,
          })),
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
      };
    });
  }
}
