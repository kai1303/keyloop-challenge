import { pathToFileURL } from 'node:url';
import { StaffAuthService, type StaffAccount } from './staff-auth.service.js';
import { isEmail } from 'class-validator';

export function readStaffAccount(env = process.env): StaffAccount {
  const {
    STAFF_NAME: name,
    STAFF_EMAIL: email,
    STAFF_PASSWORD: password,
    STAFF_ROLE: role,
    STAFF_USER_ID: userId,
  } = env;
  if (
    !name?.trim() ||
    !email?.trim() ||
    !isEmail(email.trim()) ||
    !password ||
    password.length < 9 ||
    password.length > 128 ||
    (role !== 'admin' && role !== 'technician')
  )
    throw new Error(
      'Set STAFF_NAME, STAFF_EMAIL, STAFF_PASSWORD (9–128 characters), and STAFF_ROLE (admin or technician) in .env.staff',
    );
  if (userId && !/^[A-Za-z0-9_-]{1,128}$/.test(userId))
    throw new Error('Invalid STAFF_USER_ID');
  return {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
    role,
    ...(userId ? { userId } : {}),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const account = readStaffAccount();
  const service = new StaffAuthService();
  try {
    const result = await service.provision(account);
    console.log(`Provisioned ${result.role} account: ${result.email}`);
  } finally {
    await service.onModuleDestroy();
  }
}
