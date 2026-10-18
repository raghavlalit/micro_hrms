// Audit writers may store confidential snapshots. Never return raw metadata.
// Only known operational fields with constrained value types are exposed here.
export function auditDetails(
  metadata: unknown,
): Record<string, string | number | boolean> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return {};
  const source = metadata as Record<string, unknown>;
  const result: Record<string, string | number | boolean> = {};
  for (const key of [
    'employee_id',
    'policy_id',
    'operation_id',
    'item_id',
    'line_id',
  ]) {
    const value = source[key];
    if (
      typeof value === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value,
      )
    )
      result[key] = value;
  }
  for (const key of ['count', 'row_count', 'version', 'employees', 'year']) {
    const value = source[key];
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
      result[key] = value;
  }
  if (typeof source.unpaid_leave_deduction === 'boolean')
    result.unpaid_leave_deduction = source.unpaid_leave_deduction;
  return result;
}
