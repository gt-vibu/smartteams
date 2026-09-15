import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { WebhookService } from './webhook.service';

@Processor('outbox-dispatch')
export class OutboxDispatchProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly webhooks: WebhookService,
    @InjectQueue('outbox-dispatch') private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit() {
    void this.queue
      .upsertJobScheduler(
        'outbox-dispatch-loop',
        { every: 5_000 },
        {
          name: 'dispatch',
          data: {},
          opts: { removeOnComplete: true, removeOnFail: false },
        },
      )
      .catch(() => undefined);
  }

  async process() {
    await this.webhooks.dispatchPending();
  }
}
