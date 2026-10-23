import { Controller, Get, Module, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { StaffAuthService } from './staff-auth.service.js';
import {
  Roles,
  StaffAuthGuard,
  type StaffRequest,
} from './staff-auth.guard.js';

@Controller('staff')
@Roles('admin', 'technician')
class StaffController {
  @Get('me')
  me(@Req() request: StaffRequest) {
    return request.staff;
  }
}
@Module({
  controllers: [StaffController],
  providers: [
    StaffAuthService,
    { provide: APP_GUARD, useClass: StaffAuthGuard },
  ],
  exports: [StaffAuthService],
})
export class StaffAuthModule {}
