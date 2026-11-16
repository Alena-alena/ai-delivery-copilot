import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { getRequestId } from '../common/request-id.js';
import { AiClient } from '../ai/ai.client.js';

@Controller('system')
export class SystemController {
  constructor(private readonly ai: AiClient) {}

  /** Checks the whole chain web → api → ai, including the internal token. */
  @Get('ai-health')
  async aiHealth(@Req() req: Request) {
    const ai = await this.ai.get<{ status: string }>(
      '/v1/ping',
      getRequestId(req),
    );
    return { status: 'ok', ai };
  }
}
