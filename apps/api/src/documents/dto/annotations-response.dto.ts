import { ApiProperty } from '@nestjs/swagger';

export class AnnotationsResponseDto {
  @ApiProperty({ type: [Object] })
  annotations!: any[];
}