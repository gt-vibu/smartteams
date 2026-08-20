import { Injectable } from '@nestjs/common';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
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
