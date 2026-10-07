import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In, IsNull, QueryFailedError } from 'typeorm';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/auth.service';
import { InvitationsService } from '../auth/invitations.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import {
  Department,
  Designation,
  Location,
  WorkSchedule,
} from '../organization/organization.schemas';
import { AuditLog } from '../audit/audit.schemas';
import { EmployeeUserService } from '../users/employee-user.service';
import { Employee } from './employee.schemas';
import { EmployeeRepository } from './employee-repository';
import { EmployeeAccountService } from './employee-account.service';
import { EmployeePrivateService } from './employee-private.service';
import {
  EmployeeContactDto,
  EmployeeInviteDto,
  EmployeeListDto,
  EmployeePrivateDto,
  EmployeeProfileDto,
  EmployeeStatusDto,
} from './employee.dto';
import { AUDITED_EMPLOYMENT_FIELDS, directoryProfile } from './employee-record';
import type { EmployeeRecord } from './employee-record';

@Injectable()
export class EmployeeService {
  constructor(
    private readonly tenants: TenantDatabaseService,
    private readonly repository: EmployeeRepository,
    private readonly accounts: EmployeeAccountService,
    private readonly users: EmployeeUserService,
    private readonly invitations: InvitationsService,
    private readonly privateData: EmployeePrivateService,
  ) {}

  private manages(user: Principal) {
    return (
      user.kind === 'tenant' && user.permissions.includes('employees.manage')
    );
  }
  private requireManage(user: Principal) {
    if (!this.manages(user))
      throw new ForbiddenException('Employee management permission required');
  }
  private async access(
    manager: EntityManager,
    user: Principal,
    employee: EmployeeRecord,
  ) {
    if (this.manages(user)) return 'manage' as const;
    const self = await this.repository.findSelf(
      manager,
      user.tenantId!,
      user.id,
    );
    if (
      self?.id === employee.id &&
      user.permissions.includes('employees.read.self')
    )
      return 'self' as const;
    if (
      self &&
      employee.manager_id === self.id &&
      user.permissions.includes('employees.read.team')
    )
      return 'team' as const;
    throw new NotFoundException('Employee not found');
  }
  private async required(manager: EntityManager, tenantId: string, id: string) {
    const employee = await this.repository.find(manager, tenantId, id);
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }
  private async audit(
    manager: EntityManager,
    user: Principal,
    id: string,
    action: string,
    metadata: object = {},
  ) {
    await manager.getRepository(AuditLog).insert({
      tenant_id: user.tenantId,
      actor_id: user.id,
      entity_type: 'employee',
      entity_id: id,
      action,
      metadata,
    });
  }
  private async write<T>(
    user: Principal,
    work: (
      manager: EntityManager,
      tenant: Record<string, unknown>,
    ) => Promise<T>,
  ) {
    this.requireManage(user);
    try {
      return await this.tenants.withTenant(user.tenantId!, async (manager) =>
        work(manager, await this.accounts.lockTenant(manager, user.tenantId!)),
      );
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error.driverError as { code?: string }).code;
        if (code === '23505')
          throw new ConflictException(
            'Employee code or email already exists in this company',
          );
        if (code === '23503' || code === '23514')
          throw new BadRequestException(
            'Employee details or organization assignments are invalid',
          );
      }
      throw error;
    }
  }
  list(user: Principal, dto: EmployeeListDto) {
    if (
      !this.manages(user) &&
      !user.permissions.some((p) =>
        ['employees.read.self', 'employees.read.team'].includes(p),
      )
    )
      throw new ForbiddenException('Employee access permission required');
    return this.tenants.withTenant(user.tenantId!, async (manager) => {
      const self = await this.repository.findSelf(
        manager,
        user.tenantId!,
        user.id,
      );
      const result = await this.repository.list(manager, user.tenantId!, dto, {
        all: this.manages(user),
        selfId: self ? String(self.id) : undefined,
        self: user.permissions.includes('employees.read.self'),
        team: user.permissions.includes('employees.read.team'),
      });
      return {
        ...result,
        items: result.items.map(directoryProfile),
        can_manage: this.manages(user),
      };
    });
  }
  detail(user: Principal, id: string) {
    return this.tenants.withTenant(user.tenantId!, async (manager) => {
      const employee = await this.required(manager, user.tenantId!, id);
      const access = await this.access(manager, user, employee);
      return {
        employee: access === 'team' ? directoryProfile(employee) : employee,
        access,
        private_data_available:
          access !== 'team' && this.privateData.available(),
      };
    });
  }
  me(user: Principal) {
    return this.tenants.withTenant(user.tenantId!, async (manager) => {
      const self = await this.repository.findSelf(
        manager,
        user.tenantId!,
        user.id,
      );
      if (!self)
        throw new NotFoundException(
          'Your account is not linked to an employee profile yet',
        );
      const employee = await this.required(
        manager,
        user.tenantId!,
        String(self.id),
      );
      return {
        employee,
        access: 'self',
        private_data_available: this.privateData.available(),
      };
    });
  }
  lookups(user: Principal) {
    this.requireManage(user);
    return this.tenants.withTenant(user.tenantId!, async (manager) => {
      const named = (schema: typeof Department) =>
        manager.getRepository(schema).find({
          where: { tenant_id: user.tenantId, archived_at: IsNull() },
          select: { id: true, name: true },
          order: { name: 'ASC' },
        });
      return {
        departments: await named(Department),
        designations: await named(Designation),
        locations: await named(Location),
        work_schedules: await named(WorkSchedule),
        managers: await this.repository
          .query(manager, user.tenantId!)
          .select('employee.id', 'id')
          .addSelect(
            "concat_ws(' ', employee.first_name, employee.last_name, '(' || employee.employee_code || ')')",
            'name',
          )
          .andWhere('employee.status IN (:...statuses)', {
            statuses: ['active', 'on_notice'],
          })
          .orderBy('employee.first_name', 'ASC')
          .getRawMany<{ id: string; name: string }>(),
      };
    });
  }
  private async validateProfile(
    manager: EntityManager,
    tenantId: string,
    id: string,
    dto: EmployeeProfileDto,
    existing?: EmployeeRecord,
  ) {
    if (dto.date_of_birth && dto.date_of_birth >= dto.joining_date)
      throw new BadRequestException('Date of birth must precede joining date');
    if (dto.probation_ends_on && dto.probation_ends_on < dto.joining_date)
      throw new BadRequestException(
        'Probation must end on or after joining date',
      );
    if (
      existing?.termination_date &&
      dto.joining_date > existing.termination_date
    )
      throw new BadRequestException(
        'Joining date cannot follow termination date',
      );
    if (existing?.notice_date && dto.joining_date > existing.notice_date)
      throw new BadRequestException('Joining date cannot follow notice date');
    if (existing?.user_id && dto.email !== existing.email)
      throw new BadRequestException(
        'The invited login email cannot be changed through the employee profile',
      );
    for (const [key, schema] of [
      ['department_id', Department],
      ['designation_id', Designation],
      ['location_id', Location],
      ['work_schedule_id', WorkSchedule],
    ] as const) {
      if (!dto[key]) continue;
      const record = await manager
        .getRepository(schema)
        .findOneBy({ id: dto[key]!, tenant_id: tenantId });
      if (!record || (record.archived_at && existing?.[key] !== dto[key]))
        throw new BadRequestException(
          `Choose an available ${key.replace('_id', '')} in your company`,
        );
    }
    // Follow the manager chain under the tenant write lock. Reject self-reporting,
    // longer cycles, and an unavailable manager without exposing another tenant.
    let next = dto.manager_id;
    const visited = new Set([id]);
    while (next) {
      if (visited.has(next))
        throw new BadRequestException(
          'Reporting manager would create a circular hierarchy',
        );
      visited.add(next);
      const record = await manager
        .getRepository(Employee)
        .findOneBy({ id: next, tenant_id: tenantId, archived_at: IsNull() });
      if (!record || !['active', 'on_notice'].includes(String(record.status)))
        throw new BadRequestException(
          'Choose an active reporting manager in your company',
        );
      next = typeof record.manager_id === 'string' ? record.manager_id : null;
    }
  }
  create(user: Principal, dto: EmployeeProfileDto) {
    return this.write(user, async (manager, tenant) => {
      await this.accounts.checkCapacity(
        manager,
        user.tenantId!,
        Number(tenant.employee_limit),
      );
      const id = randomUUID();
      await this.validateProfile(manager, user.tenantId!, id, dto);
      await manager.getRepository(Employee).insert(
        Object.assign({}, dto, {
          id,
          tenant_id: user.tenantId,
          status: 'invited',
        }),
      );
      await this.audit(manager, user, id, 'employee.created', {
        status: 'invited',
      });
      return this.required(manager, user.tenantId!, id);
    });
  }
  update(user: Principal, id: string, dto: EmployeeProfileDto) {
    return this.write(user, async (manager) => {
      const existing = await this.required(manager, user.tenantId!, id);
      await this.validateProfile(manager, user.tenantId!, id, dto, existing);
      await manager
        .getRepository(Employee)
        .update({ id, tenant_id: user.tenantId }, Object.assign({}, dto));
      const changes = Object.keys(dto).filter(
        (key) =>
          JSON.stringify(existing[key]) !==
          JSON.stringify((dto as unknown as Record<string, unknown>)[key]),
      );
      const safe = AUDITED_EMPLOYMENT_FIELDS.filter((key) =>
        changes.includes(key),
      );
      await this.audit(manager, user, id, 'employee.updated', {
        changed_fields: changes,
        before: Object.fromEntries(safe.map((key) => [key, existing[key]])),
        after: Object.fromEntries(
          safe.map((key) => [
            key,
            (dto as unknown as Record<string, unknown>)[key],
          ]),
        ),
      });
      return this.required(manager, user.tenantId!, id);
    });
  }
  selfContact(user: Principal, dto: EmployeeContactDto) {
    return this.tenants.withTenant(user.tenantId!, async (manager) => {
      await this.accounts.lockTenant(manager, user.tenantId!);
      const self = await this.repository.findSelf(
        manager,
        user.tenantId!,
        user.id,
      );
      if (!self)
        throw new NotFoundException('Your employee profile is not available');
      await manager
        .getRepository(Employee)
        .update(
          { id: String(self.id), tenant_id: user.tenantId },
          Object.assign({}, dto),
        );
      await this.audit(
        manager,
        user,
        String(self.id),
        'employee.contact_updated',
        { changed_fields: ['phone', 'address', 'emergency_contact'] },
      );
      return { saved: true };
    });
  }
  changeStatus(user: Principal, id: string, dto: EmployeeStatusDto) {
    return this.write(user, async (manager, tenant) => {
      const employee = await this.required(manager, user.tenantId!, id);
      const occupying = (status: string) =>
        ['invited', 'active', 'on_notice'].includes(status);
      if (dto.status === 'invited' && employee.status !== 'invited')
        throw new BadRequestException(
          'An existing employee cannot return to Invited status',
        );
      if (!occupying(employee.status) && occupying(dto.status))
        await this.accounts.checkCapacity(
          manager,
          user.tenantId!,
          Number(tenant.employee_limit),
        );
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: String(tenant.timezone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const notice =
        dto.status === 'on_notice'
          ? dto.notice_date
          : ['inactive', 'terminated'].includes(dto.status)
            ? employee.notice_date
            : null;
      const termination =
        dto.status === 'terminated' ? dto.termination_date : null;
      if (notice && termination && termination < notice)
        throw new BadRequestException(
          'Termination date cannot precede notice date',
        );
      if (dto.status === 'on_notice' && !notice)
        throw new BadRequestException('Notice date is required');
      if (dto.status === 'terminated' && !termination)
        throw new BadRequestException('Termination date is required');
      for (const date of [notice, termination])
        if (date && (date < employee.joining_date || date > today))
          throw new BadRequestException(
            'Lifecycle dates must be between joining date and today; status changes take effect immediately',
          );
      if (!occupying(dto.status)) {
        const reports = await manager.getRepository(Employee).countBy({
          tenant_id: user.tenantId,
          manager_id: id,
          archived_at: IsNull(),
          status: In(['invited', 'active', 'on_notice']),
        });
        if (reports)
          throw new ConflictException(
            'Reassign this employee’s current direct reports before inactivation or termination',
          );
      }
      if (employee.user_id)
        await this.users.syncStatus(
          manager,
          user.tenantId!,
          employee.user_id,
          occupying(dto.status),
          Number(tenant.user_limit),
        );
      await manager.getRepository(Employee).update(
        { id, tenant_id: user.tenantId },
        {
          status: dto.status,
          notice_date: notice ?? null,
          termination_date: termination ?? null,
        },
      );
      await this.accounts.refreshCount(manager, user.tenantId!);
      await this.audit(manager, user, id, 'employee.status_changed', {
        before: {
          status: employee.status,
          notice_date: employee.notice_date,
          termination_date: employee.termination_date,
        },
        after: {
          status: dto.status,
          notice_date: notice ?? null,
          termination_date: termination ?? null,
        },
        reason: dto.reason,
      });
      return { saved: true };
    });
  }
  invite(user: Principal, id: string, dto: EmployeeInviteDto) {
    return this.write(user, async (manager, tenant) => {
      const employee = await this.required(manager, user.tenantId!, id);
      if (!['invited', 'active', 'on_notice'].includes(employee.status))
        throw new ConflictException(
          'Inactive or terminated employees cannot be invited',
        );
      if (!employee.email)
        throw new BadRequestException(
          'Add a work email before inviting this employee',
        );
      let userId = employee.user_id;
      if (!userId) {
        userId = await this.users.inviteIdentity(
          manager,
          user.tenantId!,
          `${employee.first_name} ${employee.last_name}`,
          employee.email,
          dto.role,
          Number(tenant.user_limit),
        );
        await manager
          .getRepository(Employee)
          .update({ id, tenant_id: user.tenantId }, { user_id: userId });
      }
      const invitation = await this.invitations.issue(
        manager,
        user.tenantId!,
        userId,
      );
      await this.audit(manager, user, id, 'employee.invited', {
        user_id: userId,
        ...(employee.user_id ? {} : { role: dto.role }),
      });
      return { invitation };
    });
  }
  readPrivate(user: Principal, id: string) {
    return this.tenants.withTenant(user.tenantId!, async (manager) => {
      const employee = await this.required(manager, user.tenantId!, id);
      if ((await this.access(manager, user, employee)) === 'team')
        throw new ForbiddenException(
          'Private employee details are not available to managers',
        );
      const data = await this.privateData.read(manager, user.tenantId!, id);
      await this.audit(manager, user, id, 'employee.private_viewed');
      return data;
    });
  }
  savePrivate(user: Principal, id: string, dto: EmployeePrivateDto) {
    return this.write(user, async (manager) => {
      await this.required(manager, user.tenantId!, id);
      await this.privateData.save(manager, user.tenantId!, id, dto);
      await this.audit(manager, user, id, 'employee.private_updated', {
        changed_fields: ['bank_details', 'statutory_identifiers'],
      });
      return { saved: true };
    });
  }
}
