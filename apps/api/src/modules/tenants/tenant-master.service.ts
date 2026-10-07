import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntitySchema, QueryFailedError } from 'typeorm';
import { TenantDatabaseService } from './tenant-database.service';
import { AuditLog } from '../audit/audit.schemas';

/** Shared persistence for small master tables. Domain controllers choose the schema and DTO. */
@Injectable()
export class TenantMasterService {
  constructor(private readonly tenants: TenantDatabaseService) {}
  list(tenantId: string, schema: EntitySchema<Record<string, unknown>>) {
    return this.tenants.withTenant(tenantId, (manager) =>
      manager
        .getRepository(schema)
        .createQueryBuilder('record')
        .orderBy('record.created_at', 'ASC')
        .addOrderBy('record.id', 'ASC')
        .getMany(),
    );
  }
  async save(
    tenantId: string,
    actorId: string,
    schema: EntitySchema<Record<string, unknown>>,
    dto: object,
    id?: string,
  ) {
    try {
      return await this.tenants.withTenant(tenantId, async (manager) => {
        const repository = manager.getRepository(schema);
        const values = { ...dto }; // DTOs exclude tenant_id, id and system-managed columns.
        let recordId = id;
        if (recordId) {
          const result = await repository.update(
            { id: recordId, tenant_id: tenantId },
            values,
          );
          if (!result.affected) throw new NotFoundException('Record not found');
        } else {
          const result = await repository.insert({
            ...values,
            tenant_id: tenantId,
          });
          recordId = String(result.identifiers[0].id);
        }
        await manager
          .getRepository(AuditLog)
          .insert({
            tenant_id: tenantId,
            actor_id: actorId,
            action: id ? 'master.updated' : 'master.created',
            entity_type: schema.options.name,
            entity_id: recordId,
          });
        return repository.findOneByOrFail({ id: recordId });
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error.driverError as { code?: string }).code;
        if (code === '23505')
          throw new ConflictException(
            'This code or record already exists in your company',
          );
        if (code === '23503')
          throw new BadRequestException(
            'Referenced record must belong to your company',
          );
        if (code === '23514' || code === '22007' || code === '22008')
          throw new BadRequestException(
            'The supplied values do not form a valid policy or schedule',
          );
      }
      throw error;
    }
  }
}
