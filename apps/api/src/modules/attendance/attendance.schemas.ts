import {
  schema,
  uuid,
  date,
  timestamp,
  text,
  integer,
  state,
  json,
  unique,
  index,
  check,
  tenantFk,
} from '../../database/schema-helpers';
export const Attendance = schema(
  'attendance',
  {
    employee_id: uuid(),
    work_date: date(),
    check_in: timestamp(true),
    check_out: timestamp(true),
    worked_minutes: integer(),
    status: state('pending'),
    source: state('web'),
    source_metadata: json(),
  },
  {
    uniques: [unique('tenant_id', 'employee_id', 'work_date')],
    foreignKeys: [tenantFk('employees', 'employee_id')],
    indices: [index('tenant_id', 'work_date', 'status')],
    checks: [
      check('worked_minutes >= 0'),
      check(
        'check_out IS NULL OR (check_in IS NOT NULL AND check_out >= check_in)',
      ),
      check(
        "status IN ('present','absent','half_day','leave','holiday','weekly_off','pending','incomplete')",
      ),
    ],
  },
);
export const AttendanceRegularization = schema(
  'attendance_regularizations',
  {
    employee_id: uuid(),
    work_date: date(),
    requested_check_in: timestamp(true),
    requested_check_out: timestamp(true),
    reason: text(),
    original_values: json(),
    status: state('pending'),
    reviewer_id: uuid(true),
    reviewed_at: timestamp(true),
    review_comment: text(true),
  },
  {
    foreignKeys: [
      tenantFk('employees', 'employee_id'),
      tenantFk('users', 'reviewer_id'),
    ],
    indices: [
      index('tenant_id', 'status', 'work_date'),
      {
        columns: ['tenant_id', 'employee_id', 'work_date'],
        unique: true,
        where: "status = 'pending'",
      },
    ],
    checks: [
      check("status IN ('pending','approved','rejected')"),
      check('length(trim(reason)) > 0'),
      check(
        'requested_check_out IS NULL OR (requested_check_in IS NOT NULL AND requested_check_out >= requested_check_in)',
      ),
    ],
  },
);
