import { Module } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

export function createInventoryClient() {
  const url = process.env.INVENTORY_SUPABASE_URL;
  const key = process.env.INVENTORY_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const parsed = new URL(url);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(
      'Inventory Supabase URL must be a loopback URL for this demo',
    );
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
@Module({
  controllers: [InventoryController],
  providers: [
    { provide: 'INVENTORY_DB', useFactory: createInventoryClient },
    InventoryService,
  ],
})
export class InventoryModule {}
