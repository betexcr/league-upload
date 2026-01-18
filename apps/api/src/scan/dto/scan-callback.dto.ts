import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ScanCallbackDto {
  @IsString()
  @ApiProperty()
  uploadId!: string;

  @IsIn(['CLEAN', 'BLOCKED'])
  @ApiProperty({ enum: ['CLEAN', 'BLOCKED'] })
  result!: 'CLEAN' | 'BLOCKED';

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  reason?: string;
}