import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { usageQuerySchema, type Usage } from '@copilot/contracts';
import { OperatorGuard } from '../auth/operator.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsageService } from './usage.service.js';

/**
 * AI calls with their cost. Operators only (USAGE_ADMIN_EMAILS, fail closed): calls carry no user or project yet,
 * so this shows the spend of everyone. Once calls are tagged per project, scope it to the caller's projects instead.
 */
@UseGuards(OperatorGuard)
@Controller('usage')
export class UsageController {
  constructor(@Inject(UsageService) private readonly usage: UsageService) {}

  @Get()
  get(
    @Query(new ZodValidationPipe(usageQuerySchema))
    query: {
      range: 'today' | '7d' | '30d';
    },
  ): Promise<Usage> {
    return this.usage.get(query.range);
  }
}
