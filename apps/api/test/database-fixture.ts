import { OptimisticResourceVersions1792886400000 } from '../src/database/migrations/1792886400000-optimistic-resource-versions.js';
import { BookingResourceLocks1792800000002 } from '../src/database/migrations/1792800000002-booking-resource-locks.js';
import { StaffAuth1792627200005 } from '../src/database/supabase-migrations/1792627200005-staff-auth.js';
import { UnifiedUsers1792800000001 } from '../src/database/migrations/1792800000001-unified-users.js';
import { PublicSchema1792800000000 } from '../src/database/migrations/1792800000000-public-schema.js';
import { BookingRequests1792713600001 } from '../src/database/migrations/1792713600001-booking-requests.js';
import { OptimisticSlots1792713600000 } from '../src/database/migrations/1792713600000-optimistic-slots.js';
import { AdminBookings1792627200002 } from '../src/database/migrations/1792627200002-admin-bookings.js';
import { DataSource } from 'typeorm';
import { connectionOptions } from '../src/database/connection-options.js';
import { HourlySlots1792627200000 } from '../src/database/migrations/1792627200000-hourly-slots.js';
import { InitialScheduler1792540800000 } from '../src/database/migrations/1792540800000-initial-scheduler.js';

export function testDatabase(): DataSource {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('Set TEST_DATABASE_URL to the disposable local test database');
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.port !== '54329' || url.pathname !== '/scheduler_test') {
    throw new Error('Integration tests require local port 54329 and the scheduler_test database');
  }
  process.env.DEALERSHIP_TIMEZONE ??= 'UTC';
  return new DataSource({
    ...connectionOptions({ DATABASE_URL: value }),
    migrations: [InitialScheduler1792540800000, HourlySlots1792627200000, AdminBookings1792627200002, StaffAuth1792627200005, OptimisticSlots1792713600000, BookingRequests1792713600001, PublicSchema1792800000000, UnifiedUsers1792800000001, BookingResourceLocks1792800000002, OptimisticResourceVersions1792886400000],
    migrationsTableName: 'appointment_scheduler_migrations',
  });
}
