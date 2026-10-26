import type { DomainContext } from '../../common/context/domain-context';
import type { TenantDatabaseService } from '../../infrastructure/database/tenant-database.service';

/**
 * Shapes an organization and a branch take on the way out, and how a query is scoped.
 *
 * Free functions because four services now return these shapes, and the alternative — one service
 * owning the mapper and the rest calling it — is what made the original file 1035 lines.
 */

export function runScoped(
  database: TenantDatabaseService,
  context: DomainContext,
  callback: Parameters<TenantDatabaseService['run']>[1],
) {
  return context.accessMode === 'PLATFORM'
    ? database.runPlatform(context, callback)
    : database.run(context, callback);
}

export function toDto(value: {
  id: string;
  name: string;
  slug: string;
  source: string;
  externalId: string | null;
  status: string;
  timezone: string;
  currencyCode: string;
  locale: string;
  version: number;
}) {
  return {
    id: value.id,
    name: value.name,
    slug: value.slug,
    source: value.source,
    externalId: value.externalId,
    status: value.status,
    timezone: value.timezone,
    currencyCode: value.currencyCode,
    locale: value.locale,
    version: value.version,
  };
}

export function branchDto(value: {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  source: string;
  externalId: string | null;
  status: string;
  timezone: string | null;
  address: unknown;
}) {
  return {
    id: value.id,
    organizationId: value.organizationId,
    name: value.name,
    code: value.code,
    source: value.source,
    externalId: value.externalId,
    status: value.status,
    timezone: value.timezone,
    address: value.address,
  };
}
