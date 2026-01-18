import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @ApiOkResponse({ description: 'Login and return access token' })
  async login(@Body() payload: LoginDto) {
    return this.auth.login(payload.email, payload.password);
  }

  @Post('logout')
  @HttpCode(204)
  logout() {
    return;
  }
}
