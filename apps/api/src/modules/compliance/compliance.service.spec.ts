import { ComplianceRecordStatus } from '../../generated/prisma/enums';
import { assertComplianceTransition } from './compliance.service';

describe('compliance record lifecycle', () => {
  it('allows the forward filing lifecycle and rejection recovery', () => {
    expect(() =>
      assertComplianceTransition(ComplianceRecordStatus.DRAFT, ComplianceRecordStatus.READY),
    ).not.toThrow();
    expect(() =>
      assertComplianceTransition(ComplianceRecordStatus.READY, ComplianceRecordStatus.SUBMITTED),
    ).not.toThrow();
    expect(() =>
      assertComplianceTransition(ComplianceRecordStatus.REJECTED, ComplianceRecordStatus.DRAFT),
    ).not.toThrow();
  });

  it('rejects invalid transitions and edits to accepted records', () => {
    expect(() =>
      assertComplianceTransition(ComplianceRecordStatus.DRAFT, ComplianceRecordStatus.ACCEPTED),
    ).toThrow('cannot transition');
    expect(() =>
      assertComplianceTransition(ComplianceRecordStatus.ACCEPTED, ComplianceRecordStatus.ACCEPTED),
    ).toThrow('immutable');
  });
});
