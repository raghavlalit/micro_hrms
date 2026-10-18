import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../../database/database.options';
import { DatabaseRoleGuard } from '../../../database/database-role.guard';
import { TenantDatabaseService } from '../../tenants/tenant-database.service';
import { Tenant } from '../../tenants/tenant.schemas';
import { Role, User, UserRole } from '../../users/user.schemas';
import { Employee } from '../employee.schemas';
import { EmployeeAccountService } from '../employee-account.service';
import { AdminEmployeeService } from '../admin-employee.service';

// Operator-only repair for a named existing administrator. Defaults to preview;
// never changes credentials, role memberships or unrelated employees.
async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => args[args.indexOf(flag) + 1];
  const tenantId = args.includes('--tenant') ? value('--tenant') : '';
  const email = args.includes('--email')
    ? value('--email')?.trim().toLowerCase()
    : '';
  if (!/^[a-f0-9-]{36}$/i.test(tenantId) || !email?.includes('@'))
    throw new Error(
      'Use --tenant <company UUID> --email <admin email> [--apply]',
    );
  const db = new DataSource(databaseOptions());
  try {
    await db.initialize();
    await new DatabaseRoleGuard(db).onModuleInit();
    const accounts = new EmployeeAccountService();
    const profiles = new AdminEmployeeService(accounts);
    const result = await new TenantDatabaseService(db).withTenant(
      tenantId,
      async (manager) => {
        if (args.includes('--apply'))
          await accounts.lockTenant(manager, tenantId);
        const company = await manager
          .getRepository(Tenant)
          .findOneByOrFail({ id: tenantId });
        const user = await manager
          .getRepository(User)
          .findOne({
            select: { id: true, status: true },
            where: { tenant_id: tenantId, email },
          });
        if (!user) throw new Error('User not found in the specified company');
        const role = await manager
          .getRepository(Role)
          .findOneByOrFail({ tenant_id: tenantId, code: 'company_admin' });
        if (
          !(await manager
            .getRepository(UserRole)
            .existsBy({
              tenant_id: tenantId,
              user_id: String(user.id),
              role_id: String(role.id),
            }))
        )
          throw new Error('The selected user is not a company administrator');
        const employee = args.includes('--apply')
          ? await profiles.ensure(manager, tenantId, String(user.id))
          : await manager.getRepository(Employee).findOneBy([
              { tenant_id: tenantId, user_id: String(user.id) },
              { tenant_id: tenantId, email },
            ]);
        return {
          applied: args.includes('--apply'),
          company: company.name,
          slug: company.slug,
          email,
          user_id: user.id,
          user_status: user.status,
          role: 'company_admin',
          employee: employee
            ? {
                id: employee.id,
                employee_code: employee.employee_code,
                user_id: employee.user_id,
                status: employee.status,
                joining_date: employee.joining_date,
                employment_type: employee.employment_type,
              }
            : null,
        };
      },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Administrator employee linking failed',
  );
  process.exitCode = 1;
});
