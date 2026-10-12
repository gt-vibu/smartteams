import { Module } from '@nestjs/common';
import { WorkflowDraftsController } from './workflow-drafts.controller';
import { WorkflowDraftsService } from './workflow-drafts.service';

@Module({ controllers: [WorkflowDraftsController], providers: [WorkflowDraftsService] })
export class WorkflowDraftsModule {}
