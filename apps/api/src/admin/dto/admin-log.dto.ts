import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminLogDto {
  @IsString()
  @IsIn(['error', 'warn', 'info'])
  level!: 'error' | 'warn' | 'info';

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
