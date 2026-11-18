import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { isOperator } from './operator.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthUser } from './auth.types.js';
import { UsersService } from './users.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly users: UsersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    return {
      ...(await this.users.getMe(user.id)),
      // lets the web app hide pages that are only for operators; the API still enforces it
      isOperator: isOperator(this.config, user.email),
    };
  }
}
