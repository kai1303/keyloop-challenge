import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  parseInventoryQuery,
  decodeInventoryCursor,
  encodeInventoryCursor,
} from './inventory-query.js';
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
  private async read(
    query: PromiseLike<{ data: unknown; error: unknown }>,
    message: string,
  ): Promise<unknown> {
    try {
      const result = await query;
      if (result.error) throw new Error();
      return result.data;
    } catch {
      throw new ServiceUnavailableException(message);
    }
  }
  async list(input: Record<string, unknown> = {}) {
    const query = parseInventoryQuery(input);
    const after = decodeInventoryCursor(query);
    const now = new Date();
    const today = dealerDate(now);
    const data = await this.read(
      this.db().rpc('inventory_page', {
        p_make: query.make,
        p_model: query.model,
        p_age: query.age,
        p_action: query.action,
        p_sort: query.sort,
        p_after: after,
        p_limit: query.limit,
        p_today: today,
      }),
      'Unable to load inventory',
    );
    if (!Array.isArray(data))
      throw new ServiceUnavailableException('Unable to load inventory');
    const rows = data as { vehicle: VehicleRow; cursor_values: unknown[] }[];
    const page = rows.slice(0, query.limit);
    return {
      vehicles: page.map((row) => vehicleView(row.vehicle, today)),
      nextCursor:
        rows.length > query.limit
          ? encodeInventoryCursor(query, page.at(-1)!.cursor_values)
          : null,
      pageSize: query.limit,
      dealershipDate: today,
      timeZone: TIME_ZONE,
      serverTime: now.toISOString(),
    };
  }
  async metadata() {
    const data = await this.read(
      this.db().rpc('inventory_metadata'),
      'Unable to load inventory summary',
    );
    if (!data)
      throw new ServiceUnavailableException('Unable to load inventory summary');
    return data as unknown;
  }
  async find(id: string) {
    validateId(id);
    const data = await this.read(
      this.db().from('vehicles').select('*').eq('id', id).maybeSingle(),
      'Unable to load vehicle',
    );
    if (!data) throw new NotFoundException('Vehicle is no longer in inventory');
    return vehicleView(data as VehicleRow, dealerDate());
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
