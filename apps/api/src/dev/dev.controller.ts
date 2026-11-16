import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AiClient } from '../ai/ai.client.js';
import { DevOnlyGuard } from './dev-only.guard.js';

// Must exceed the Python → LiteLLM timeout (60 s) so Python's typed error wins the race.
const LLM_TIMEOUT_MS = 70_000;

const llmPingSchema = z.object({
  prompt: z.string().min(1).max(4000),
  system: z.string().max(2000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export interface LlmPingResult {
  text: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number | null;
  latency_ms: number;
}

@Controller('dev')
@UseGuards(DevOnlyGuard)
export class DevController {
  constructor(private readonly ai: AiClient) {}

  /** Sends a prompt through api → ai → LiteLLM → OpenAI. Development only. */
  @Post('llm-ping')
  llmPing(@Body() body: unknown, @Req() req: Request) {
    const parsed = llmPingSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      });
    }
    return this.ai.post<LlmPingResult>(
      '/v1/debug/complete',
      parsed.data,
      String(req.id),
    );
  }
}
