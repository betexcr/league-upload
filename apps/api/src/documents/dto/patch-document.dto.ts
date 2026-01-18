import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiPropertyOptional()
  title?: string;

  @IsOptional()
  @IsArray()
  @ApiPropertyOptional({ type: [String] })
  categories?: string[];

  @IsOptional()
  @IsArray()
  @ApiPropertyOptional({ type: [String] })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional()
  notes?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional()
  docDate?: string;
}