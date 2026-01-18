import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class EntityLinkDto {
  @IsIn(['CLAIM', 'PROFILE', 'DEPENDENT', 'PLAN_YEAR'])
  @ApiProperty({ enum: ['CLAIM', 'PROFILE', 'DEPENDENT', 'PLAN_YEAR'] })
  type!: 'CLAIM' | 'PROFILE' | 'DEPENDENT' | 'PLAN_YEAR';

  @IsString()
  @ApiProperty()
  id!: string;
}