import { ApiProperty } from '@nestjs/swagger';

export class PreviewUrlResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty()
  expiresAt!: string;
}