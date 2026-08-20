import { Module } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { LeaveController } from './leave.controller';

@Module({ controllers: [LeaveController], exports: [LeaveService], providers: [LeaveService] })
export class LeaveModule {}
