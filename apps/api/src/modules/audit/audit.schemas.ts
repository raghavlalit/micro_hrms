import {
  schema,
  uuid,
  text,
  json,
  index,
  tenantFk,
} from '../../database/schema-helpers';
export const AuditLog = schema(
  'audit_logs',
  {
    actor_id: uuid(true),
    action: text(),
    entity_type: text(),
    entity_id: uuid(true),
    metadata: json(),
    request_id: text(true),
  },
  {
    foreignKeys: [tenantFk('users', 'actor_id')],
    indices: [
      index('tenant_id', 'created_at'),
      index('tenant_id', 'entity_type', 'entity_id'),
    ],
  },
);
