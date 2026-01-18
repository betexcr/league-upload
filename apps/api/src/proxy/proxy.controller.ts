import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('proxy')
@Controller('proxy')
export class ProxyController {
  @Get(':id')
  async proxy(@Param('id') id: string, @Query('token') token: string) {
    throw new HttpException('Watermark proxy not implemented', HttpStatus.NOT_IMPLEMENTED);
  }
}