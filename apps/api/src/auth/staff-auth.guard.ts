import {
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  StaffAuthService,
  type StaffRole,
  type StaffUser,
} from './staff-auth.service.js';

export const Public = () => SetMetadata('staff:public', true);
export const Roles = (...roles: StaffRole[]) =>
  SetMetadata('staff:roles', roles);
export type StaffRequest = Request & { staff: StaffUser };

@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(StaffAuthService) private readonly auth: StaffAuthService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('staff:public', targets))
      return true;
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const supplied = request.headers.authorization;
    if (typeof supplied !== 'string' || !/^Bearer [^\s]+$/i.test(supplied))
      throw new UnauthorizedException('Sign in with a JWT access token');
    request.staff = await this.auth.authenticate(supplied.slice(7));
    const roles = this.reflector.getAllAndOverride<StaffRole[]>(
      'staff:roles',
      targets,
    ) ?? ['admin'];
    if (!roles.includes(request.staff.role))
      throw new ForbiddenException('Your role cannot access this feature');
    return true;
  }
}
