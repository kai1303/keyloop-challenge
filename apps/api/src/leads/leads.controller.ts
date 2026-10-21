import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { LeadsService } from './leads.service.js';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller('leads')
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}

  @Get()
  list() {
    return this.leads.list();
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.leads.detail(id);
  }

  @Post(':id/activities')
  async add(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() raw: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('Enter an activity reference and note.');
    }
    const body = raw as Record<string, unknown>;
    if (
      Object.keys(body).some((key) => !['id', 'note'].includes(key)) ||
      typeof body.id !== 'string' ||
      !uuid.test(body.id) ||
      typeof body.note !== 'string' ||
      !body.note.trim() ||
      body.note.trim().length > 2000
    ) {
      throw new BadRequestException(
        'Enter a valid activity reference and a note of 1–2,000 characters.',
      );
    }
    const result = await this.leads.add(id, {
      id: body.id,
      note: body.note.trim(),
    });
    response.status(result.created ? 201 : 200);
    return result.activity;
  }
}
