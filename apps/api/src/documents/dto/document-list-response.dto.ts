import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentRefDto } from './document-ref.dto';

export class DocumentListResponseDto {
  @ApiProperty({ type: [DocumentRefDto] })
  items!: DocumentRefDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}