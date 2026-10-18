import {
  schema,
  uuid,
  text,
  timestamp,
  state,
  json,
  integer,
  unique,
  index,
  tenantFk,
} from '../../database/schema-helpers';
export const Notification = schema(
  'notifications',
  {
    recipient_id: uuid(),
    type: text(),
    title: text(),
    body: text(true),
    resource_type: text(true),
    resource_id: uuid(true),
    read_at: timestamp(true),
    event_key: text(),
  },
  {
    uniques: [unique('tenant_id', 'recipient_id', 'event_key')],
    foreignKeys: [tenantFk('users', 'recipient_id')],
    indices: [index('tenant_id', 'recipient_id', 'created_at')],
  },
);
// Transactional hand-off to BullMQ; payloads contain references, never secrets.
export const OutboxEvent = schema(
  'outbox_events',
  {
    event_type: text(),
    aggregate_id: uuid(),
    payload: json(),
    idempotency_key: text(),
    available_at: { ...timestamp(), default: () => 'CURRENT_TIMESTAMP' },
    processed_at: timestamp(true),
    attempts: integer(),
    delivery_status: state('pending'),
    last_error_code: text(true),
    encrypted_secret: text(true),
  },
  {
    uniques: [unique('tenant_id', 'idempotency_key')],
    checks: [
      {
        name: 'ck_notification_delivery_status',
        expression: "delivery_status IN ('pending','sent','skipped','failed')",
      },
    ],
    indices: [
      index('tenant_id', 'processed_at', 'available_at'),
      {
        name: 'ix_notification_dispatch',
        columns: ['available_at', 'id'],
        where:
          "event_type = 'notification.email' AND delivery_status = 'pending' AND processed_at IS NULL",
      },
    ],
  },
);
export const ExportJob = schema(
  'export_jobs',
  {
    requested_by: uuid(),
    report_type: text(),
    filters: json(),
    status: state('pending'),
    object_key: text(true),
    expires_at: timestamp(true),
    error_code: text(true),
  },
  {
    foreignKeys: [tenantFk('users', 'requested_by')],
    indices: [index('tenant_id', 'requested_by', 'created_at')],
  },
);
