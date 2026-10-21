import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ServiceUnavailableException,
  type INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';

describe('leads HTTP contract', () => {
  let app: INestApplication;
  const lead = '10000000-0000-4000-8000-000000000001';
  const activity = '20000000-0000-4000-8000-000000000003';
  const service = { list: vi.fn(), detail: vi.fn(), add: vi.fn() };
  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [LeadsController],
      providers: [{ provide: LeadsService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it.each([
    null,
    [],
    {},
    { id: activity, note: '  \n ' },
    { id: activity, note: 'x'.repeat(2001) },
    { id: 'wrong', note: 'Called' },
    { id: activity, note: 42 },
    { id: activity, note: 'Called', created_at: '2030-01-01' },
  ])('rejects invalid payload %j', async (body) => {
    const query = request(app.getHttpServer()).post(
      `/leads/${lead}/activities`,
    );
    if (body === null)
      await query
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(400);
    else await query.send(body).expect(400);
    expect(service.add).not.toHaveBeenCalled();
  });
  it('rejects malformed path IDs', async () => {
    await request(app.getHttpServer()).get('/leads/wrong').expect(400);
  });
  it('trims a note and returns the saved record', async () => {
    service.add.mockResolvedValue({
      created: true,
      activity: { id: activity, note: 'Called customer' },
    });
    const response = await request(app.getHttpServer())
      .post(`/leads/${lead}/activities`)
      .send({ id: activity, note: ' Called customer ' })
      .expect(201);
    expect(service.add).toHaveBeenCalledWith(lead, {
      id: activity,
      note: 'Called customer',
    });
    expect(response.body.id).toBe(activity);
  });
  it('returns 200 for an identical retry', async () => {
    service.add.mockResolvedValue({
      created: false,
      activity: { id: activity, note: 'Called' },
    });
    await request(app.getHttpServer())
      .post(`/leads/${lead}/activities`)
      .send({ id: activity, note: 'Called' })
      .expect(200);
  });
  it('returns 404 for a missing lead', async () => {
    service.detail.mockRejectedValue(new NotFoundException('Lead not found.'));
    await request(app.getHttpServer()).get(`/leads/${lead}`).expect(404);
  });
  it('returns a safe unavailable response', async () => {
    service.list.mockRejectedValue(
      new ServiceUnavailableException(
        'Lead storage is unavailable. Try again.',
      ),
    );
    const response = await request(app.getHttpServer())
      .get('/leads')
      .expect(503);
    expect(response.body.message).toBe(
      'Lead storage is unavailable. Try again.',
    );
  });
});
