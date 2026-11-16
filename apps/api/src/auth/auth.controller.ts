import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator.js';
import type { AuthUser } from './auth.types.js';
import { UsersService } from './users.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }
}
