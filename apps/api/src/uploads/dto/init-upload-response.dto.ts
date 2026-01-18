import { ApiProperty } from '@nestjs/swagger';

class UploadPartDto {
  @ApiProperty()
  partNumber!: number;

  @ApiProperty()
  url!: string;
}

export class InitUploadResponseDto {
  @ApiProperty()
  uploadId!: string;

  @ApiProperty({ enum: ['multipart'] })
  engine!: 'multipart';

  @ApiProperty({ type: [UploadPartDto] })
  parts!: UploadPartDto[];

  @ApiProperty()
  objectKey!: string;
}