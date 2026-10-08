import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntitySchema, QueryFailedError } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { LeaveAccess } from './leave-access.service';
import { EmployeeLeavePolicy, LeavePolicy, LeaveType } from './leave.schemas';
import { LeavePolicyDto, LeaveTypeDto } from './leave-settings.dto';

@Injectable()
export class LeaveSettingsService {
  constructor(readonly access: LeaveAccess) {}
  async save(
    actor: Principal,
    schema: EntitySchema<Record<string, unknown>>,
    dto: LeavePolicyDto | LeaveTypeDto,
    id?: string,
  ) {
    try {
      return await this.access.write(actor, async (manager) => {
        const repository = manager.getRepository(schema);
        const previous = id
          ? await repository.findOneBy({ tenant_id: actor.tenantId, id })
          : null;
        if (id && !previous)
          throw new NotFoundException('Leave setting not found');
        if (schema === LeavePolicy) {
          const policy = dto as LeavePolicyDto;
          if (
            policy.effective_to &&
            policy.effective_to < policy.effective_from
          )
            throw new BadRequestException('Policy end must follow its start');
          const type = await manager
            .getRepository(LeaveType)
            .findOneBy({ tenant_id: actor.tenantId, id: policy.leave_type_id });
          if (!type)
            throw new BadRequestException(
              'Leave type must belong to this company',
            );
          if (
            id &&
            (await manager
              .getRepository(EmployeeLeavePolicy)
              .existsBy({ tenant_id: actor.tenantId, policy_id: id }))
          ) {
            // Assigned policies retain their financial identity; request snapshots preserve calculation rules.
            if (
              previous!.leave_type_id !== policy.leave_type_id ||
              previous!.balance_controlled !== policy.balance_controlled
            )
              throw new ConflictException(
                'An assigned policy cannot change its leave type or balance control. Create a new policy for a future year.',
              );
          }
        }
        let recordId = id;
        const values: object = dto; // Validated DTO contains only editable columns.
        if (recordId)
          await repository.update(
            { tenant_id: actor.tenantId, id: recordId },
            { ...values },
          );
        else {
          const inserted = await repository.insert({
            tenant_id: actor.tenantId,
            ...values,
          });
          recordId = String(inserted.identifiers[0].id);
        }
        await this.access.audit(
          manager,
          actor,
          recordId!,
          id ? 'setting_updated' : 'setting_created',
          { table: schema.options.name, before: previous, after: dto },
        );
        return repository.findOneByOrFail({
          tenant_id: actor.tenantId,
          id: recordId,
        });
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException('This leave code already exists');
      throw error;
    }
  }
}
