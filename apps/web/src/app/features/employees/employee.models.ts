export interface EmployeeAddress {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}
export interface EmployeeContact {
  phone: string | null;
  address: EmployeeAddress;
  emergency_contact: { name: string; relationship: string; phone: string };
}
export interface EmployeeProfile extends EmployeeContact {
  employee_code: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  email: string | null;
  joining_date: string;
  employment_type: string;
  department_id: string | null;
  designation_id: string | null;
  location_id: string | null;
  manager_id: string | null;
  work_schedule_id: string | null;
  probation_ends_on: string | null;
}
export interface Employee extends EmployeeProfile {
  id: string;
  user_id?: string | null;
  status: string;
  notice_date?: string | null;
  termination_date?: string | null;
  department_name?: string;
  designation_name?: string;
  location_name?: string;
  manager_name?: string;
  work_schedule_name?: string;
  account_status?: string | null;
}
export interface EmployeeDetail {
  employee: Employee;
  access: 'manage' | 'self' | 'team';
  private_data_available: boolean;
}
export interface EmployeeList {
  items: Employee[];
  total: number;
  page: number;
  limit: number;
  can_manage: boolean;
}
export interface Lookup {
  id: string;
  name: string;
}
export interface EmployeeLookups {
  departments: Lookup[];
  designations: Lookup[];
  locations: Lookup[];
  managers: Lookup[];
  work_schedules: Lookup[];
}
export interface PrivateField {
  label: string;
  value: string;
}
export interface EmployeePrivate {
  bank_details: PrivateField[];
  statutory_identifiers: PrivateField[];
}
export const employeeStatuses = ['invited', 'active', 'on_notice', 'inactive', 'terminated'];
export const emptyContact = (): EmployeeContact => ({
  phone: '',
  address: { line1: '', line2: '', city: '', state: '', postal_code: '', country: '' },
  emergency_contact: { name: '', relationship: '', phone: '' },
});
export const emptyEmployee = (): EmployeeProfile => ({
  ...emptyContact(),
  employee_code: '',
  first_name: '',
  last_name: '',
  date_of_birth: null,
  email: null,
  joining_date: '',
  employment_type: 'Full-time',
  department_id: null,
  designation_id: null,
  location_id: null,
  manager_id: null,
  work_schedule_id: null,
  probation_ends_on: null,
});
// Whitelist writable fields. Never send joined names, status or account IDs back.
export function editableProfile(employee: Employee): EmployeeProfile {
  const defaults = emptyEmployee();
  for (const key of Object.keys(defaults) as (keyof EmployeeProfile)[])
    Object.assign(defaults, { [key]: employee[key] ?? defaults[key] });
  defaults.address = { ...emptyContact().address, ...employee.address };
  defaults.emergency_contact = {
    ...emptyContact().emergency_contact,
    ...employee.emergency_contact,
  };
  return defaults;
}
