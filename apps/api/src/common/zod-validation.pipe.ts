import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { z, type ZodType } from 'zod';

/** Validates (and parses) a body, query or param with a Zod schema, e.g. one from @copilot/contracts. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: result.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; '),
    });
  }
}

/** For `:id` route parameters: a malformed id is a 400 before any query runs. */
export const uuidParam = new ZodValidationPipe(z.uuid());
