import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Max, Min } from 'class-validator';

export class ReplaceFileDto {
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
}