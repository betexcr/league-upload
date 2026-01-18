import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import { EntityLinkDto } from '../../common/dto/entity-link.dto';

export class CreateUploadDto {
  @IsString()
  @ApiProperty()
  fileName!: string;

  @IsNumber()
  @Min(1)
  @Max(1024 * 1024 * 1024)
  @ApiProperty({ example: 1024 })
  sizeBytes!: number;

  @IsString()
  @ApiProperty()
  mimeType!: string;

  @IsArray()
  @ApiProperty({ type: [String] })
  categories!: string[];

  @IsArray()
  @ApiProperty({ type: [String] })
  tags!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional()
  notes?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional()
  docDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EntityLinkDto)
  @ApiProperty({ type: [EntityLinkDto] })
  entityLinks!: EntityLinkDto[];
}