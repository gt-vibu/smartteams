import * as Generated from '/Users/ellipsonicmac3/Desktop/Blizbooks-all/smarteam/apps/api/src/generated/prisma/client.ts';
const PrismaClient = Generated.PrismaClient;
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://ellipsonicmac3@localhost:5432/smarteam?schema=public',
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ORG = '34dbe468-7711-47bd-9eb6-a7119c478300';
const BRANCH_EXT = '75095066-eb92-45ff-92e6-c5391955ab56';
const EMP_EXT = '54dd5cae-95b1-438e-bf51-f6b0a4b0be77';

try {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${ORG}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.client_id', '', true)`;
    await tx.$executeRaw`SELECT set_config('app.access_mode', 'FEDERATION', true)`;
    await tx.$executeRaw`SELECT set_config('app.platform_bypass', 'false', true)`;

    const employee = await tx.employee.findFirst({
      where: { organizationId: ORG, externalId: EMP_EXT },
    });
    console.log('employee found:', Boolean(employee));
    const branch = await tx.branch.findFirst({
      where: { organizationId: ORG, externalId: BRANCH_EXT },
    });
    console.log('branch found:', Boolean(branch));

    const closed = await tx.employeeBranchAssignment.updateMany({
      where: { organizationId: ORG, employeeId: employee.id, isPrimary: true, endsOn: null },
      data: { endsOn: new Date() },
    });
    console.log('closed existing primaries:', closed.count);

    const assignment = await tx.employeeBranchAssignment.create({
      data: {
        organizationId: ORG,
        employeeId: employee.id,
        branchId: branch.id,
        startsOn: new Date(),
        isPrimary: true,
        sourceAccessMode: 'FEDERATION',
      },
    });
    console.log('assignment created:', assignment.id);

    await tx.employee.update({
      where: { id: employee.id },
      data: { primaryBranchId: branch.id, version: { increment: 1 } },
    });
    console.log('employee primary updated');
  });
  console.log('TRANSACTION OK');
} catch (error) {
  console.log('THREW:', String(error.message).slice(0, 600));
  console.log('CODE:', error.code);
}
await prisma.$disconnect();
await pool.end();
