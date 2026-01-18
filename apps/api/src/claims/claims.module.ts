import { Module } from '@nestjs/common';
import { ClaimsController } from './claims.controller';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  controllers: [ClaimsController]
})
export class ClaimsModule {}