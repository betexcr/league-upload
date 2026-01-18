import { ApiProperty } from '@nestjs/swagger';

class AclDto {
  @ApiProperty()
  canView!: boolean;

  @ApiProperty()
  canEdit!: boolean;

  @ApiProperty()
  canDelete!: boolean;
}

class EntityLinkDto {
  @ApiProperty({ enum: ['CLAIM', 'PROFILE', 'DEPENDENT', 'PLAN_YEAR'] })
  type!: 'CLAIM' | 'PROFILE' | 'DEPENDENT' | 'PLAN_YEAR';

  @ApiProperty()
  id!: string;
}

export class DocumentRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  latestVersionId!: string | null;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ enum: ['ACTIVE', 'SIGNED'] })
  status!: 'ACTIVE' | 'SIGNED';

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: [String] })
  categories!: string[];

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ required: false })
  notes?: string;

  @ApiProperty({ required: false })
  docDate?: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ required: false, nullable: true })
  deletedAt?: string | null;

  @ApiProperty({ type: [EntityLinkDto] })
  entityLinks!: EntityLinkDto[];

  @ApiProperty({ required: false })
  annotations?: any;

  @ApiProperty({ type: AclDto })
  acl!: AclDto;

  @ApiProperty({ enum: ['PROCESSING', 'CLEAN', 'BLOCKED'] })
  versionStatus!: 'PROCESSING' | 'CLEAN' | 'BLOCKED';

  @ApiProperty({ required: false })
  previewUrl?: string;
}
