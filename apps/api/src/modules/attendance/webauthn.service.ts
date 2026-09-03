import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';
import { AuditService } from '../audit/audit.service';
import { WebauthnAssertionService } from './webauthn-assertion.service';
import { WebauthnEnrollmentService } from './webauthn-enrollment.service';

export { parseWebauthnResponse } from './webauthn-shared';

/**
 * The WebAuthn module's entry point.
 *
 * Registration and authentication are two ceremonies that happen to share a credential table.
 * Split accordingly, behind the constructor Nest already resolves.
 */
@Injectable()
export class WebauthnService {
  private readonly assertion: WebauthnAssertionService;
  private readonly enrollment: WebauthnEnrollmentService;

  constructor(database: TenantDatabaseService, audit: AuditService, config: ConfigService) {
    this.assertion = new WebauthnAssertionService(database, audit, config);
    this.enrollment = new WebauthnEnrollmentService(database, audit, config);
  }

  beginEnrollment(...args: Parameters<WebauthnEnrollmentService['beginEnrollment']>) {
    return this.enrollment.beginEnrollment(...args);
  }

  completeEnrollment(...args: Parameters<WebauthnEnrollmentService['completeEnrollment']>) {
    return this.enrollment.completeEnrollment(...args);
  }

  revoke(...args: Parameters<WebauthnEnrollmentService['revoke']>) {
    return this.enrollment.revoke(...args);
  }

  expireChallenges() {
    return this.enrollment.expireChallenges();
  }

  beginAssertion(...args: Parameters<WebauthnAssertionService['beginAssertion']>) {
    return this.assertion.beginAssertion(...args);
  }

  completeAssertion(...args: Parameters<WebauthnAssertionService['completeAssertion']>) {
    return this.assertion.completeAssertion(...args);
  }
}
