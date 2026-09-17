import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { MailMessage } from './mail.templates';

export const MAIL_QUEUE = 'mail-delivery';

/**
 * Hands a message to the delivery queue.
 *
 * Nothing waits on an SMTP server: onboarding someone must not take as long as a slow mail relay,
 * or fail because the relay blinked. The queue retries with backoff and keeps what finally failed,
 * so a lost message is visible instead of silently dropped.
 */
@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailMessage>) {}

  async send(message: MailMessage): Promise<void> {
    await this.queue.add('send', message, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }
}
