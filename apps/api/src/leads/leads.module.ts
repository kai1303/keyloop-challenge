import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { LeadsController } from './leads.controller.js';
import { LEADS_DB, LeadsService } from './leads.service.js';

@Module({
  controllers: [LeadsController],
  providers: [
    {
      provide: LEADS_DB,
      useFactory: () => {
        const url =
          process.env.LEADS_SUPABASE_URL ?? process.env.INVENTORY_SUPABASE_URL;
        const key =
          process.env.LEADS_SUPABASE_SERVICE_ROLE_KEY ??
          process.env.INVENTORY_SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) return null;
        const parsed = new URL(url);
        if (
          !['http:', 'https:'].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password ||
          !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
        ) {
          throw new Error('The leads demo requires a loopback Supabase URL.');
        }
        return createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      },
    },
    LeadsService,
  ],
})
export class LeadsModule {}
