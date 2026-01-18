import { ApiProperty } from '@nestjs/swagger';
import { IsArray } from 'class-validator';

export class AnnotationsDto {
  @IsArray()
  @ApiProperty({ type: [Object] })
  annotations!: any[];
}