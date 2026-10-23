import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { StaffAuthService } from './staff-auth.service.js';

export function mountStaffAuth(app: NestExpressApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .all('/auth/*splat', toNodeHandler(app.get(StaffAuthService).instance()));
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
}
