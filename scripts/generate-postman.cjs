// Canonical, secret-free Postman definitions. Keep requests beside their module group.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const bindings = [];
const variable = (name) => `{{${name}}}`;
const idSave = (key) => `pm.environment.set('${key}', data.id);`;
const invitationSave =
  "pm.environment.set('activation_token', data.invitation.token); pm.environment.set('activation_expires_at', data.invitation.expires_at);";
function request(
  name,
  method,
  endpoint,
  {
    body,
    dto,
    multipart = false,
    save = "",
    description = "",
    query = [],
  } = {},
) {
  const queued = method === 'POST' && (
    (endpoint.startsWith('/leave/assignments/jobs/') && (endpoint.endsWith('/confirm') || endpoint.endsWith('/retry'))) ||
    endpoint.endsWith('/export-jobs') ||
    (endpoint.startsWith('/report-exports/') && endpoint.endsWith('/retry')) ||
    (endpoint.startsWith('/payroll/runs/') && endpoint.endsWith('/publish'))
  );
  const expected = queued ? 202 :
    method === "POST" && !endpoint.startsWith("/auth/") ? 201 : 200;
  const enabledQuery = query
    .filter((q) => !q.disabled)
    .map((q) => `${q.key}=${q.value}`)
    .join("&");
  const raw =
    "{{base_url}}" + endpoint + (enabledQuery ? "?" + enabledQuery : "");
  const item = {
    name,
    request: {
      method,
      header: [
        { key: "Accept", value: "application/json" },
        ...(body && !multipart
          ? [{ key: "Content-Type", value: "application/json" }]
          : []),
      ],
      url: {
        raw,
        host: ["{{base_url}}"],
        path: endpoint.split("/").filter(Boolean),
        ...(query.length ? { query } : {}),
      },
      description:
        description ||
        "Use a company account with the required permission. Cookie authentication is handled by Postman.",
      ...(body
        ? {
            body: multipart
              ? {
                  mode: "formdata",
                  formdata: [
                    ...Object.entries(body).map(([key, value]) => ({
                      key,
                      value: String(value ?? ""),
                      type: "text",
                    })),
                    { key: "file", type: "file", src: [] },
                  ],
                }
              : {
                  mode: "raw",
                  raw: JSON.stringify(body, null, 2),
                  options: { raw: { language: "json" } },
                },
          }
        : {}),
    },
    event: [
      {
        listen: "test",
        script: {
          type: "text/javascript",
          exec: [
            `pm.test('Expected HTTP ${expected}', function () { pm.response.to.have.status(${expected}); });`,
            ...(save
              ? [
                  `if (pm.response.code === ${expected}) { const data = pm.response.json(); ${save} }`,
                ]
              : []),
          ],
        },
      },
    ],
    response: [],
  };
  bindings.push({ method, endpoint, body, dto });
  return item;
}
const get = (name, endpoint, options) =>
  request(name, "GET", endpoint, options);
const post = (name, endpoint, options) =>
  request(name, "POST", endpoint, options);
const put = (name, endpoint, options) =>
  request(name, "PUT", endpoint, options);
const folder = (name, item, description) => ({ name, item, description });
const pageQuery = [
  { key: "page", value: "1" },
  { key: "limit", value: "20" },
  { key: "search", value: "", disabled: true },
];
const reason = { reason: "Reviewed access for Postman testing" };
const company = {
  name: "{{company_name}}",
  timezone: "Asia/Kolkata",
  currency: "INR",
  date_format: "dd/MM/yyyy",
  contact_email: "{{tenant_email}}",
  contact_phone: "",
  address: { city: "Pune", country: "India" },
};
const employee = {
  employee_code: "{{employee_code}}",
  first_name: "Postman",
  last_name: "Employee",
  email: "{{employee_email}}",
  joining_date: "2026-01-01",
  employment_type: "Full-time",
  date_of_birth: "1995-01-01",
  phone: "",
  department_id: null,
  designation_id: null,
  location_id: null,
  manager_id: null,
  work_schedule_id: null,
  probation_ends_on: null,
  address: { city: "Pune", country: "India" },
  emergency_contact: {
    name: "Sample contact",
    relationship: "Sibling",
    phone: "9000000000",
  },
};
const master = (name, endpoint, key, body, dto, permission) =>
  folder(
    name,
    [
      get("List " + name.toLowerCase(), endpoint),
      post("Create " + name.toLowerCase(), endpoint, {
        body,
        dto,
        save: idSave(key),
      }),
      put("Update " + name.toLowerCase(), endpoint + "/" + variable(key), {
        body,
        dto,
      }),
    ],
    `Tenant permission: ${permission}. The create request saves ${key}. Updates use that ID; list requests never select an existing record for modification automatically.`,
  );

const collection = {
  info: {
    _postman_id: "b907ed20-8287-4c02-95b6-36fb3c922da0",
    name: "Micro HRMS — Completed APIs",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    description:
      "Maintained with each completed topic. Import the environment template and read postman/README.md. Session cookies, not bearer tokens. Select individual requests/folders intentionally: this is an API reference, not an all-at-once runner scenario. Writes modify the selected environment. Only implemented routes are included. Documents use multipart uploads; select a local file before sending.",
  },
  auth: { type: "noauth" },
  event: [
    {
      listen: "prerequest",
      script: {
        type: "text/javascript",
        exec: [
          "if (!['GET', 'HEAD', 'OPTIONS'].includes(pm.request.method)) pm.request.headers.upsert({ key: 'X-HRMS-Request', value: '1' });",
        ],
      },
    },
  ],
  item: [
    folder("00 — API connectivity", [
      get("API root", "", {
        description:
          "Public connectivity check; returns text. This is not a database readiness endpoint.",
      }),
    ]),
    folder(
      "01 — Authentication",
      [
        post("Login — platform administrator", "/auth/login", {
          body: {
            kind: "platform",
            email: "{{platform_email}}",
            password: "{{platform_password}}",
          },
          dto: "auth/auth.dto:LoginDto",
          description:
            "Postman saves the session cookie automatically. Default email is microhrms@yopmail.com; supply your actual password locally. Logging in replaces the current session cookie for this host.",
        }),
        post("Login — company user", "/auth/login", {
          body: {
            kind: "tenant",
            company: "{{company_slug}}",
            email: "{{tenant_email}}",
            password: "{{tenant_password}}",
          },
          dto: "auth/auth.dto:LoginDto",
          save: "pm.environment.set('current_user_id', data.user.id); pm.environment.set('tenant_id', data.user.tenantId);",
          description:
            "Use Company Admin/HR for management requests. Change tenant_email and tenant_password to test another user. Company is the slug, not the tenant UUID.",
        }),
        post("Login — employee", "/auth/login", {
          body: {
            kind: "tenant",
            company: "{{company_slug}}",
            email: "{{employee_email}}",
            password: "{{activation_password}}",
          },
          dto: "auth/auth.dto:LoginDto",
          description:
            "Use after employee activation. This replaces the admin session cookie. Log in as the company admin again before management requests.",
        }),
        get("Current session", "/auth/me", {
          save: "pm.environment.set('current_user_id', data.user.id);",
          description:
            "Returns current account and permissions. It does not overwrite target user_id.",
        }),
        post("Activate latest invitation", "/auth/activate", {
          body: {
            token: "{{activation_token}}",
            password: "{{activation_password}}",
          },
          dto: "auth/auth.dto:ActivateAccountDto",
          save: "pm.environment.unset('activation_token');",
          description:
            "Uses the most recently issued invitation token (company admin, standalone user or employee). Choose the intended account password, minimum 15 characters. Activation does not log in. For a new company admin, use this same password as tenant_password.",
        }),
        post("Change current password", "/auth/password", {
          body: {
            currentPassword: "{{current_password}}",
            newPassword: "{{new_password}}",
          },
          dto: "auth/auth.dto:ChangePasswordDto",
          description:
            "Changes the currently signed-in account password and revokes sessions. Required first for a platform account with a temporary password. Set current_password and new_password locally, then update the matching login password variable.",
        }),
        post('Request company password reset', '/auth/forgot-password', {
          body: { company: '{{company_slug}}', email: '{{tenant_email}}' },
          dto: 'auth/password-recovery.dto:ForgotPasswordDto',
          description: 'Public company-account recovery, CSRF header required. Generic response whether the account exists or not. Requires active company/account and configured SMTP worker. 5 requests per company/email and 30 per IP per 15 minutes. The link is emailed only; never returned here. Use local Mailpit to obtain the test reset_token from the URL fragment after #. New requests replace earlier links. Platform recovery is not exposed.',
        }),
        post('Reset company password', '/auth/reset-password', {
          body: { token: '{{reset_token}}', password: '{{reset_password}}' },
          dto: 'auth/password-recovery.dto:ResetPasswordDto',
          save: "pm.environment.unset('reset_token');",
          description: 'Public, CSRF protected. Paste only the token after # from the latest email into reset_token. Expires after 30 minutes and works once. Use 15–128 characters. Revokes all account sessions without signing in automatically. Update tenant_password locally and sign in again. Never commit/export populated recovery secrets.',
        }),
        post("Logout current session", "/auth/logout", {
          body: {},
          description: "Signs out the active cookie session.",
        }),
        post("Logout all sessions", "/auth/logout-all", {
          body: {},
          description: "Revokes every session for the current account.",
        }),
      ],
      "Company password recovery uses company code and email. Platform recovery and public registration are not exposed. Recovery links are delivered only by the configured SMTP worker.",
    ),
    folder(
      "02 — Platform company onboarding",
      [
        get("Platform access check", "/platform/overview"),
        get("List companies", "/platform/companies", { query: pageQuery }),
        post(
          "Create company and initial administrator",
          "/platform/companies",
          {
            body: {
              ...company,
              slug: "{{company_slug}}",
              admin_name: "Postman Company Admin",
              admin_email: "{{tenant_email}}",
            },
            dto: "tenants/company.dto:CreateCompanyDto",
            save:
              "pm.environment.set('tenant_id', data.company.id); " +
              invitationSave,
            description:
              "Requires platform login. Creates company defaults, an invited company administrator and a linked employee profile in one transaction. Activation also activates that employee. Employee code is generated; joining date defaults to account creation date and employment type to Not specified for HR review. Use a unique company_slug. Saves tenant_id and activation_token. Activate, then log in as the company user.",
          },
        ),
        post(
          "Reissue initial administrator invitation",
          "/platform/companies/{{tenant_id}}/admin-invitation",
          { body: {}, save: invitationSave },
        ),
      ],
      "Platform login is required. Platform accounts cannot access employee or company-user records.",
    ),
    folder(
      "03 — Company settings",
      [
        get("Company access check", "/company/access"),
        get("Get company settings", "/company/settings"),
        put("Update company settings", "/company/settings", {
          body: company,
          dto: "tenants/company.dto:CompanyProfileDto",
        }),
      ],
      "Tenant permission: company.manage. Review the full sample profile before sending an update.",
    ),
    folder("04 — Organization masters", [
      master(
        "Departments",
        "/organization/departments",
        "department_id",
        { code: "PM_DEPT", name: "Postman Department" },
        "organization/organization.dto:NamedMasterDto",
        "company.manage",
      ),
      master(
        "Designations",
        "/organization/designations",
        "designation_id",
        { code: "PM_DESIGNATION", name: "Postman Designation" },
        "organization/organization.dto:NamedMasterDto",
        "company.manage",
      ),
      master(
        "Locations",
        "/organization/locations",
        "location_id",
        {
          code: "PM_LOCATION",
          name: "Postman Location",
          address: { city: "Pune", country: "India" },
        },
        "organization/organization.dto:LocationDto",
        "company.manage",
      ),
      master(
        "Work schedules",
        "/organization/work-schedules",
        "work_schedule_id",
        {
          name: "Postman Schedule",
          location_id: null,
          working_days: [1, 2, 3, 4, 5],
          start_time: "09:00",
          end_time: "18:00",
          late_grace_minutes: 10,
          half_day_minutes: 240,
          full_day_minutes: 480,
        },
        "organization/organization.dto:WorkScheduleDto",
        "company.manage",
      ),
    ]),
    folder(
      "05 — Other master settings",
      [
        master(
          "Leave types",
          "/leave/types",
          "leave_type_id",
          {
            code: "PM_LEAVE",
            name: "Postman Leave",
            description: "Sample leave type",
            is_active: true,
          },
          "leave/leave-settings.dto:LeaveTypeDto",
          "leave.manage",
        ),
        master(
          "Leave policies",
          "/leave/policies",
          "leave_policy_id",
          {
            leave_type_id: "{{leave_type_id}}",
            name: "Postman Policy",
            annual_entitlement: 18,
            applicability: { department_id: null, location_id: null },
            is_paid: true,
            balance_controlled: true,
            carry_forward_enabled: false,
            exclude_non_working_days: true,
            effective_from: "2026-01-01",
            effective_to: null,
          },
          "leave/leave-settings.dto:LeavePolicyDto",
          "leave.manage",
        ),
        master(
          "Salary components",
          "/payroll/components",
          "salary_component_id",
          {
            code: "PM_COMPONENT",
            name: "Postman Allowance",
            kind: "earning",
            is_active: true,
          },
          "payroll/salary-component.dto:SalaryComponentDto",
          "payroll.manage",
        ),
        master(
          "Document categories",
          "/documents/categories",
          "document_category_id",
          { code: "PM_DOCUMENT", name: "Postman Category" },
          "organization/organization.dto:NamedMasterDto",
          "documents.manage",
        ),
      ],
      "Master CRUD. Operational holiday, attendance, leave, payroll and document requests are in folders 08-12.",
    ),
    folder("06 — Employees", [
      get("List employees", "/employees", {
        query: [
          ...pageQuery,
          ...[
            "status",
            "department_id",
            "designation_id",
            "location_id",
            "manager_id",
          ].map((key) => ({
            key,
            value: key === "status" ? "active" : variable(key),
            disabled: true,
          })),
        ],
      }),
      get("Organization and manager lookups", "/employees/lookups"),
      post("Create employee", "/employees", {
        body: employee,
        dto: "employees/employee.dto:EmployeeProfileDto",
        save: idSave("employee_id"),
        description:
          "Requires employees.manage. Use a unique employee_code/email. Optional organization IDs default to null; replace with same-company IDs from lookups to assign them. Creates an Invited profile without a login account.",
      }),
      get("Get employee profile", "/employees/{{employee_id}}", {
        description:
          "HR sees full company profiles; managers see direct-report work data; employees see their own allowed data.",
      }),
      put("Update employee profile", "/employees/{{employee_id}}", {
        body: employee,
        dto: "employees/employee.dto:EmployeeProfileDto",
        description:
          "Review all fields before sending. This sample replaces profile fields; it is not a partial patch. Email cannot change once linked to an account.",
      }),
      post("Set employee Active", "/employees/{{employee_id}}/status", {
        body: { status: "active", reason: "Employment confirmed" },
        dto: "employees/employee.dto:EmployeeStatusDto",
      }),
      post("Set employee On Notice", "/employees/{{employee_id}}/status", {
        body: {
          status: "on_notice",
          reason: "Notice recorded",
          notice_date: "{{lifecycle_date}}",
        },
        dto: "employees/employee.dto:EmployeeStatusDto",
      }),
      post("Set employee Inactive", "/employees/{{employee_id}}/status", {
        body: { status: "inactive", reason: "Employment made inactive" },
        dto: "employees/employee.dto:EmployeeStatusDto",
        description:
          "Disables the linked account immediately and revokes access. Current reports must be reassigned first.",
      }),
      post("Terminate employee", "/employees/{{employee_id}}/status", {
        body: {
          status: "terminated",
          reason: "Employment ended",
          termination_date: "{{lifecycle_date}}",
        },
        dto: "employees/employee.dto:EmployeeStatusDto",
        description:
          "Immediate exit, not scheduling. Date must be on/after joining and notice date, and no later than today in the company timezone. Revokes linked login access; retains history.",
      }),
      post(
        "Invite or reissue employee account",
        "/employees/{{employee_id}}/invitation",
        {
          body: { role: "employee" },
          dto: "employees/employee.dto:EmployeeInviteDto",
          save: invitationSave,
          description:
            "Role may be employee or manager. Reissue preserves existing roles. Saves activation_token; activate, then use employee login.",
        },
      ),
      get(
        "Read protected employee details",
        "/employees/{{employee_id}}/private",
        {
          description:
            "Explicit audited read, HR or self only. Requires valid API encryption configuration.",
        },
      ),
      put(
        "Update protected employee details",
        "/employees/{{employee_id}}/private",
        {
          body: {
            bank_details: [
              {
                label: "Account reference",
                value: "POSTMAN-SAMPLE-NOT-A-REAL-ACCOUNT",
              },
            ],
            statutory_identifiers: [
              { label: "Tax reference", value: "POSTMAN-SAMPLE-NOT-A-REAL-ID" },
            ],
          },
          dto: "employees/employee.dto:EmployeePrivateDto",
          description:
            "HR only. Replaces both categories; an empty array clears a category. Use sample data in testing.",
        },
      ),
      get("My employee profile", "/employees/me", {
        description:
          "Log in as a user linked to an employee, with employees.read.self.",
      }),
      put("Update my contact details", "/employees/me/contact", {
        body: {
          phone: "9000000000",
          address: { city: "Pune", country: "India" },
          emergency_contact: {
            name: "Sample contact",
            relationship: "Sibling",
            phone: "9000000001",
          },
        },
        dto: "employees/employee.dto:EmployeeContactDto",
        description:
          "Self-service only: contact details are editable; HR-controlled fields are rejected.",
      }),
    ]),
    folder(
      "07 — Users and roles",
      [
        get("Roles and permission catalog", "/roles", {
          save: "for (const role of data.roles) { if (['company_admin','hr','manager','employee'].includes(role.code)) pm.environment.set(role.code + '_role_id', role.id); }",
          description:
            "Run first to populate built-in role ID variables. Permission: roles.manage. Built-in roles are read-only; custom roles are company-specific.",
        }),
        get("List users", "/users", {
          query: [
            ...pageQuery,
            { key: "status", value: "active", disabled: true },
            { key: "role_id", value: "{{employee_role_id}}", disabled: true },
          ],
        }),
        post("Invite company user", "/users", {
          body: {
            display_name: "Postman User",
            email: "{{invited_user_email}}",
            role_ids: ["{{employee_role_id}}"],
            ...reason,
          },
          dto: "users/user-access.dto:InviteUserDto",
          save: idSave("user_id") + invitationSave,
          description:
            "Run role catalog first. Saves target user_id and activation_token. Include company_admin_role_id to automatically create a linked employee (or reuse an available unlinked employee with the same email). For other roles, invite existing employees from their profile. Admin creation consumes an employee place; capacity failure rolls back the account and invitation. Review generated employee details in Employees.",
        }),
        put("Assign built-in role to user", "/users/{{user_id}}/roles", {
          body: { role_ids: ["{{manager_role_id}}"], ...reason },
          dto: "users/user-access.dto:UserRolesDto",
          description:
            "Replaces the complete role list. Add more same-company role IDs for multiple roles. Assigning company_admin ensures one linked employee profile and checks employee capacity. Existing profiles and employment details are preserved. Revokes existing sessions; self-change and last-admin removal are blocked.",
        }),
        put("Disable user account", "/users/{{user_id}}/status", {
          body: { status: "disabled", ...reason },
          dto: "users/user-access.dto:UserStatusDto",
          description:
            "Immediately revokes sessions and pending tokens. Employment status stays unchanged. Cannot disable self or the last active Company Admin.",
        }),
        put("Enable user account", "/users/{{user_id}}/status", {
          body: { status: "enabled", ...reason },
          dto: "users/user-access.dto:UserStatusDto",
          description:
            "Cannot bypass an inactive/terminated employee. An unactivated user returns to Invited and needs a fresh invitation.",
        }),
        post("Reissue user invitation", "/users/{{user_id}}/invitation", {
          body: reason,
          dto: "users/user-access.dto:AccessReasonDto",
          save: invitationSave,
        }),
        post("Create custom role", "/roles", {
          body: {
            code: "{{custom_role_code}}",
            name: "Postman Profile Reader",
            permission_codes: ["employees.read.self"],
            ...reason,
          },
          dto: "users/user-access.dto:CreateRoleDto",
          save: idSave("custom_role_id"),
        }),
        put("Edit custom role", "/roles/{{custom_role_id}}", {
          body: {
            name: "Postman Team Reader",
            permission_codes: ["employees.read.self", "employees.read.team"],
            ...reason,
          },
          dto: "users/user-access.dto:RoleDetailsDto",
          description:
            "Role code is immutable. Cannot edit built-in roles or a role assigned to yourself. Editing revokes sessions of assigned users.",
        }),
        put("Assign custom role to user", "/users/{{user_id}}/roles", {
          body: { role_ids: ["{{custom_role_id}}"], ...reason },
          dto: "users/user-access.dto:UserRolesDto",
        }),
      ],
      "All requests require roles.manage. You cannot grant permissions beyond your current access. Changes require an audit reason. No user/role deletion API is exposed.",
    ),
  ],
};

collection.item.push(
  folder(
    "08 — Holiday calendar",
    [
      get("My applicable holiday calendar", "/holidays/calendar", {
        query: [
          { key: "year", value: "{{holiday_year}}" },
          { key: "scope", value: "mine" },
        ],
        description:
          "Any active tenant account. Uses the linked employee location plus company-wide holidays; unlinked/unassigned users get company-wide dates only. Employees cannot supply a location or broaden scope. The year can be omitted to use the current company-timezone year.",
      }),
      get("All locations calendar — administrator", "/holidays/calendar", {
        query: [
          { key: "year", value: "{{holiday_year}}" },
          { key: "scope", value: "all" },
        ],
        description:
          "Requires company.manage. Includes location lookup options, date-only holiday entries, company timezone/today and deduplicated annual/upcoming date counts.",
      }),
      get("Company-wide calendar — administrator", "/holidays/calendar", {
        query: [
          { key: "year", value: "{{holiday_year}}" },
          { key: "scope", value: "company" },
        ],
      }),
      get("Location calendar — administrator", "/holidays/calendar", {
        query: [
          { key: "year", value: "{{holiday_year}}" },
          { key: "scope", value: "location" },
          { key: "location_id", value: "{{location_id}}" },
        ],
        description:
          "Requires company.manage and a same-company location. Includes company-wide holidays plus this location. Archived locations can be reviewed for history.",
      }),
      master(
        "Holiday records",
        "/holidays",
        "holiday_id",
        {
          name: "Postman Holiday",
          holiday_date: "{{holiday_date}}",
          location_id: null,
          description: "Review date and location before creating",
        },
        "holidays/holiday.dto:HolidayDto",
        "company.manage",
      ),
    ],
    "Create/update requires company.manage. Company-wide dates cannot overlap any local holiday; different locations may share a date. Set location_id in the write body to a same-company active location for a local holiday. Existing legacy overlaps are displayed but count once. No deletion API or automatic public-holiday import is provided.",
  ),
);

collection.item.push(
  folder(
    "09 — Attendance",
    [
      get("My monthly attendance", "/attendance/me", {
        query: [{ key: "month", value: "{{attendance_month}}" }],
        description:
          "Requires attendance.self and a linked employee. Omit month for the company-timezone current month. Returns recorded and explicitly marked projected days, schedule settings, summaries and today actions.",
      }),
      get("Find permitted employees", "/attendance/people", {
        query: [...pageQuery, { key: "active_only", value: "true" }],
        description:
          "attendance.manage sees company employees; attendance.approve.team sees direct reports only. Use a returned id as employee_id. Supports search/page/limit. active_only=true restricts to active/on_notice employees; omit or use false to include other non-archived statuses. Returns department_name and location_name.",
      }),
      get(
        "Employee monthly attendance",
        "/attendance/employees/{{employee_id}}",
        {
          query: [{ key: "month", value: "{{attendance_month}}" }],
          description:
            "HR, permitted direct-report manager, or employee self. No personal/bank data is returned.",
        },
      ),
      post("Check in now", "/attendance/check-in", {
        body: { source: "web" },
        dto: "attendance/attendance.dto:AttendanceActionDto",
        description:
          "Log in as an active/on-notice employee with attendance.self and an assigned or unambiguous applicable schedule. Server time determines the date and timestamp. One pair per date; never accepts employee_id or client timestamps.",
      }),
      post("Check out now", "/attendance/check-out", {
        body: { source: "web" },
        dto: "attendance/attendance.dto:AttendanceActionDto",
        description:
          "Completes today’s open check-in. For a prior-day missed checkout, submit a correction. Hours/status use saved schedule rules.",
      }),
      post("Request attendance correction", "/attendance/regularizations", {
        body: {
          work_date: "{{attendance_date}}",
          check_in: "{{attendance_check_in}}",
          check_out: "{{attendance_check_out}}",
          reason: "Missed checkout; please review",
        },
        dto: "attendance/attendance.dto:RegularizationDto",
        save: idSave("regularization_id"),
        description:
          "Self-service only. Both timestamps require Z or an explicit UTC offset, must fall on work_date in the recorded company timezone, and cannot be future times. Saves regularization_id. One pending request per date.",
      }),
      get("My correction requests", "/attendance/regularizations", {
        query: [
          ...pageQuery,
          { key: "scope", value: "mine" },
          { key: "status", value: "pending", disabled: true },
        ],
      }),
      get("Corrections awaiting review", "/attendance/regularizations", {
        query: [
          ...pageQuery,
          { key: "scope", value: "review" },
          { key: "status", value: "pending" },
        ],
        description:
          "HR or direct-report manager. Excludes your own requests. Switch to another authorized reviewer account after submitting a request.",
      }),
      post(
        "Approve correction",
        "/attendance/regularizations/{{regularization_id}}/review",
        {
          body: { decision: "approved", comment: "Verified working hours" },
          dto: "attendance/attendance.dto:AttendanceReviewDto",
          description:
            "Applies once. Rejects self-review, stale attendance and locked payroll dates. Preserves original values and audits changes.",
        },
      ),
      post(
        "Reject correction",
        "/attendance/regularizations/{{regularization_id}}/review",
        {
          body: {
            decision: "rejected",
            comment: "Please submit the corrected times",
          },
          dto: "attendance/attendance.dto:AttendanceReviewDto",
        },
      ),
      put(
        "HR time adjustment",
        "/attendance/employees/{{employee_id}}/days/{{attendance_date}}",
        {
          body: {
            mode: "times",
            check_in: "{{attendance_check_in}}",
            check_out: "{{attendance_check_out}}",
            reason: "Verified HR correction",
          },
          dto: "attendance/attendance.dto:AttendanceAdjustmentDto",
          description:
            "Requires attendance.manage. Replaces times and recalculates status. Saved schedule snapshots are retained. Existing pending requests become stale and must be rejected/resubmitted.",
        },
      ),
      put(
        "HR non-working status adjustment",
        "/attendance/employees/{{employee_id}}/days/{{attendance_date}}",
        {
          body: {
            mode: "absent",
            check_in: null,
            check_out: null,
            reason: "Verified no attendance",
          },
          dto: "attendance/attendance.dto:AttendanceAdjustmentDto",
          description:
            "Allowed modes: absent, leave, holiday, weekly_off. Replaces times with null and worked minutes with zero. Leave here is an HR attendance marker; it does not alter leave balances.",
        },
      ),
    ],
    "Single daily pair; no overnight shifts, overtime or multiple breaks. Set employee work schedule before testing. Times and business dates use company timezone. Locked payroll dates cannot be changed. Run individual requests intentionally, with the appropriate self/manager/HR identity.",
  ),
);

const leaveApplication = {
  policy_id: "{{leave_policy_id}}",
  start_date: "{{leave_start_date}}",
  end_date: "{{leave_end_date}}",
  start_half: "full",
  end_half: "full",
  reason: "Planned personal leave",
};
collection.item.push(
  folder(
    "10 — Leave management",
    [
      get("My annual leave balances", "/leave/me", {
        query: [{ key: "year", value: "{{leave_year}}" }],
        description:
          "leave.self; linked employee. Includes assigned policies and credited, pending, used and available days. January–December year.",
      }),
      get("Employees in leave scope", "/leave/people", {
        query: pageQuery,
        description:
          "leave.manage sees company employees; leave.approve.team sees direct reports.",
      }),
      get('Employee leave assignment directory', '/leave/assignments', {
        query: [{ key: 'year', value: '{{leave_year}}' }, ...pageQuery,
          ...['department_id', 'location_id', 'policy_id', 'status'].map(key => ({ key, value: key === 'status' ? 'unassigned' : '{{' + (key === 'policy_id' ? 'leave_policy_id' : key) + '}}', disabled: true }))],
        description: 'leave.manage. Server pagination; summary ignores the status filter. Active/on-notice employees with employment overlap. Status is assigned, partial, unassigned or not_applicable; completeness counts distinct applicable active leave types. Policy department/location scope and effective dates apply.' }),
      get('Leave assignment department options', '/leave/assignments/departments'),
      get('Leave assignment location options', '/leave/assignments/locations'),
      get('Unassigned applicable employee policies', '/leave/assignments/employees/{{employee_id}}/policies', { query: [{ key: 'year', value: '{{leave_year}}' }], description: 'leave.manage. Only active, applicable policies without an existing balance for this employee, leave type and year.' }),
      post('Preview bulk leave assignment', '/leave/assignments/preview', {
        body: { operation_id: '{{leave_assignment_operation_id}}', policy_id: '{{leave_policy_id}}', year: 2026, credited: 18, carry_forward: 0, reason: 'Reviewed annual entitlement', all_matching: false, employee_ids: ['{{employee_id}}'], filters: { year: 2026 } },
        dto: 'leave/leave-assignment.dto:LeaveAssignmentPreviewDto', save: idSave('leave_assignment_job_id'),
        description: 'Creates a 30-minute draft only; does not credit leave. Maximum 10000 employees. For all matching pages set all_matching=true, remove employee_ids and supply directory filters. Both years must match. Existing balances are skipped; eligibility is rechecked at execution. Reuse an operation UUID only for identical input. One policy per batch; no bulk carry-forward.' }),
      post('Confirm bulk leave assignment', '/leave/assignments/jobs/{{leave_assignment_job_id}}/confirm', { description: '202 Accepted; owner with leave.manage only. Confirms frozen employee IDs. Requires jobs:worker. Repeated confirmation does not recredit. Changed policies require a new preview.' }),
      get('Recent leave assignment jobs', '/leave/assignments/jobs', { description: 'Latest 20 jobs belonging to the current requester.' }),
      get('Leave assignment preview or progress', '/leave/assignments/jobs/{{leave_assignment_job_id}}', { query: [{ key: 'page', value: '1' }], description: 'Owner only. Counts and 50 outcome rows per page. Poll until completed/failed; preview rows do not credit balances.' }),
      post('Retry failed leave assignment', '/leave/assignments/jobs/{{leave_assignment_job_id}}/retry', { description: '202 Accepted. Owner only; preserves already committed outcomes and balances. If the policy changed, create a new preview instead.' }),
      get(
        "Employee balances and assignments",
        "/leave/employees/{{employee_id}}",
        { query: [{ key: "year", value: "{{leave_year}}" }] },
      ),
      post(
        "Assign annual entitlement",
        "/leave/employees/{{employee_id}}/entitlements",
        {
          body: {
            policy_id: "{{leave_policy_id}}",
            year: 2026,
            credited: 12,
            carry_forward: 0,
            reason: "Reviewed annual entitlement",
          },
          dto: "leave/leave.dto:LeaveEntitlementDto",
          save: idSave("leave_balance_id"),
          description:
            "leave.manage. Review the numeric year and credited amount in the body. One entitlement per employee/type/year. This assigns the policy within employment/effective dates and credits the reviewed annual amount, without automatic proration. For uncontrolled policies use credited=0. Carry-forward requires an enabled policy, sufficient previous-year available balance and no pending requests; it transfers those days out of the previous year.",
        },
      ),
      post(
        "Adjust leave balance",
        "/leave/balances/{{leave_balance_id}}/adjustments",
        {
          body: {
            units: 1,
            reason: "Reviewed balance correction",
            operation_id: "{{leave_adjustment_operation_id}}",
          },
          dto: "leave/leave.dto:LeaveAdjustmentDto",
          description:
            "leave.manage. Positive or negative adjustment; available balance cannot go negative. Keep the same operation_id for a retry of the exact same operation; choose a fresh UUID for every new adjustment.",
        },
      ),
      get(
        "Balance movement history",
        "/leave/balances/{{leave_balance_id}}/entries",
        { query: pageQuery },
      ),
      post("Calculate leave application", "/leave/preview", {
        body: leaveApplication,
        dto: "leave/leave.dto:LeaveApplicationDto",
        description:
          "leave.self. Read-only calculation, including balance and overlap validation. Requires assigned policy and a work schedule. Dates must be within one calendar year. For a single half-day set both start_half and end_half to am or pm. Multi-day ranges can start pm and end am.",
      }),
      post("Submit leave application", "/leave/requests", {
        body: leaveApplication,
        dto: "leave/leave.dto:LeaveApplicationDto",
        save: idSave("leave_request_id"),
        description:
          "Reserves controlled balance, snapshots policy/calendar inputs and rejects overlaps. Uncontrolled leave has no artificial balance limit.",
      }),
      get("My leave requests", "/leave/requests", {
        query: [
          ...pageQuery,
          { key: "scope", value: "mine" },
          { key: "status", value: "pending", disabled: true },
        ],
      }),
      get("Review queue and company history", "/leave/requests", {
        query: [
          ...pageQuery,
          { key: "scope", value: "review" },
          { key: "status", value: "pending" },
        ],
        description:
          "HR company scope or manager direct reports. Self-review is forbidden. Use the response can_review/can_cancel flags.",
      }),
      post("Approve leave", "/leave/requests/{{leave_request_id}}/review", {
        body: { decision: "approved", comment: "Approved after team review" },
        dto: "leave/leave.dto:LeaveReviewDto",
        description:
          "Manager/direct-report or HR. Moves reserved units to used; validates attendance conflicts and payroll locks again. Cannot approve own leave.",
      }),
      post("Reject leave", "/leave/requests/{{leave_request_id}}/review", {
        body: {
          decision: "rejected",
          comment: "Please discuss alternative dates",
        },
        dto: "leave/leave.dto:LeaveReviewDto",
        description:
          "Releases the pending reservation. Only pending requests can be reviewed.",
      }),
      post("Cancel leave", "/leave/requests/{{leave_request_id}}/cancel", {
        body: { reason: "Plans changed" },
        dto: "leave/leave.dto:LeaveReasonDto",
        description:
          "Employee can cancel own pending leave. HR can cancel pending or approved leave. Approved cancellation restores balance and removes the attendance overlay; locked payroll dates block it.",
      }),
      get("Approved leave calendar", "/leave/calendar", {
        query: [{ key: "month", value: "{{leave_month}}" }],
        description:
          "Employee own scope, manager direct reports or HR company scope. Only approved chargeable dates; excludes sensitive leave reasons, categories and paid flags.",
      }),
    ],
    "Leave workflows with tenant isolation and audited balance movements. Run deliberately with the required employee/reviewer/HR identity. Initialize policies and entitlements before applying.",
  ),
);

const payrollTransition = {
  revision: "{{payroll_revision_id}}",
  calculation_version: "{{payroll_calculation_version}}",
  reason: "Reviewed payroll amounts",
};
const salaryLines = [
  { component_id: "{{salary_component_id}}", amount: "30000.00" },
];
collection.item.push(
  folder(
    "11 — Payroll and payslips",
    [
      get("Payroll calculation settings", "/payroll/settings"),
      put("Update payroll calculation settings", "/payroll/settings", {
        body: { unpaid_leave_deduction: false },
        dto: "payroll/payroll.dto:PayrollSettingsDto",
        description:
          "payroll.manage. Default is off. Set true only when HR enables approved unpaid-leave deductions. Applies to NEW runs; existing runs retain their saved setting. Fixed components and calendar-day proration; no automatic statutory rates.",
      }),
      get("Employees for salary assignment", "/payroll/people", {
        query: pageQuery,
      }),
      get(
        "Employee salary history",
        "/payroll/employees/{{employee_id}}/salaries",
      ),
      post(
        "Create salary revision",
        "/payroll/employees/{{employee_id}}/salaries",
        {
          body: {
            effective_from: "{{salary_effective_date}}",
            lines: salaryLines,
            reason: "Approved monthly salary",
          },
          dto: "payroll/payroll.dto:SalaryCreateDto",
          save: idSave("salary_structure_id"),
          description:
            "Monthly amounts are DECIMAL STRINGS, not JSON numbers. Use active same-company earning/deduction component IDs. New revisions must follow the latest effective date; the previous revision closes automatically. Dates affecting locked payroll are rejected.",
        },
      ),
      put(
        "Correct salary amounts",
        "/payroll/salaries/{{salary_structure_id}}",
        {
          body: {
            lines: salaryLines,
            reason: "Correct reviewed salary allocation",
          },
          dto: "payroll/payroll.dto:SalaryEditDto",
          description:
            "Replaces the component allocation within the same effective dates. Removed lines retain zero amounts. Cannot affect a locked period; existing unlocked payroll requires recalculation.",
        },
      ),
      get("List payroll runs", "/payroll/runs", { query: pageQuery }),
      post("Create monthly payroll run", "/payroll/runs", {
        body: { month: "{{payroll_month}}", pay_date: "{{payroll_pay_date}}" },
        dto: "payroll/payroll.dto:PayrollRunDto",
        save: idSave("payroll_run_id"),
        description:
          "One run per calendar month. Copies currency and unpaid-leave configuration. Assign employee salaries before calculation.",
      }),
      get(
        "Payroll run details — refresh revision",
        "/payroll/runs/{{payroll_run_id}}",
        {
          save: "pm.environment.set('payroll_revision_id', data.run.calculation_config.revision); pm.environment.set('payroll_calculation_version', data.run.calculation_version);",
          description:
            "Run before EVERY calculation/adjustment/review/lock/publish after a mutation. Captures the current revision and version, preventing approval from a stale screen. Choose payroll_employee_id from current items; it is a payroll item UUID, not the employee profile UUID.",
        },
      ),
      get(
        "Previous payroll calculation",
        "/payroll/runs/{{payroll_run_id}}/versions/{{payroll_history_version}}",
      ),
      post(
        "Calculate or recalculate payroll",
        "/payroll/runs/{{payroll_run_id}}/calculate",
        {
          body: {
            revision: "{{payroll_revision_id}}",
            discard_adjustments: false,
            reason: "Calculate reviewed salary inputs",
          },
          dto: "payroll/payroll.dto:PayrollCalculateDto",
          description:
            "Creates a retained calculation version. Explicitly set discard_adjustments=true if replacing a version containing nonzero manual adjustments. Missing salary coverage aborts the entire calculation.",
        },
      ),
      post(
        "Add manual payroll adjustment",
        "/payroll/employees/{{payroll_employee_id}}/adjustments",
        {
          body: {
            ...payrollTransition,
            operation_id: "{{payroll_adjustment_operation_id}}",
            name: "Reviewed bonus",
            kind: "earning",
            amount: "100.00",
          },
          dto: "payroll/payroll.dto:PayrollAdjustmentDto",
          save: idSave("payroll_adjustment_id"),
          description:
            "payroll_employee_id is the current payroll item. Reuse operation_id only for a retry of the identical action; use a new UUID for every distinct adjustment. Amounts are decimal strings. Changing amounts clears review.",
        },
      ),
      put(
        "Edit or void manual adjustment",
        "/payroll/adjustments/{{payroll_adjustment_id}}",
        {
          body: {
            ...payrollTransition,
            expected_amount: "100.00",
            amount: "0.00",
          },
          dto: "payroll/payroll.dto:PayrollAdjustmentEditDto",
          description:
            "Refresh the run revision and enter the current expected_amount. Set amount=0.00 to void a manual line while retaining history. Cannot edit generated lines or old calculation versions.",
        },
      ),
      post("Mark payroll reviewed", "/payroll/runs/{{payroll_run_id}}/review", {
        body: payrollTransition,
        dto: "payroll/payroll.dto:PayrollTransitionDto",
        description:
          "Requires calculated status and unchanged salary/employment/unpaid-leave inputs. Refresh run details after success.",
      }),
      post("Lock reviewed payroll", "/payroll/runs/{{payroll_run_id}}/lock", {
        body: payrollTransition,
        dto: "payroll/payroll.dto:PayrollTransitionDto",
        description:
          "Irreversible through this release. Month must have ended; resolve pending leave and attendance corrections first. Rechecks current inputs and freezes the period against attendance/leave changes. Refresh run details after success.",
      }),
      post(
        "Queue private payslip PDFs",
        "/payroll/runs/{{payroll_run_id}}/publish",
        {
          body: payrollTransition,
          dto: "payroll/payroll.dto:PayrollTransitionDto",
          description:
            "202 Accepted. Locked runs only. The separate jobs:worker generates PDFs in private PAYSLIP_STORAGE_DIR and atomically publishes the whole batch. Poll payslip-job for status. Repeating a failed request retries generation; successful repeats are idempotent. Shared persistent storage required; non-ASCII names require PAYSLIP_FONT_PATH. Sends configured payslip notifications after publication; does not pay employees.",
        },
      ),
      get('Payslip generation status', '/payroll/runs/{{payroll_run_id}}/payslip-job', { description: 'payroll.manage required. Returns job or null. Poll pending/running until completed or failed. PDFs become visible only after the entire batch is published.' }),
      get("My published payslips", "/payslips/me", {
        query: pageQuery,
        description:
          "payslips.read.self. Only the linked employee’s own published/locked payslips. Choose payslip_id from the list; HR can also use a published current payroll item ID.",
      }),
      get("View published payslip", "/payslips/{{payslip_id}}", {
        description:
          "Employee owner or payroll.manage. Returns only the pay statement, excluding private file keys and full calculation inputs.",
      }),
      get("Download private payslip PDF", "/payslips/{{payslip_id}}/download", {
        description:
          "Authenticated binary application/pdf response with no-store caching. Use Postman Save Response / Send and Download. Owner or payroll.manage only.",
      }),
    ],
    "Monthly payroll workflow. Refresh run details between mutations to update revision/version variables. Monetary request values must be strings. Earlier calculations are retained; locking has no undo endpoint.",
  ),
);

const documentMetadata = {
  title: "Employment contract",
  category_id: "{{document_category_id}}",
  visibility: "hr_only",
  issue_date: "{{document_issue_date}}",
  expiry_date: "{{document_expiry_date}}",
  reason: "Reviewed employee document",
};
const documentAction = {
  revision: "{{document_revision_id}}",
  reason: "Reviewed document change",
};
collection.item.push(
  folder(
    "12 — Document management",
    [
      get("Document library", "/documents", {
        query: [
          ...pageQuery,
          { key: "status", value: "active" },
          { key: "expiry", value: "all" },
          { key: "employee_id", value: "{{employee_id}}", disabled: true },
          {
            key: "category_id",
            value: "{{document_category_id}}",
            disabled: true,
          },
        ],
        description:
          "HR: all company records. Employee: own shared records. documents.read.team: explicitly team-visible direct-report documents only. expiry=expired or expiring (next 30 days in company time).",
      }),
      get("Find employees for upload", "/documents/people", {
        query: pageQuery,
        description:
          "documents.manage required. Select employee_id from the intended employee; no automatic selection.",
      }),
      post("Upload employee document", "/documents", {
        body: {
          ...documentMetadata,
          employee_id: "{{employee_id}}",
          operation_id: "{{document_upload_operation_id}}",
        },
        multipart: true,
        dto: "documents/document.dto:DocumentCreateDto",
        save: idSave("document_id"),
        description:
          "HR only. Body > form-data: choose one local file in file field. PDF/PNG/JPEG, nonempty, max 10 MiB. Do not set Content-Type manually; Postman supplies the boundary. New operation UUID per new document; retain UUID and identical fields/file for retries. Visibility defaults to this example: hr_only.",
      }),
      get("Document details and versions", "/documents/{{document_id}}", {
        save: "pm.environment.set('document_revision_id',data.revision);",
        description:
          "Captures revision for mutations. Select document_version_id explicitly from versions; earlier versions are retained. Private storage keys are never returned.",
      }),
      put("Edit document metadata", "/documents/{{document_id}}", {
        body: { ...documentMetadata, ...documentAction },
        dto: "documents/document.dto:DocumentUpdateDto",
        description:
          "HR only. Refresh detail first. Full metadata replacement; empty dates clear them. Changes apply to sharing of all versions.",
      }),
      post(
        "Upload new document version",
        "/documents/{{document_id}}/versions",
        {
          body: {
            ...documentAction,
            operation_id: "{{document_version_operation_id}}",
          },
          multipart: true,
          dto: "documents/document.dto:DocumentUploadDto",
          save: idSave("document_version_id"),
          description:
            "HR only. Choose file in form-data. New operation UUID per replacement; reuse for retry. Refresh detail revision before uploading. Prior files are retained.",
        },
      ),
      get(
        "Download document version",
        "/documents/{{document_id}}/versions/{{document_version_id}}/download",
        {
          description:
            "Authenticated binary attachment, no-store. Use Send and Download. HR can access retained archived files; employees/managers cannot. Every successful download is audited.",
        },
      ),
      post(
        "Archive document version",
        "/documents/{{document_id}}/versions/{{document_version_id}}/archive",
        {
          body: documentAction,
          dto: "documents/document.dto:DocumentActionDto",
          description:
            "HR only. Refresh detail revision first. Hides this version from employee/team; newest remaining active version becomes current. Cannot archive the last active version of an active document.",
        },
      ),
      post("Archive document", "/documents/{{document_id}}/archive", {
        body: documentAction,
        dto: "documents/document.dto:DocumentActionDto",
        description:
          "HR only. Hides the entire document from employee/team. Files remain retained for HR and continue counting toward storage quota. No hard deletion or restore endpoint.",
      }),
    ],
    "Private document library with audited uploads, immutable file versions, expiry metadata and scoped sharing. Select individual requests intentionally.",
  ),
);

collection.item.push(folder('13 Dashboard and reports',[
  get('Dashboard','/dashboard',{description:'Tenant dashboard. Each widget uses its domain company/team/self scope. Payroll status requires payroll.manage; payslips and balances are personal. No report permission is needed.'}),
  get('Report options','/reports/options',{query:[{key:'kind',value:'{{report_kind}}'}],description:'Choose employees, attendance, leave, balances, payroll or components. Requires a reporting permission AND the matching domain permission. Returns scoped organization filters and payroll runs.'}),
  get('Preview report','/reports/{{report_kind}}',{query:[...pageQuery,{key:'from',value:'{{report_from}}',disabled:true},{key:'to',value:'{{report_to}}',disabled:true},{key:'year',value:'{{leave_year}}',disabled:true},{key:'run_id',value:'{{payroll_run_id}}',disabled:true},{key:'employee_id',value:'{{employee_id}}',disabled:true},{key:'department_id',value:'{{department_id}}',disabled:true},{key:'location_id',value:'{{location_id}}',disabled:true},{key:'status',value:'',disabled:true}],description:'Default attendance uses month-to-date. Attendance: from/to <=31 days; leave requests: <=366 days. Balances: year. Payroll/components: enable run_id. Date/year/run filters are exclusive to their corresponding report. Max 5000 matching rows; 413 requires narrower filters.'}),
  post('Export report CSV','/reports/{{report_kind}}/export',{body:{from:'{{report_from}}',to:'{{report_to}}'},dto:'reports/report.dto:ReportQueryDto',description:'Use Send and Download. Default body is for attendance or leave. For employees use {}; balances use {"year":2026}; payroll/components use {"run_id":"<payroll UUID>"}. Optional search/employee_id/department_id/location_id and supported status. Exports all matching rows, ignores pagination, capped at 5000. UTF-8 BOM, quoted and formula-safe. Export is audited and CSRF protected.'}),
  post('Queue large CSV export','/reports/{{report_kind}}/export-jobs',{body:{operation_id:'{{report_export_operation_id}}',from:'{{report_from}}',to:'{{report_to}}'},dto:'reports/report-export.dto:ReportExportDto',save:idSave('report_export_job_id'),description:'202 Accepted. Requires jobs:worker. Default filters suit attendance/leave; employees: operation_id only; balances: add year; payroll/components: add run_id. Maximum 100000 rows/50 MiB. Reuse operation_id only to safely repeat the SAME request; use a new UUID for a fresh snapshot or changed filters. Limits: 3 active jobs per requester, 31 attendance days/366 leave days.'}),
  get('My background exports','/report-exports',{query:[{key:'page',value:'1'},{key:'limit',value:'20'}]}),
  get('Background export status','/report-exports/{{report_export_job_id}}',{description:'Owner only. Poll pending/running until completed/failed. Status includes progress and safe error codes; never file paths or report data.'}),
  get('Download completed background CSV','/report-exports/{{report_export_job_id}}/download',{description:'Use Send and Download. Owner only and current report/domain/team access is checked again. Completed files expire after 24 hours (410); pending/failed returns 409. CSV is UTF-8 BOM, quoted and formula-safe.'}),
  post('Retry failed background export','/report-exports/{{report_export_job_id}}/retry',{body:{},dto:'reports/report-export.dto:ExportRetryDto',description:'202 Accepted. Owner with current permission only; failed jobs only. Resets the three-attempt budget and queues the same filters. Expired/completed jobs require a new operation UUID.'}),
], 'Operational reporting with tenant and domain scopes. Small synchronous CSV and large background CSV exports. XLSX/PDF reports remain outside this release.'));

collection.item.push(folder('14 Notifications and email delivery',[
  get('My notifications','/notifications',{query:[{key:'page',value:'1'},{key:'limit',value:'20'},{key:'status',value:'all'}],description:'Own notifications only. status=all|read|unread. Includes total and unread count plus an authorized-screen link; no invitation tokens or delivery payloads. Set notification_id manually from your own list.'}),
  get('Unread notification count','/notifications/unread-count'),
  put('Mark notification read or unread','/notifications/{{notification_id}}/read',{body:{read:true},dto:'notifications/notification.dto:NotificationReadDto',description:'Own notification only. Change read to false to mark it unread. Other users/tenants receive 404.'}),
  put('Mark all my notifications read','/notifications/read-all',{body:{},dto:'notifications/notification.dto:NotificationRetryDto',description:'Marks your currently unread notifications read. Does not change another user’s inbox.'}),
  get('Company email delivery status','/notifications/deliveries',{query:[{key:'page',value:'1'},{key:'limit',value:'20'},{key:'status',value:'failed'}],description:'company.manage required. status=pending|sent|failed|skipped, or disable status for all. Only delivery metadata is returned. Set notification_delivery_id explicitly from this list. Sent means SMTP accepted, not inbox delivery/read confirmation.'}),
  post('Retry failed workflow email','/notifications/deliveries/{{notification_delivery_id}}/retry',{body:{},dto:'notifications/notification.dto:NotificationRetryDto',description:'company.manage required; failed non-invitation delivery only. Requeues the existing record and audits the action. Worker rechecks current recipient access. For failed invitations, use the existing replacement-invitation API to issue a fresh activation link. SMTP must be configured and the separate worker running.'}),
], 'In-app workflow notifications and durable PostgreSQL outbox → Redis/BullMQ → SMTP delivery. SMTP is captured by local Mailpit in development; no general-purpose send-email API is exposed.'));

collection.item.push(folder('15 Audit logs and activity history', [
  get('Company audit history', '/audit-logs', { query: [...pageQuery, {key:'actor',value:'Admin',disabled:true}, {key:'module',value:'employee',disabled:true}, {key:'action',value:'employee.updated',disabled:true}, {key:'actor_id',value:'{{user_id}}',disabled:true}, {key:'entity_id',value:'{{employee_id}}',disabled:true}, {key:'from',value:'{{audit_from}}',disabled:true}, {key:'to',value:'{{audit_to}}',disabled:true}], description: 'company.manage required. Read-only, newest first; inclusive UTC dates. Actor searches current user name/email, case-insensitively as literal text. No raw metadata. Set audit_event_id from a chosen row. Tenant identity comes only from the session.' }),
  get('Audit filter choices', '/audit-logs/options', {description:'Tenant-scoped action codes and module prefixes recorded in this company. company.manage required.'}),
  get('Audit event details', '/audit-logs/{{audit_event_id}}', {description:'company.manage required. Own-tenant event only; unknown/cross-tenant IDs return 404. Selected safe operational details only; private reasons, payroll values, snapshots and credentials are excluded.'}),
], 'Read-only company activity, including existing historical events. No edit/delete/export endpoint. System/platform entries may have no tenant actor. Current user identity is shown, not a historical name snapshot.'));

const defaults = {
  report_export_operation_id: '34570c60-ddb0-42f2-87d5-19ab7f992d8e',
  report_export_job_id: '',
  reset_token: '',
  reset_password: '',
  audit_event_id: '',
  audit_from: '2026-10-01',
  audit_to: '2026-10-08',
  notification_id: '',
  notification_delivery_id: '',
  report_kind: 'attendance',
  report_from: '2026-10-01',
  report_to: '2026-10-07',
  document_id: "",
  document_version_id: "",
  document_revision_id: "",
  document_upload_operation_id: "4e7a25eb-4ad8-430e-87ed-f923639e4509",
  document_version_operation_id: "c3dafee2-e629-4613-9c8d-c7d4976608aa",
  document_issue_date: "2026-01-01",
  document_expiry_date: "2027-01-01",
  base_url: "http://localhost:3000/api/v1",
  platform_email: "microhrms@yopmail.com",
  platform_password: "",
  tenant_email: "admin@example.test",
  tenant_password: "",
  company_slug: "postman-demo",
  company_name: "Postman Demo Company",
  tenant_id: "",
  current_user_id: "",
  activation_token: "",
  activation_expires_at: "",
  activation_password: "",
  current_password: "",
  new_password: "",
  employee_id: "",
  employee_code: "PM001",
  employee_email: "employee@example.test",
  manager_id: "",
  user_id: "",
  invited_user_email: "user@example.test",
  custom_role_id: "",
  custom_role_code: "postman_reader",
  company_admin_role_id: "",
  hr_role_id: "",
  manager_role_id: "",
  employee_role_id: "",
  department_id: "",
  designation_id: "",
  location_id: "",
  work_schedule_id: "",
  leave_type_id: "",
  leave_policy_id: "",
  salary_component_id: "",
  document_category_id: "",
  holiday_id: "",
  holiday_date: "2026-12-25",
  holiday_year: "2026",
  lifecycle_date: "2026-01-02",
  attendance_month: "2026-10",
  attendance_date: "2026-10-06",
  attendance_check_in: "2026-10-06T09:00:00+05:30",
  attendance_check_out: "2026-10-06T18:00:00+05:30",
  regularization_id: "",
  leave_year: "2026",
  leave_assignment_operation_id: '81bc66a3-d8d5-4acb-96e5-cc4e8346e12c',
  leave_assignment_job_id: '',
  leave_month: "2026-10",
  leave_start_date: "2026-10-08",
  leave_end_date: "2026-10-08",
  leave_balance_id: "",
  leave_request_id: "",
  leave_adjustment_operation_id: "c0bfba30-1e55-4b51-9a04-e651584a4ca2",
  salary_structure_id: "",
  salary_effective_date: "2026-01-01",
  payroll_month: "2026-09",
  payroll_pay_date: "2026-10-01",
  payroll_run_id: "",
  payroll_employee_id: "",
  payroll_revision_id: "",
  payroll_calculation_version: "1",
  payroll_history_version: "1",
  payroll_adjustment_id: "",
  payroll_adjustment_operation_id: "ea64c99c-e4db-4c30-93e8-b49959b7f9dc",
  payslip_id: "",
};
const environment = {
  id: "a207b777-5c1a-4918-b90d-f7968c2b8b06",
  name: "Micro HRMS — Local template",
  values: Object.entries(defaults).map(([key, value]) => ({
    key,
    value,
    type: /password|token/.test(key) ? "secret" : "default",
    enabled: true,
  })),
  _postman_variable_scope: "environment",
};
function generate() {
  const directory = path.join(root, "postman");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "MicroHRMS.postman_collection.json"),
    JSON.stringify(collection, null, 2) + "\n",
  );
  fs.writeFileSync(
    path.join(directory, "MicroHRMS.local.postman_environment.json"),
    JSON.stringify(environment, null, 2) + "\n",
  );
  console.log(
    `Generated collection with ${bindings.length} requests and a secret-free environment template.`,
  );
}
if (require.main === module) generate();
module.exports = { collection, environment, bindings };
