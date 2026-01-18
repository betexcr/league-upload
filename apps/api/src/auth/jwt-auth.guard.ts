import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { decode, verify } from 'jsonwebtoken';
import { Request } from 'express';
import { RequestUser } from '../common/types';
import { Role } from '@prisma/client';
import * as jwksClient from 'jwks-rsa';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly authMode = process.env.AUTH_MODE ?? 'local';
  private readonly cognitoEnabled = process.env.AUTH_FEATURE_COGNITO === 'true';
  private readonly jwksUrl = process.env.COGNITO_JWKS_URL;
  private readonly jwks =
    this.jwksUrl && this.jwksUrl.length > 0
      ? jwksClient({
          jwksUri: this.jwksUrl,
          cache: true,
          cacheMaxEntries: 5,
          cacheMaxAge: 10 * 60 * 1000,
          timeout: 3000
        })
      : null;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.header('authorization');
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = auth.slice('bearer '.length).trim();

    try {
      const useCognito = this.authMode === 'cognito' && this.cognitoEnabled && this.jwks;
      if (this.authMode === 'cognito' && !useCognito) {
        throw new UnauthorizedException('Cognito auth is disabled');
      }
      const payload = (useCognito
        ? await this.verifyWithJwks(token)
        : this.verifyWithStaticKey(token)) as RequestUser & { email?: string; role?: Role };
      if (!payload?.id || !payload?.role || !payload?.email) {
        throw new UnauthorizedException('Invalid token');
      }
      (request as any).user = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private verifyWithStaticKey(token: string) {
    const key = process.env.JWT_SIGNING_KEY ?? process.env.JWT_PUBLIC_KEY ?? '';
    const alg = this.detectAlgorithm(key);
    return verify(token, key, { algorithms: [alg] });
  }

  private async verifyWithJwks(token: string) {
    const decoded = decode(token, { complete: true });
    const kid = decoded && typeof decoded === 'object' ? decoded.header?.kid : undefined;
    if (!kid || !this.jwks) {
      throw new UnauthorizedException('Invalid token');
    }
    const signingKey = await this.jwks.getSigningKey(kid);
    const publicKey = signingKey.getPublicKey();
    return verify(token, publicKey, { algorithms: ['RS256'] });
  }

  private detectAlgorithm(key: string): 'RS256' | 'HS256' {
    if (key.includes('BEGIN PUBLIC KEY') || key.includes('BEGIN RSA PUBLIC KEY')) {
      return 'RS256';
    }
    return 'HS256';
  }
}
