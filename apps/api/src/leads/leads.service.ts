import { parseLeadsQuery, leadCursor } from './leads-query.js';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export const LEADS_DB = Symbol('LEADS_DB');
const unavailable = () =>
  new ServiceUnavailableException('Lead storage is unavailable. Try again.');

@Injectable()
export class LeadsService {
  constructor(@Inject(LEADS_DB) private readonly db: SupabaseClient | null) {}

  private database(): SupabaseClient {
    if (!this.db)
      throw new ServiceUnavailableException(
        'Lead storage is not configured. Set local Supabase configuration.',
      );
    return this.db;
  }

  private async query<T>(operation: PromiseLike<T>): Promise<T> {
    try {
      return await operation;
    } catch {
      throw unavailable();
    }
  }

  async list(input: Record<string, unknown> = {}) {
    const { limit, after } = parseLeadsQuery(input);
    let query = this.database()
      .from('sales_leads')
      .select('id,customer_name,vehicle_interest,enquiry,source,received_at')
      .order('received_at', { ascending: false })
      .order('id', { ascending: true });
    if (after)
      query = query.or(
        `received_at.lt.${after.received_at},and(received_at.eq.${after.received_at},id.gt.${after.id})`,
      );
    const { data, error } = await this.query(query.limit(limit + 1));
    if (error || !data) throw unavailable();
    const leads = data.slice(0, limit);
    return {
      leads,
      nextCursor:
        data.length > limit ? leadCursor(leads[leads.length - 1]) : null,
    };
  }

  async detail(id: string) {
    const { data, error } = await this.query(
      this.database()
        .from('sales_leads')
        .select('*,activities:sales_lead_activities(*)')
        .eq('id', id)
        .maybeSingle(),
    );
    if (error) throw unavailable();
    if (!data) throw new NotFoundException('Lead not found.');
    const activities = data.activities as { id: string; created_at: string }[];
    activities.sort(
      (a, b) =>
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        a.id.localeCompare(b.id),
    );
    return data;
  }

  async add(leadId: string, body: { id: string; note: string }) {
    const { data, error } = await this.query(
      this.database()
        .from('sales_lead_activities')
        .insert({ id: body.id, lead_id: leadId, note: body.note })
        .select('*')
        .single(),
    );
    if (!error) return { created: true, activity: data };
    if (error.code === '23503') throw new NotFoundException('Lead not found.');
    if (error.code !== '23505') throw unavailable();
    const existing = await this.query(
      this.database()
        .from('sales_lead_activities')
        .select('*')
        .eq('id', body.id)
        .maybeSingle(),
    );
    if (existing.error || !existing.data) throw unavailable();
    if (existing.data.lead_id !== leadId || existing.data.note !== body.note) {
      throw new ConflictException('This activity reference was already used.');
    }
    return { created: false, activity: existing.data };
  }
}
