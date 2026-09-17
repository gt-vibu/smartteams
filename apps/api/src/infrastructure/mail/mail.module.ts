import { Global, Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

/** Outgoing mail, available to every module that needs to tell someone something. */
@Global()
@Module({
  imports: [QueueModule],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
