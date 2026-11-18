import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisJobs } from './analysis-jobs.js';
import { AnalysisRunner } from './analysis-runner.service.js';
import { AnalysisService } from './analysis.service.js';
import { PgBossAnalysisJobs } from './pg-boss-analysis-jobs.js';

@Module({
  imports: [ProjectsModule, AiModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    AnalysisRunner,
    { provide: AnalysisJobs, useClass: PgBossAnalysisJobs },
  ],
})
export class AnalysisModule {}
