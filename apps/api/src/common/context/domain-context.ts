import type { AccessMode } from '../../generated/prisma/enums';
import { ConflictError, ForbiddenDomainError } from '../errors/domain-error';

export type DomainActor = {
  type: 'USER' | 'FEDERATION_CLIENT' | 'PLATFORM_OPERATOR' | 'SYSTEM';
  userId?: string;
  clientId?: string;
};

export type DomainContext = {
  organizationId: string;
  accessMode: AccessMode;
  actor: DomainActor;
  correlationId: string;
  requestId: string;
  branchId?: string;
  reason?: string;
  permissions: ReadonlySet<string>;
  scopes?: ReadonlySet<string>;
};

export function requireReason(context: DomainContext, message: string) {
  if (!context.reason?.trim()) {
    throw new ConflictError(message);
  }
}

export function requirePermission(context: DomainContext, permission: string) {
  if (!context.permissions.has(permission) && !context.permissions.has('*')) {
    throw new ForbiddenDomainError(`Missing permission: ${permission}`);
  }
}
