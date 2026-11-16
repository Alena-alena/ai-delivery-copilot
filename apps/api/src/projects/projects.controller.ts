import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '@copilot/contracts';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProjectsService } from './projects.service.js';

const idPipe = new ZodValidationPipe(z.uuid());

/** Every route needs a valid token (global AuthGuard); the user always comes from the token. */
@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projects: ProjectsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    return this.projects.create(user.id, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', idPipe) id: string) {
    return this.projects.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ) {
    return this.projects.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', idPipe) id: string) {
    await this.projects.remove(user.id, id);
  }
}
