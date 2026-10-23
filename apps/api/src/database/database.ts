import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { connectionOptions } from './connection-options.js';

@Injectable()
export class Database
  extends DataSource
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super(connectionOptions());
  }
  async onModuleInit(): Promise<void> {
    await this.initialize();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.isInitialized) await this.destroy();
  }
}
