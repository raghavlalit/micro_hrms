import {
  schema,
  text,
  date,
  timestamp,
  uuid,
  state,
  json,
  unique,
  index,
  check,
  tenantFk,
} from '../../database/schema-helpers';
export const Employee = schema(
  'employees',
  {
    user_id: uuid(true),
    employee_code: text(),
    first_name: text(),
    last_name: text(),
    date_of_birth: date(true),
    email: text(true),
    phone: text(true),
    address: json(),
    emergency_contact: json(),
    joining_date: date(),
    employment_type: text(),
    department_id: uuid(true),
    designation_id: uuid(true),
    location_id: uuid(true),
    manager_id: uuid(true),
    work_schedule_id: uuid(true),
    probation_ends_on: date(true),
    notice_date: date(true),
    termination_date: date(true),
    status: state('invited'),
    archived_at: timestamp(true),
  },
  {
    uniques: [
      unique('tenant_id', 'employee_code'),
      unique('tenant_id', 'user_id'),
    ],
    foreignKeys: [
      tenantFk('users', 'user_id'),
      tenantFk('departments', 'department_id'),
      tenantFk('designations', 'designation_id'),
      tenantFk('locations', 'location_id'),
      tenantFk('employees', 'manager_id'),
      tenantFk('work_schedules', 'work_schedule_id'),
    ],
    indices: [
      {
        name: 'uq_employees_tenant_email',
        columns: ['tenant_id', 'email'],
        unique: true,
        synchronize: false,
      },
      index('tenant_id', 'status'),
      index('tenant_id', 'manager_id'),
      index('tenant_id', 'department_id'),
      index('tenant_id', 'location_id'),
    ],
    checks: [
      check(
        "status IN ('invited','active','on_notice','inactive','terminated')",
      ),
      check('manager_id IS NULL OR manager_id <> id'),
      check('termination_date IS NULL OR termination_date >= joining_date'),
    ],
  },
);
// Ciphertext only; never put raw bank details or statutory identifiers in JSON fields.
export const EmployeePrivateData = schema(
  'employee_private_data',
  {
    employee_id: uuid(),
    bank_details_ciphertext: text(true),
    statutory_identifiers_ciphertext: text(true),
    encryption_key_version: text(),
  },
  {
    uniques: [unique('tenant_id', 'employee_id')],
    foreignKeys: [tenantFk('employees', 'employee_id')],
  },
);
