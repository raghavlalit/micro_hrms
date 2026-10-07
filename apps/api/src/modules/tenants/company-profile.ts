import { BadRequestException } from '@nestjs/common';
import { CompanyProfileDto } from './company.dto';

export function companyProfile(dto: CompanyProfileDto) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: dto.timezone }).format();
  } catch {
    throw new BadRequestException('Choose a valid IANA timezone');
  }
  if (!Intl.supportedValuesOf('currency').includes(dto.currency))
    throw new BadRequestException('Choose a valid currency code');
  return {
    name: dto.name,
    timezone: dto.timezone,
    currency: dto.currency,
    date_format: dto.date_format,
    contact_email: dto.contact_email.trim().toLowerCase(),
    contact_phone: dto.contact_phone ?? null,
    address: dto.address ? Object.fromEntries(Object.entries(dto.address)) : {},
  };
}

export const companyFields = [
  'id',
  'name',
  'slug',
  'status',
  'timezone',
  'currency',
  'date_format',
  'contact_email',
  'contact_phone',
  'address',
  'plan_code',
  'employee_limit',
  'user_limit',
  'created_at',
] as const;
