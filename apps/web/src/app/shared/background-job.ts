export interface BackgroundJobView {
  id: string;
  kind: 'payslips' | 'report_export';
  resource_id: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'expired';
  attempts: number;
  completed_units: number;
  total_units: number;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
  report_type?: string;
}
export function jobError(code: string | null) {
  const messages: Record<string, string> = {
    ACCESS_CHANGED: 'Account permissions or team access changed. Check access before retrying.',
    EXPORT_TOO_LARGE:
      'The export exceeds 100,000 rows or 50 MiB. Narrow the filters and create a new export.',
    RESOURCE_UNAVAILABLE: 'The source record is no longer available.',
    INPUT_CHANGED: 'The source data or job changed. Refresh and check the current settings.',
    GENERATION_FAILED: 'Generation failed. Try again or contact your administrator.',
    WORKER_INTERRUPTED: 'Generation was interrupted. Please retry.',
  };
  return code ? (messages[code] ?? 'Generation failed. Please retry.') : '';
}
