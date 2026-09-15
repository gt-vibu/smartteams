import { Module } from '@nestjs/common';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';

@Module({
  controllers: [TimesheetsController],
  exports: [TimesheetsService],
  providers: [TimesheetsService],
})
export class TimesheetsModule {}
