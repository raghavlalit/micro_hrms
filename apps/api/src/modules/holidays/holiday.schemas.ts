import {
  schema,
  date,
  text,
  uuid,
  index,
  tenantFk,
} from '../../database/schema-helpers';
export const Holiday = schema(
  'holidays',
  {
    holiday_date: date(),
    name: text(),
    description: text(true),
    location_id: uuid(true),
  },
  {
    foreignKeys: [tenantFk('locations', 'location_id')],
    indices: [
      {
        ...index('tenant_id', 'holiday_date'),
        unique: true,
        where: 'location_id IS NULL',
      },
      {
        ...index('tenant_id', 'location_id', 'holiday_date'),
        unique: true,
        where: 'location_id IS NOT NULL',
      },
    ],
  },
);
