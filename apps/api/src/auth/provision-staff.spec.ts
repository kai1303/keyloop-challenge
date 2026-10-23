import { readStaffAccount } from './provision-staff.js';
const account = {
  STAFF_NAME: ' Admin ',
  STAFF_EMAIL: ' admin@example.test ',
  STAFF_PASSWORD: 'strong-test-password',
  STAFF_ROLE: 'admin',
};
it('requires one of the managed roles and a valid password', () => {
  for (const change of [
    { STAFF_ROLE: 'superadmin' },
    { STAFF_ROLE: 'admin,technician' },
    { STAFF_PASSWORD: '12312312' },
    { STAFF_EMAIL: '' },
    { STAFF_EMAIL: 'invalid' },
  ])
    expect(() => readStaffAccount({ ...account, ...change })).toThrow(
      'Set STAFF_NAME',
    );
});
it('accepts an explicit legacy identity and normalizes email', () => {
  expect(
    readStaffAccount({
      ...account,
      STAFF_EMAIL: ' ADMIN@EXAMPLE.TEST ',
      STAFF_USER_ID: 'legacy-identity',
    }),
  ).toMatchObject({ email: 'admin@example.test', userId: 'legacy-identity' });
  expect(() =>
    readStaffAccount({ ...account, STAFF_USER_ID: 'not an ID' }),
  ).toThrow('Invalid STAFF_USER_ID');
});
it.each(['admin', 'technician'])('accepts a validated %s account', (role) => {
  expect(readStaffAccount({ ...account, STAFF_ROLE: role })).toEqual({
    name: 'Admin',
    email: 'admin@example.test',
    password: account.STAFF_PASSWORD,
    role,
  });
});

it('accepts the nine-character local demo password', () => {
  expect(
    readStaffAccount({ ...account, STAFF_PASSWORD: '123123123' }).password,
  ).toBe('123123123');
});
