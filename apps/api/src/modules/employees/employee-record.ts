export interface EmployeeRecord extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  user_id: string | null;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  joining_date: string;
  manager_id: string | null;
  date_of_birth: string | null;
  probation_ends_on: string | null;
  notice_date: string | null;
  termination_date: string | null;
}

// Personal fields are deliberately omitted from directories and manager views.
export const DIRECTORY_FIELDS = [
  'id',
  'employee_code',
  'first_name',
  'last_name',
  'email',
  'joining_date',
  'employment_type',
  'department_id',
  'designation_id',
  'location_id',
  'manager_id',
  'work_schedule_id',
  'status',
] as const;
export const AUDITED_EMPLOYMENT_FIELDS = [
  'department_id',
  'designation_id',
  'location_id',
  'manager_id',
  'work_schedule_id',
  'joining_date',
  'employment_type',
  'probation_ends_on',
  'status',
  'notice_date',
  'termination_date',
];
export function directoryProfile(row: Record<string, unknown>) {
  return Object.fromEntries(
    [
      ...DIRECTORY_FIELDS,
      'department_name',
      'designation_name',
      'location_name',
      'manager_name',
      'work_schedule_name',
    ].map((key) => [key, row[key] ?? null]),
  );
}
