import { OptimisticResourceVersions1792886400000 } from './migrations/1792886400000-optimistic-resource-versions.js';
import { DropBookingRequests1792972800000 } from './migrations/1792972800000-drop-booking-requests.js';
import { BookingResourceLocks1792800000002 } from './migrations/1792800000002-booking-resource-locks.js';
import { UnifiedUsers1792800000001 } from './migrations/1792800000001-unified-users.js';
import { PublicSchema1792800000000 } from './migrations/1792800000000-public-schema.js';
import { BookingRequests1792713600001 } from './migrations/1792713600001-booking-requests.js';
import { OptimisticSlots1792713600000 } from './migrations/1792713600000-optimistic-slots.js';
import { AdminBookings1792627200002 } from './migrations/1792627200002-admin-bookings.js';
import { DataSource } from 'typeorm';
import { connectionOptions } from './connection-options.js';
import { HourlySlots1792627200000 } from './migrations/1792627200000-hourly-slots.js';
import { InitialScheduler1792540800000 } from './migrations/1792540800000-initial-scheduler.js';

export default new DataSource({
  ...connectionOptions(),
  migrations: [
    InitialScheduler1792540800000,
    HourlySlots1792627200000,
    AdminBookings1792627200002,
    OptimisticSlots1792713600000,
    BookingRequests1792713600001,
    PublicSchema1792800000000,
    UnifiedUsers1792800000001,
    BookingResourceLocks1792800000002,
    OptimisticResourceVersions1792886400000,
    DropBookingRequests1792972800000,
  ],
  migrationsTableName: 'appointment_scheduler_migrations',
});
