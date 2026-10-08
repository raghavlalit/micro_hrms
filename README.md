# Micro HRMS

Angular web application and NestJS API in npm workspaces.

## Development

```powershell
npm.cmd ci
# Only on a fresh checkout without database credentials:
npm.cmd run db:setup
npm.cmd run db:up
npm.cmd run db:migrate
```

Start `npm.cmd run dev:api` and `npm.cmd run dev:web` in separate terminals. PostgreSQL runs on localhost port 5433 with persistent Docker storage. Local `.env` files are generated and ignored by Git.

## Database documentation

- [Setup, connection details and migration commands](docs/database-setup.md)
- [Schema, relationships, security and pending business rules](docs/database-schema.md)
- [Authentication, administrator provisioning and access rules](docs/authentication.md)
- [Module ownership and TypeORM conventions](docs/development-conventions.md)
- [Company onboarding, activation and tenant settings](docs/company-onboarding.md)
- [Frontend design, screen organization and UI conventions](docs/frontend-design.md)
- [Employee management, access rules and encryption setup](docs/employee-management.md)
- [User and role management, permissions and account safeguards](docs/user-role-management.md)
- [Holiday calendar, applicability and date rules](docs/holiday-calendar.md)
- [Attendance, corrections, approvals and calculation rules](docs/attendance-management.md)
- [Leave balances, applications, approvals and annual setup](docs/leave-management.md)
- [Payroll, salary revisions, calculations and private payslips](docs/payroll-management.md)
- [Postman collection, environment and API testing instructions](postman/README.md)

Run `npm.cmd run db:test` for real PostgreSQL migration/integrity/isolation tests, and `npm.cmd run db:smoke` for API startup verification. Tests use disposable resources and leave the development database intact.
