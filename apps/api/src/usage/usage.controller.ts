import { Controller, Get, Inject, Query } from '@nestjs/common';
import { usageQuerySchema, type Usage } from '@copilot/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { UsageService } from './usage.service.js';

/**
 * AI calls with their cost. Needs a valid token (global AuthGuard).
 * Known limit: calls carry no user or project yet, so every signed-in user sees the total spend.
 * Fine for one user; scope it per project once calls are tagged (see docs/design/screens.md).
 */
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
