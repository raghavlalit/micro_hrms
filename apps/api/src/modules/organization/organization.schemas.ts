import {
  schema,
  text,
  timestamp,
  uuid,
  json,
  integer,
  unique,
  check,
  tenantFk,
} from '../../database/schema-helpers';
export const Department = schema(
  'departments',
  { name: text(), code: text(), archived_at: timestamp(true) },
  { uniques: [unique('tenant_id', 'code')] },
);
export const Designation = schema(
  'designations',
  { name: text(), code: text(), archived_at: timestamp(true) },
  { uniques: [unique('tenant_id', 'code')] },
);
export const Location = schema(
  'locations',
  { name: text(), code: text(), address: json(), archived_at: timestamp(true) },
  { uniques: [unique('tenant_id', 'code')] },
);
export const WorkSchedule = schema(
  'work_schedules',
  {
    name: text(),
    location_id: uuid(true),
    working_days: { type: 'smallint', array: true, default: [1, 2, 3, 4, 5] },
    start_time: { type: 'time', default: '09:00:00' },
    end_time: { type: 'time', default: '18:00:00' },
    late_grace_minutes: integer(15),
    half_day_minutes: integer(240),
    full_day_minutes: integer(480),
    archived_at: timestamp(true),
  },
  {
    uniques: [unique('tenant_id', 'name')],
    foreignKeys: [tenantFk('locations', 'location_id')],
    checks: [
      check(
        'working_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[] AND cardinality(working_days) > 0',
      ),
      check(
        'late_grace_minutes >= 0 AND half_day_minutes > 0 AND full_day_minutes >= half_day_minutes',
      ),
    ],
  },
);
