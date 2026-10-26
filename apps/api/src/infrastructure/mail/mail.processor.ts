import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { createTransport, type Transporter } from 'nodemailer';
import { MAIL_QUEUE } from './mail.service';
import type { MailMessage } from './mail.templates';

/**
 * Delivers queued mail over SMTP.
 *
 * With no SMTP_HOST, development writes the message to the log — subject, recipient and the plain
 * text, which carries any link or code — so the whole flow can be exercised on a laptop with no
 * mail server. Anywhere else a missing server fails the job, so the retries and the failed-job
 * record show the problem instead of the app claiming it sent something it did not.
 */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);
  private transporter?: Transporter;

  constructor(private readonly config: ConfigService) {
    super();
  }

  async process(job: Job<MailMessage>): Promise<void> {
    const message = job.data;
    const host = this.config.get<string>('SMTP_HOST');
    if (!host) {
      if (this.config.get<string>('NODE_ENV') === 'development') {
        this.logger.log(
          `Mail not sent (no SMTP_HOST) — to ${message.to}: ${message.subject}\n${message.text}`,
        );
        return;
      }
      throw new Error('SMTP_HOST is not configured; mail cannot be delivered');
    }
    await this.transport(host).sendMail({
      from: this.config.get<string>('MAIL_FROM'),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  private transport(host: string): Transporter {
    const user = this.config.get<string>('SMTP_USER');
    this.transporter ??= createTransport({
      host,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      ...(user ? { auth: { user, pass: this.config.get<string>('SMTP_PASSWORD') ?? '' } } : {}),
    });
    return this.transporter;
  }
}
