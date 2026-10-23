import { loadEnvFile } from 'node:process';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mountStaffAuth } from './auth/mount-auth.js';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  try {
    loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  configureApp(app);
  app.enableShutdownHooks();
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173',
    credentials: true,
  });
  mountStaffAuth(app);
  await app.listen(Number(process.env.PORT ?? 3000), '127.0.0.1');
}
await bootstrap();
