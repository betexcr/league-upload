import { ApiProperty } from '@nestjs/swagger';

export class CompleteUploadResponseDto {
  @ApiProperty()
  documentId!: string;

  @ApiProperty()
  versionId!: string;

  @ApiProperty({ enum: ['processing', 'complete'] })
  status!: 'processing' | 'complete';
}