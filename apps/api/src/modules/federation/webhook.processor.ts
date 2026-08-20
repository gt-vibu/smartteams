import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { WebhookService } from './webhook.service';

@Processor('webhook-delivery')
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly webhooks: WebhookService) {
    super();
  }
  async process(job: Job<{ deliveryId: string }>) {
    await this.webhooks.deliver(job.data.deliveryId);
  }
}
