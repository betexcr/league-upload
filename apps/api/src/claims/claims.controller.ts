import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/user.decorator';
import { RequestUser } from '../common/types';
import { DocumentsService } from '../documents/documents.service';

@ApiTags('claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('claims')
export class ClaimsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get(':claimId/documents')
  @ApiOkResponse({ description: 'List documents for claim' })
  async listClaimDocuments(@Param('claimId') claimId: string, @CurrentUser() user: RequestUser) {
    const result = await this.documents.listDocuments({ linkType: 'CLAIM', linkId: claimId }, user);
    return { items: result.items };
  }
}
