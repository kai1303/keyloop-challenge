import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dealerDate,
  TIME_ZONE,
  validateAction,
  validateId,
  vehicleView,
  type VehicleRow,
} from './inventory-model.js';

@Injectable()
export class InventoryService {
  constructor(
    @Inject('INVENTORY_DB') private readonly database: SupabaseClient | null,
  ) {}
  private db(): SupabaseClient {
    if (!this.database)
      throw new ServiceUnavailableException(
        'Inventory database is not configured',
      );
    return this.database;
  }
  async list() {
    try {
      // shortcut: the fictional inventory fits within 1,000 rows, add pagination before expanding that limit.
      const { data, error } = await this.db()
        .from('vehicles')
        .select('*')
        .order('stocked_on');
      if (error || !data)
        throw new ServiceUnavailableException('Unable to load inventory');
      const now = new Date();
      const today = dealerDate(now);
      return {
        vehicles: (data as VehicleRow[]).map((row) => vehicleView(row, today)),
        dealershipDate: today,
        timeZone: TIME_ZONE,
        serverTime: now.toISOString(),
      };
    } catch (failure) {
      if (failure instanceof ServiceUnavailableException) throw failure;
      throw new ServiceUnavailableException('Unable to load inventory');
    }
  }
  async save(id: string, value: unknown) {
    validateId(id);
    const body = validateAction(value);
    const db = this.db();
    let result;
    try {
      result = await db
        .rpc('save_inventory_action', {
          p_id: id,
          p_action: body.action,
          p_note: body.note,
          p_expected_version: body.expectedVersion,
        })
        .single();
    } catch {
      throw new ServiceUnavailableException(
        'Unable to save action. Please retry.',
      );
    }
    if (result.error) {
      if (result.error.code === 'P0002')
        throw new NotFoundException('Vehicle is no longer in inventory');
      if (result.error.code === '40001')
        throw new ConflictException(
          'Another manager changed this action. Review the latest vehicle before retrying.',
        );
      if (result.error.code === '22023')
        throw new BadRequestException(
          'Actions require a valid action and a vehicle stocked for more than 90 days',
        );
      throw new ServiceUnavailableException(
        'Unable to save action. Please retry.',
      );
    }
    if (!result.data)
      throw new ServiceUnavailableException(
        'Unable to confirm the saved action',
      );
    return vehicleView(result.data as VehicleRow, dealerDate());
  }
}
