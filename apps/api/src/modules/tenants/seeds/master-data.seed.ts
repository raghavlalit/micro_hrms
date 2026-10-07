/**
 * Micro HRMS tenant onboarding master-data template.
 *
 * DATA ONLY: importing this file does not connect to PostgreSQL or write data.
 * It is not registered as a migration, startup hook, or runnable seed command.
 * TenantDefaultsService applies these defaults only during new-company onboarding.
 *
 * Scope: the newly created tenant, supplied by the trusted onboarding workflow.
 * No company, user, password, employee, salary amount, or leave balance is created.
 * Values below are starting defaults; each company can customize its own copy.
 *
 * Onboarding rules:
 * - Use the new company's trusted tenant UUID, never a client-selected tenant.
 * - Create the company and its defaults atomically during onboarding.
 * - Resolve role/location codes to IDs within that tenant in one transaction.
 * - Reuse permission definitions already inserted by TenantSecurity migration.
 * - Insert missing masters by tenant + code (schedule by tenant + name).
 * - Report existing rows, archived rows, and permission differences for review;
 *   never silently overwrite/revive masters or expand an existing role's access.
 * - Preserve employee assignments, historical data, and company configuration.
 */

// Existing global permission catalog. These codes already exist in the database;
// the onboarding seeder references them, never duplicates or changes them.
const existingPermissionCodes = [
  'company.manage',
  'employees.manage',
  'employees.read.self',
  'employees.read.team',
  'attendance.manage',
  'attendance.self',
  'attendance.approve.team',
  'leave.manage',
  'leave.self',
  'leave.approve.team',
  'payroll.manage',
  'payslips.read.self',
  'documents.manage',
  'documents.read.self',
  'reports.read.company',
  'reports.read.team',
  'audit.read',
  'roles.manage',
] as const;

const employeePermissions = [
  'employees.read.self',
  'attendance.self',
  'leave.self',
  'payslips.read.self',
  'documents.read.self',
] as const;

export const MASTER_DATA_SEED = {
  version: '1.0',
  review_status: 'approved_as_onboarding_defaults',
  application_scope: 'new_tenant_onboarding_only',
  target_tenant_id: null,

  review_notes: [
    'Supply target_tenant_id from the newly created company during onboarding. Do not apply this template globally.',
    'Confirm which departments and designations your company actually uses.',
    'Confirm Head Office name and address; the empty address is intentional.',
    'Confirm Monday-Friday, 09:00-18:00, grace period and worked-minute thresholds.',
    'Confirm whether HR should have the same full permissions as Company Admin. This proposal follows the combined Admin/HR requirements.',
    'Manager permissions still require server-side reporting-scope checks; permission codes alone do not restrict rows to a team.',
    'Confirm leave entitlements, paid/unpaid flags, year, carry-forward, applicability and effective dates before adding leave policies.',
    'Confirm location, year and holiday dates before adding holidays.',
    'Salary components below are labels only: no statutory calculations, rates or salary amounts are implied.',
  ],

  existing_global_data: {
    managed_by: 'TenantSecurity1791178103171',
    subscription_plan_codes: ['trial'],
    permission_codes: existingPermissionCodes,
  },

  // The defaults service creates role_permissions; CompanyAdminService then
  // assigns only company_admin to the initial invited administrator.
  roles: [
    {
      code: 'company_admin',
      name: 'Company Admin',
      permission_codes: existingPermissionCodes,
    },
    {
      code: 'hr',
      name: 'HR',
      permission_codes: existingPermissionCodes,
    },
    {
      code: 'manager',
      name: 'Manager',
      permission_codes: [
        ...employeePermissions,
        'employees.read.team',
        'attendance.approve.team',
        'leave.approve.team',
        'reports.read.team',
      ],
    },
    {
      code: 'employee',
      name: 'Employee',
      permission_codes: employeePermissions,
    },
  ],

  departments: [
    { code: 'ADMIN', name: 'Administration' },
    { code: 'HR', name: 'Human Resources' },
    { code: 'FIN', name: 'Finance and Accounts' },
    { code: 'ENG', name: 'Engineering' },
    { code: 'QA', name: 'Quality Assurance' },
    { code: 'IT', name: 'IT Support' },
    { code: 'SALES', name: 'Sales' },
    { code: 'MKT', name: 'Marketing' },
    { code: 'OPS', name: 'Operations' },
    { code: 'CS', name: 'Customer Support' },
  ],

  // Job titles are independent of RBAC roles. A Manager designation does not
  // automatically grant the manager role or approval permissions.
  designations: [
    { code: 'INTERN', name: 'Intern' },
    { code: 'TRAINEE', name: 'Trainee' },
    { code: 'EXEC', name: 'Executive' },
    { code: 'SR_EXEC', name: 'Senior Executive' },
    { code: 'ENGINEER', name: 'Engineer' },
    { code: 'SR_ENGINEER', name: 'Senior Engineer' },
    { code: 'TEAM_LEAD', name: 'Team Lead' },
    { code: 'ASST_MANAGER', name: 'Assistant Manager' },
    { code: 'MANAGER', name: 'Manager' },
    { code: 'SR_MANAGER', name: 'Senior Manager' },
    { code: 'DEPT_HEAD', name: 'Department Head' },
    { code: 'DIRECTOR', name: 'Director' },
  ],

  locations: [{ code: 'HQ', name: 'Head Office', address: {} }],

  work_schedules: [
    {
      name: 'General Office Schedule',
      // Seed reference only: resolve to locations.id in the chosen tenant.
      location_code: 'HQ',
      working_days: [1, 2, 3, 4, 5], // 0 Sunday through 6 Saturday.
      start_time: '09:00:00',
      end_time: '18:00:00',
      late_grace_minutes: 15,
      half_day_minutes: 240,
      full_day_minutes: 480,
    },
  ],

  leave_types: [
    {
      code: 'CL',
      name: 'Casual Leave',
      description:
        'Short personal leave, subject to the approved company policy.',
      is_active: true,
    },
    {
      code: 'SL',
      name: 'Sick Leave',
      description:
        'Health-related leave, subject to the approved company policy.',
      is_active: true,
    },
    {
      code: 'EL',
      name: 'Earned Leave',
      description:
        'Planned leave; credit and accrual rules must be approved separately.',
      is_active: true,
    },
    {
      code: 'LOP',
      name: 'Loss of Pay Leave',
      description:
        'Proposed unpaid leave category; unpaid policy and payroll rules must be configured separately.',
      is_active: true,
    },
  ],

  // Intentionally unpopulated until the company-specific rules are approved.
  // Leave types alone do not credit balances or define paid/unpaid behavior.
  leave_policies: [],
  holidays: [],

  salary_components: [
    { code: 'BASIC', name: 'Basic Salary', kind: 'earning', is_active: true },
    {
      code: 'HRA',
      name: 'House Rent Allowance',
      kind: 'earning',
      is_active: true,
    },
    {
      code: 'SPECIAL_ALLOWANCE',
      name: 'Special Allowance',
      kind: 'earning',
      is_active: true,
    },
    { code: 'BONUS', name: 'Bonus', kind: 'earning', is_active: true },
    {
      code: 'OTHER_EARNING',
      name: 'Other Earnings',
      kind: 'earning',
      is_active: true,
    },
    { code: 'LOP', name: 'Loss of Pay', kind: 'deduction', is_active: true },
    {
      code: 'OTHER_DEDUCTION',
      name: 'Other Deductions',
      kind: 'deduction',
      is_active: true,
    },
  ],

  document_categories: [
    { code: 'IDENTITY', name: 'Identity Document' },
    { code: 'ADDRESS', name: 'Address Proof' },
    { code: 'CONTRACT', name: 'Employment Contract' },
    { code: 'RESUME', name: 'Resume' },
    { code: 'EDUCATION', name: 'Education Certificate' },
    { code: 'EXPERIENCE', name: 'Experience Certificate' },
    { code: 'HR_LETTER', name: 'HR Letter' },
    { code: 'OTHER', name: 'Other Document' },
  ],
} as const;
