import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { isEmail } from 'class-validator';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { connectionOptions } from '../database/connection-options.js';
import { createStaffAuth } from './auth.config.js';

export type StaffRole = 'admin' | 'technician';
export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}
export interface StaffAccount {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
  userId?: string;
}

@Injectable()
export class StaffAuthService implements OnModuleDestroy {
  private pool?: Pool;
  private auth?: ReturnType<typeof createStaffAuth>;

  instance() {
    if (this.auth) return this.auth;
    if (!process.env.BETTER_AUTH_SECRET)
      throw new ServiceUnavailableException(
        'Staff authentication is not configured',
      );
    const options = connectionOptions();
    if (options.type !== 'postgres')
      throw new Error('Staff authentication requires PostgreSQL');
    this.pool = new Pool({
      connectionString: options.url,
      ssl:
        typeof options.ssl === 'object'
          ? {
              rejectUnauthorized: options.ssl.rejectUnauthorized,
              ca: options.ssl.ca,
            }
          : options.ssl,
      max: 5,
      options: '-c search_path=public',
    });
    this.auth = createStaffAuth(this.pool);
    return this.auth;
  }

  // Trusted provisioning only; never expose this method through a public route.
  async provision(account: StaffAccount): Promise<StaffUser> {
    const email = account.email.trim().toLowerCase();
    if (
      !isEmail(email) ||
      !account.name.trim() ||
      account.password.length < 9 ||
      account.password.length > 128 ||
      !['admin', 'technician'].includes(account.role)
    )
      throw new Error('Invalid staff account');
    const context = await this.instance().$context;
    const password = await context.password.hash(account.password);
    const client = await this.pool!.connect();
    try {
      await client.query('BEGIN');
      if (!account.userId)
        await client.query(
          'INSERT INTO public.users (name,email) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING',
          [account.name.trim(), email],
        );
      const {
        rows: [user],
      } = await client.query<{ id: string; email: string | null }>(
        'SELECT id,email FROM public.users WHERE ' +
          (account.userId ? 'id=$1' : 'email=$1') +
          ' FOR UPDATE',
        [account.userId ?? email],
      );
      if (!user) throw new Error('Staff user ID not found');
      if (user.email && user.email !== email)
        throw new Error('Staff user ID belongs to another email');
      const existing = await client.query(
        'SELECT 1 FROM public.account WHERE "userId"=$1',
        [user.id],
      );
      if (existing.rowCount)
        throw new Error(
          'User already has a login; use the authenticated account management flow',
        );
      const {
        rows: [result],
      } = await client.query<StaffUser>(
        'UPDATE public.users SET name=$2,email=$3,role=$4,"updatedAt"=now() WHERE id=$1 RETURNING id,name,email,role',
        [user.id, account.name.trim(), email, account.role],
      );
      await client.query(
        'INSERT INTO public.account (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,now())',
        [randomUUID(), user.id, password],
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(token: string): Promise<StaffUser> {
    const auth = this.instance();
    try {
      const keys = await auth.api.getJwks();
      const { payload } = await jwtVerify(token, createLocalJWKSet(keys), {
        algorithms: ['EdDSA'],
        issuer: auth.options.baseURL as string,
        audience: 'keyloop-api',
        requiredClaims: ['sub', 'sid', 'exp', 'iat'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
        throw new UnauthorizedException();
      const { rows } = await this.pool!.query<StaffUser>(
        'SELECT u.id, u.name, u.email, u.role FROM public.users u JOIN public."session" s ON s."userId"=u.id ' +
          'WHERE u.id=$1 AND s.id=$2 AND s."expiresAt">now() AND COALESCE(u.banned,false)=false',
        [payload.sub, payload.sid],
      );
      const user = rows[0];
      if (!user || !['admin', 'technician'].includes(user.role))
        throw new UnauthorizedException();
      return user;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        (error &&
          typeof error === 'object' &&
          'code' in error &&
          String(error.code).startsWith('ERR_J'))
      ) {
        throw new UnauthorizedException(
          'Sign in again with a valid access token',
        );
      }
      throw new ServiceUnavailableException('Unable to verify staff access');
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
