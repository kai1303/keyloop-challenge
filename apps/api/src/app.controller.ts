import { Public } from './auth/staff-auth.guard.js';
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
@Public()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
