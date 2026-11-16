import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DOCUMENT_MAX_BYTES } from '@copilot/contracts';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { uuidParam } from '../common/zod-validation.pipe.js';
import {
  DocumentsService,
  type UploadedFileData,
} from './documents.service.js';

/** Every route needs a valid token (global AuthGuard) and membership of the project's workspace. */
@Controller('projects/:projectId/documents')
export class DocumentsController {
  constructor(
    @Inject(DocumentsService) private readonly documents: DocumentsService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // Over the limit the interceptor answers 413 (FILE_TOO_LARGE) before the handler runs.
      limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 },
      // Without this, non-ASCII file names (e.g. Cyrillic) arrive garbled.
      defParamCharset: 'utf8',
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
    @UploadedFile() file?: UploadedFileData,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Send the file in a multipart field named "file"',
      });
    }
    return this.documents.upload(user.id, projectId, file);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
  ) {
    return this.documents.list(user.id, projectId);
  }

  @Get(':documentId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
    @Param('documentId', uuidParam) documentId: string,
  ) {
    return this.documents.get(user.id, projectId, documentId);
  }

  @Delete(':documentId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
    @Param('documentId', uuidParam) documentId: string,
  ) {
    await this.documents.remove(user.id, projectId, documentId);
  }

  @Post(':documentId/retry')
  @HttpCode(200)
  retry(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
    @Param('documentId', uuidParam) documentId: string,
  ) {
    return this.documents.retry(user.id, projectId, documentId);
  }

  // nosniff: the browser must treat the bytes as the declared type and never guess (e.g. run HTML).
  @Header('X-Content-Type-Options', 'nosniff')
  @Get(':documentId/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('projectId', uuidParam) projectId: string,
    @Param('documentId', uuidParam) documentId: string,
  ) {
    const file = await this.documents.download(user.id, projectId, documentId);
    return new StreamableFile(file.bytes, {
      type: file.mime,
      length: file.bytes.length,
      disposition: contentDisposition(file.name),
    });
  }
}

/** "attachment" with an ASCII fallback and the real (possibly non-ASCII) name in RFC 5987 form. */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
