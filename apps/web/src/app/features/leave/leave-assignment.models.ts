export interface AssignmentFilters {
  year: number;
  search?: string;
  department_id?: string;
  location_id?: string;
  policy_id?: string;
  status?: string;
  page: number;
  limit: number;
}
export interface AssignmentEmployee {
  id: string;
  name: string;
  employee_code: string;
  expected: number;
  assigned: number;
  status: string;
}
export interface AssignmentDirectory {
  items: AssignmentEmployee[];
  total: number;
  summary: Record<string, number>;
}
export interface AssignmentJob {
  policy_name: string;
  credited: number;
  reason: string;
  id: string;
  status: string;
  year: number;
  completed_units: number;
  total_units: number;
  error_code: string | null;
  counts: Record<string, number>;
  total: number;
  items: { id: string; name: string; employee_code: string; status: string }[];
}
