import { Role } from '@prisma/client';
import { sign } from 'jsonwebtoken';

export function buildToken(user: { id: string; email: string; role: Role }) {
  const secret = process.env.JWT_PUBLIC_KEY ?? 'test-secret';
  return sign(
    { id: user.id, email: user.email, role: user.role },
    secret,
    { algorithm: secret.includes('BEGIN PUBLIC KEY') ? 'RS256' : 'HS256', expiresIn: '1h' }
  );
}