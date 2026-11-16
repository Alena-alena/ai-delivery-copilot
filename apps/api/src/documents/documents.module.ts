import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { DocumentExtractionService } from './document-extraction.service.js';
import { DocumentJobs } from './document-jobs.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { PgBossDocumentJobs } from './pg-boss-document-jobs.js';

@Module({
  imports: [ProjectsModule, AiModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentExtractionService,
    { provide: DocumentJobs, useClass: PgBossDocumentJobs },
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
