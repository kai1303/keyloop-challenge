import { betterAuth } from 'better-auth';
import { admin, jwt } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import type { Pool } from 'pg';

export function createStaffAuth(pool: Pool, env = process.env) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error('Set BETTER_AUTH_SECRET to at least 32 random characters');
  const baseURL = env.BETTER_AUTH_URL ?? 'http://127.0.0.1:3006';
  return betterAuth({
    appName: 'Keyloop',
    baseURL,
    basePath: '/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: pool,
    user: { modelName: 'users' },
    trustedOrigins: [env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173'],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 9,
    },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },
    plugins: [
      admin({
        defaultRole: 'technician',
        roles: { admin: adminAc, technician: userAc },
      }),
      jwt({
        jwt: {
          issuer: baseURL,
          audience: 'keyloop-api',
          expirationTime: '5m',
          definePayload: ({ user, session }) => ({
            role: user.role,
            sid: session.id,
          }),
        },
      }),
    ],
  });
}
