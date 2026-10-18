import {
  schema,
  uuid,
  text,
  json,
  state,
  integer,
  timestamp,
  tenantFk,
} from '../../database/schema-helpers';
export const BackgroundJob = schema(
  'background_jobs',
  {
    requested_by: uuid(),
    kind: text(),
    resource_id: uuid(true),
    request_key: text(),
    request_hash: text(),
    payload: json(),
    result: json(),
    status: state('pending'),
    attempts: integer(),
    completed_units: integer(),
    total_units: integer(),
    error_code: text(true),
    lease_token: uuid(true),
    available_at: { ...timestamp(), default: () => 'CURRENT_TIMESTAMP' },
    started_at: timestamp(true),
    completed_at: timestamp(true),
    expires_at: timestamp(true),
  },
  {
    uniques: [
      {
        name: 'uq_background_jobs_tenant_id_kind_request_key',
        columns: ['tenant_id', 'kind', 'request_key'],
      },
    ],
    foreignKeys: [
      {
        ...tenantFk('users', 'requested_by'),
        name: 'fk_background_jobs_requested_by',
      },
    ],
    indices: [
      {
        name: 'ix_background_jobs_tenant_id_requested_by_created_at',
        columns: ['tenant_id', 'requested_by', 'created_at'],
      },
      {
        name: 'ix_background_jobs_status_available_at',
        columns: ['status', 'available_at'],
      },
    ],
    checks: [
      {
        name: 'ck_background_job_kind',
        expression: "kind IN ('payslips','report_export','leave_assignment')",
      },
      {
        name: 'ck_background_job_status',
        expression:
          "status IN ('draft','pending','running','completed','failed','expired')",
      },
    ],
  },
);
export interface JobRecord {
  id: string;
  tenant_id: string;
  requested_by: string;
  kind: 'payslips' | 'report_export' | 'leave_assignment';
  resource_id: string | null;
  request_key: string;
  request_hash: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  status: string;
  attempts: number;
  completed_units: number;
  total_units: number;
  error_code: string | null;
  lease_token: string | null;
  available_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
}
