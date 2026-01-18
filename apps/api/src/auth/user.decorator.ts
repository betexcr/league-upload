import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '../common/types';

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as RequestUser;
});