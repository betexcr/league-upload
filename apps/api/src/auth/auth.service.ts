import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Role } from '@prisma/client';
import { sign } from 'jsonwebtoken';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const authMode = process.env.AUTH_MODE ?? 'local';
    if (authMode !== 'local') {
      throw new UnauthorizedException('Local login is disabled');
    }
    const allowedUsers = new Set(['user@test.com', 'agent@test.com']);
    if (!allowedUsers.has(email) || password !== '123456') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const mappedRole = email === 'agent@test.com' ? Role.AGENT : Role.MEMBER;
    const user = await this.prisma.user.upsert({
      where: { email },
      update: { role: mappedRole },
      create: { email, role: mappedRole }
    });

    const key = process.env.JWT_SIGNING_KEY ?? process.env.JWT_PUBLIC_KEY ?? '';
    if (!key) {
      throw new UnauthorizedException('Signing key missing');
    }
    if (key.includes('BEGIN PUBLIC KEY') || key.includes('BEGIN RSA PUBLIC KEY')) {
      throw new UnauthorizedException('Signing key not configured for HS256');
    }

    const expiresIn = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
    const token = sign({ id: user.id, email: user.email, role: user.role }, key, {
      algorithm: 'HS256',
      expiresIn
    });

    return {
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    };
  }
}
