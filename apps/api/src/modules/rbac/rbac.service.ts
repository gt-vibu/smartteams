import { Injectable } from '@nestjs/common';

export type AuthorizationContext = {
  organizationId: string;
  userId: string;
  permissions: ReadonlySet<string>;
};

@Injectable()
export class RbacService {
  hasPermission(context: AuthorizationContext, permission: string) {
    return context.permissions.has(permission);
  }
}
