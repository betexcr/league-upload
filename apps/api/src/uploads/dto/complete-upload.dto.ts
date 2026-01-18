import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class UploadPartDto {
  @IsNumber()
  @Min(1)
  @ApiProperty({ example: 1 })
  partNumber!: number;

  @IsString()
  @ApiProperty()
  etag!: string;
}

export class CompleteUploadDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UploadPartDto)
  @ApiProperty({ type: [UploadPartDto] })
  parts!: UploadPartDto[];

  @IsNumber()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  @ApiProperty({ example: 1024 })
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  sha256?: string;
}