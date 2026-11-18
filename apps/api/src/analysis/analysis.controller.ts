import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  confirmRequirementsSchema,
  updateRequirementSchema,
  type ConfirmRequirementsInput,
  type UpdateRequirementInput,
} from '@copilot/contracts';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe, uuidParam } from '../common/zod-validation.pipe.js';
import { AnalysisService } from './analysis.service.js';

/** Every route needs a valid token (global AuthGuard) and membership of the project's workspace. */
@Controller('projects/:projectId')
export class AnalysisController {
  constructor(
    @Inject(AnalysisService) private readonly analysis: AnalysisService,
  ) {}

  @Get('analysis')
  overview(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
  ) {
    return this.analysis.overview(user.id, projectId);
  }

  @Post('analysis')
  start(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
  ) {
    return this.analysis.start(user.id, projectId);
  }

  @Post('analysis/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
  ) {
    return this.analysis.cancel(user.id, projectId);
  }

  @Get('requirements')
  list(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
  ) {
    return this.analysis.list(user.id, projectId);
  }

  // declared before ':requirementId' so "confirm" is never read as an id
  @Post('requirements/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
    @Body(new ZodValidationPipe(confirmRequirementsSchema))
    body: ConfirmRequirementsInput,
  ) {
    return this.analysis.confirm(user.id, projectId, body);
  }

  @Patch('requirements/:requirementId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
    @Param('requirementId', uuidParam) requirementId: string,
    @Body(new ZodValidationPipe(updateRequirementSchema))
    body: UpdateRequirementInput,
  ) {
    return this.analysis.update(user.id, projectId, requirementId, body);
  }
}
