import { ConflictException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Database } from '../src/database/database.js';
import { BookingsService } from '../src/bookings/bookings.service.js';
import { ScheduleRules } from '../src/bookings/schedule-rules.js';
import { configureApp } from '../src/configure-app.js';

const serviceId = '00000000-0000-4000-8000-000000000001';
const payload = {
  name: ' Guest ',
  email: ' Guest@Example.com ',
  phoneNumber: '+84901234567',
  registrationNumber: ' AB-123 ',
  serviceTypeId: serviceId,
  startsAt: '2030-01-02T10:00:00Z',
  technicianId: 'staff-technician-abc',
  serviceBayId: '00000000-0000-4000-8000-000000000021',
};

describe('guest booking HTTP contracts', () => {
  let app: INestApplication;
  const service = {
    listServices: vi.fn(),
    calendarBookings: vi.fn(),
    availability: vi.fn(),
    availabilitySlots: vi.fn(),
    create: vi.fn(),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Database)
      .useValue({})
      .overrideProvider(ScheduleRules)
      .useValue({
        schedule: {
          timeZone: 'UTC',
          hours: Array.from({ length: 7 }, () => ({
            open: '09:00',
            close: '17:00',
          })),
        },
      })
      .overrideProvider(BookingsService)
      .useValue(service)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    configureApp(app);
    await app.init();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    service.listServices.mockResolvedValue([
      { id: serviceId, name: 'Oil change', durationMinutes: 60 },
    ]);
    service.calendarBookings.mockResolvedValue({ month: "2030-01", bookings: [
      {
        startsAt: '2030-01-02T10:00:00.000Z',
        endsAt: '2030-01-02T11:00:00.000Z',
        serviceName: 'Oil change',
      },
    ] });
    service.availabilitySlots.mockResolvedValue({
      date: '2030-01-02',
      serviceTypeId: serviceId,
      slots: [],
    });
    service.availability.mockResolvedValue({ available: true, serviceTypeId: serviceId,
      date: '2030-01-02', startsAt: payload.startsAt, endsAt: '2030-01-02T11:00:00Z',
      technicians: [{ id: payload.technicianId, name: 'Technician A' }],
      bays: [{ id: payload.serviceBayId, name: 'Bay A' }],
    });
    service.create.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000099',
      registrationNumber: 'AB-123',
      status: 'CONFIRMED',
      startsAt: '2030-01-02T10:00:00.000Z',
      endsAt: '2030-01-02T11:00:00.000Z',
      service: { id: serviceId, name: 'Oil change', durationMinutes: 60 },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('exposes only the public dealership schedule', async () => {
    const response = await request(app.getHttpServer())
      .get('/schedule')
      .expect(200);
    expect(response.body).toEqual({
      timeZone: 'UTC',
      hours: Array.from({ length: 7 }, () => ({
        open: '09:00',
        close: '17:00',
      })),
    });
  });

  it('lists services', async () => {
    const response = await request(app.getHttpServer())
      .get('/service-types')
      .expect(200);
    expect(response.body[0]).toMatchObject({
      id: serviceId,
      durationMinutes: 60,
    });
  });

  it('lists anonymous appointment times for one calendar month', async () => {
    const response = await request(app.getHttpServer())
      .get('/bookings')
      .query({ month: '2030-01' })
      .expect(200);
    expect(response.body).toEqual({ month: "2030-01", bookings: [
      {
        startsAt: '2030-01-02T10:00:00.000Z',
        endsAt: '2030-01-02T11:00:00.000Z',
        serviceName: 'Oil change',
      },
    ] });
    expect(service.calendarBookings).toHaveBeenCalledWith('2030-01');
  });

  it.each([
    {},
    { month: '2030-13' },
    { month: '2030-1' },
    { month: '0000-01' },
    { month: '2030-01-01' },
    { month: ['2030-01', '2030-02'] },
    { month: '2030-01', email: 'private@example.com' },
  ])('rejects invalid or extra calendar query fields: %j', async (query) => {
    await request(app.getHttpServer())
      .get('/bookings')
      .query(query)
      .expect(400);
    expect(service.calendarBookings).not.toHaveBeenCalled();
  });

  it('creates a guest booking without exposing customer details', async () => {
    const response = await request(app.getHttpServer())
      .post('/bookings')
      .send(payload)
      .expect(201);
    expect(response.headers.location).toBe('/admin/bookings/' + response.body.id);
    expect(response.body.status).toBe('CONFIRMED');
    expect(response.body).not.toHaveProperty('email');
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Guest',
        email: 'guest@example.com',
        registrationNumber: 'AB-123',
      }),
      { technicianId: payload.technicianId, bayId: payload.serviceBayId },
    );
  });

  it.each([
    { ...payload, email: 'invalid' },
    { ...payload, name: ' ' },
    { ...payload, phoneNumber: 'letters' },
    { ...payload, registrationNumber: '' },
    { ...payload, technicianId: undefined },
    { ...payload, serviceBayId: undefined },
    { ...payload, technicianId: null },
    { ...payload, technicianId: 'auto' },
    { ...payload, technicianId: '' },
    { ...payload, serviceBayId: 'auto' },
    { ...payload, userId: serviceId },
  ])('requires valid selections and rejects customer identity assignments', async (invalid) => {
    await request(app.getHttpServer())
      .post('/bookings')
      .send(invalid)
      .expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('returns a day availability snapshot without resource identifiers', async () => {
    const response = await request(app.getHttpServer())
      .get('/availability/slots')
      .query({ serviceTypeId: serviceId, date: '2030-01-02' })
      .expect(200);
    expect(response.body).toEqual({
      date: '2030-01-02',
      serviceTypeId: serviceId,
      slots: [],
    });
    expect(service.availabilitySlots).toHaveBeenCalledWith({
      serviceTypeId: serviceId,
      date: '2030-01-02',
    });
  });

  it.each([
    {},
    { serviceTypeId: 'invalid', date: '2030-01-02' },
    { serviceTypeId: serviceId, date: '2030-02-30' },
    { serviceTypeId: serviceId, date: '2030-01-02T10:00:00Z' },
    { serviceTypeId: serviceId, date: '2030-01-02', technicianId: serviceId },
  ])('rejects invalid day availability queries: %j', async (query) => {
    await request(app.getHttpServer())
      .get('/availability/slots')
      .query(query)
      .expect(400);
    expect(service.availabilitySlots).not.toHaveBeenCalled();
  });

  it('returns named free resources for a selected time without customer data', async () => {
    const result = await request(app.getHttpServer()).get('/availability')
      .query({ serviceTypeId: serviceId, startsAt: payload.startsAt }).expect(200);
    expect(result.body).toMatchObject({ available: true,
      technicians: [{ id: payload.technicianId, name: 'Technician A' }],
      bays: [{ id: payload.serviceBayId, name: 'Bay A' }],
    });
    expect(service.availability).toHaveBeenCalledWith({ serviceTypeId: serviceId, startsAt: payload.startsAt });
    expect(result.body).not.toHaveProperty('email');
  });

  it('validates availability input', async () => {
    await request(app.getHttpServer())
      .get('/availability')
      .query({ serviceTypeId: 'bad', startsAt: payload.startsAt })
      .expect(400);
    expect(service.availability).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .get('/availability')
      .query({ serviceTypeId: serviceId, startsAt: payload.startsAt })
      .expect(200);
  });

  it('returns a booking conflict without existing customer data', async () => {
    service.create.mockRejectedValueOnce(
      new ConflictException('No resources available'),
    );
    const response = await request(app.getHttpServer())
      .post('/bookings')
      .send(payload)
      .expect(409);
    expect(response.body).not.toHaveProperty('email');
  });

  it('does not expose customer or booking-history searches', async () => {
    await request(app.getHttpServer()).get('/users').expect(404);
    await request(app.getHttpServer())
      .get('/bookings')
      .query({ email: payload.email })
      .expect(400);
  });
});
