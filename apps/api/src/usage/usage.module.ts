import { Module } from '@nestjs/common';
import { OperatorGuard } from '../auth/operator.guard.js';
import { LitellmUsageClient } from './litellm-usage.client.js';
import { UsageController } from './usage.controller.js';
import { UsageService } from './usage.service.js';

@Module({
  controllers: [UsageController],
  providers: [UsageService, LitellmUsageClient, OperatorGuard],
})
export class UsageModule {}
