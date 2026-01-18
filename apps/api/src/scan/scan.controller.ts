import { Body, Controller, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ScanCallbackDto } from './dto/scan-callback.dto';
import { ScanService } from './scan.service';

@ApiTags('scan')
@Controller('scan')
export class ScanController {
  constructor(private readonly scan: ScanService) {}

  @Post('callback')
  @ApiOkResponse({ description: 'Scan callback' })
  async callback(@Body() payload: ScanCallbackDto) {
    return this.scan.handleCallback(payload);
  }
}