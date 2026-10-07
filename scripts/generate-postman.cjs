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
  { body, dto, save = "", description = "", query = [] } = {},
) {
  const expected =
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
        ...(body ? [{ key: "Content-Type", value: "application/json" }] : []),
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
            body: {
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
      "Maintained with each completed topic. Import the environment template and read postman/README.md. Session cookies, not bearer tokens. Select individual requests/folders intentionally: this is an API reference, not an all-at-once runner scenario. Writes modify the selected environment. Only implemented routes are included; leave/payroll/documents folders currently contain master settings only.",
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
        post("Logout current session", "/auth/logout", {
          body: {},
          description: "Signs out the active cookie session.",
        }),
        post("Logout all sessions", "/auth/logout-all", {
          body: {},
          description: "Revokes every session for the current account.",
        }),
      ],
      "No public registration or forgot/reset password API is currently exposed. Do not add placeholders for unimplemented routes.",
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
              "Requires platform login. Creates real company defaults and an invited company administrator. Use a unique company_slug. Saves tenant_id and activation_token. Activate, then log in as the company user.",
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
            annual_entitlement: 12,
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
      "Only implemented master CRUD. Leave requests, payroll runs and document uploads are not implemented yet. Holiday calendar requests are in folder 08.",
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
        post("Invite standalone user", "/users", {
          body: {
            display_name: "Postman User",
            email: "{{invited_user_email}}",
            role_ids: ["{{employee_role_id}}"],
            ...reason,
          },
          dto: "users/user-access.dto:InviteUserDto",
          save: idSave("user_id") + invitationSave,
          description:
            "Run role catalog first. Saves target user_id and activation_token. For an existing employee use their profile invitation endpoint instead.",
        }),
        put("Assign built-in role to user", "/users/{{user_id}}/roles", {
          body: { role_ids: ["{{manager_role_id}}"], ...reason },
          dto: "users/user-access.dto:UserRolesDto",
          description:
            "Replaces the complete role list. Add more same-company role IDs for multiple roles. Revokes existing sessions; self-change and last-admin removal are blocked.",
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
        query: pageQuery,
        description:
          "attendance.manage sees company employees; attendance.approve.team sees direct reports only. Use a returned id as employee_id. Supports search/page/limit.",
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

const defaults = {
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
