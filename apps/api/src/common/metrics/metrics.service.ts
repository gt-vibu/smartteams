import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * What an operator can ask this process.
 *
 * Every label here is deliberately low-cardinality. Prometheus keeps one time series per distinct
 * label combination, so a raw organisation id would create a series per tenant and grow without
 * bound; nothing below is dimensioned by tenant, employee, or run. Routes are recorded as the
 * registered path template (`/v1/organizations/:organizationId/payroll/runs`), never the resolved
 * URL, for the same reason — and because the template is also what identifies the handler.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  // --- HTTP -----------------------------------------------------------------------------------
  readonly httpRequests = new Counter({
    name: 'smarteam_http_requests_total',
    help: 'HTTP requests by route template, method and status class',
    labelNames: ['method', 'route', 'status'],
    registers: [this.registry],
  });
  readonly httpDuration = new Histogram({
    name: 'smarteam_http_request_duration_seconds',
    help: 'HTTP request duration by route template',
    labelNames: ['method', 'route'],
    // Tuned for an API whose fast paths are a few milliseconds and whose slowest legitimate
    // operation — calculating a payroll run — is measured in seconds.
    buckets: [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [this.registry],
  });

  // --- Database -------------------------------------------------------------------------------
  readonly dbStatements = new Counter({
    name: 'smarteam_db_statements_total',
    help: 'Database statements issued, by operation',
    labelNames: ['operation'],
    registers: [this.registry],
  });
  readonly dbStatementDuration = new Histogram({
    name: 'smarteam_db_statement_duration_seconds',
    help: 'Database statement duration',
    buckets: [0.001, 0.005, 0.025, 0.1, 0.5, 2, 10],
    registers: [this.registry],
  });
  readonly dbPool = new Gauge({
    name: 'smarteam_db_pool_connections',
    help: 'Connection pool occupancy by pool and state',
    labelNames: ['pool', 'state'],
    registers: [this.registry],
  });
  readonly dbPoolExhaustion = new Counter({
    name: 'smarteam_db_pool_exhaustion_total',
    help: 'Times a caller waited for a pooled connection because none was free',
    labelNames: ['pool'],
    registers: [this.registry],
  });

  // --- Business -------------------------------------------------------------------------------
  readonly payrollRuns = new Counter({
    name: 'smarteam_payroll_runs_total',
    help: 'Payroll calculations by outcome',
    labelNames: ['outcome'],
    registers: [this.registry],
  });
  readonly payrollDuration = new Histogram({
    name: 'smarteam_payroll_calculation_duration_seconds',
    help: 'Payroll calculation wall time',
    buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120],
    registers: [this.registry],
  });
  readonly payrollLines = new Histogram({
    name: 'smarteam_payroll_lines_per_run',
    help: 'Employees paid per calculated run',
    buckets: [1, 10, 50, 100, 500, 1000, 5000, 10000, 50000],
    registers: [this.registry],
  });
  readonly approvalDecisions = new Counter({
    name: 'smarteam_approval_decisions_total',
    help: 'Approval decisions by domain and outcome',
    labelNames: ['domain', 'outcome'],
    registers: [this.registry],
  });
  readonly storageOperations = new Counter({
    name: 'smarteam_storage_operations_total',
    help: 'Object storage operations by outcome',
    labelNames: ['operation', 'outcome'],
    registers: [this.registry],
  });
  readonly backgroundJobs = new Counter({
    name: 'smarteam_background_jobs_total',
    help: 'Background job executions by outcome',
    labelNames: ['job', 'outcome'],
    registers: [this.registry],
  });
  readonly authFailures = new Counter({
    name: 'smarteam_auth_failures_total',
    help: 'Authentication failures by reason',
    labelNames: ['reason'],
    registers: [this.registry],
  });

  // --- Federation (pre-existing) --------------------------------------------------------------
  readonly federationRateLimitHits = new Counter({
    name: 'smarteam_federation_rate_limit_hits_total',
    help: 'Federation requests rejected by client rate limiting',
    registers: [this.registry],
  });
  readonly webhookDeliveryResults = new Counter({
    name: 'smarteam_webhook_delivery_results_total',
    help: 'Federation webhook delivery results',
    labelNames: ['result'],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  async metrics() {
    return this.registry.metrics();
  }
}
