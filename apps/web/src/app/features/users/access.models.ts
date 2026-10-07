export interface AccessRole {
  id: string;
  code: string;
  name: string;
  permission_codes: string[];
  built_in: boolean;
  user_count: number;
  assigned_to_me: boolean;
  can_assign: boolean;
}
export interface Permission {
  code: string;
  description: string;
}
export interface RoleCatalog {
  roles: AccessRole[];
  permissions: Permission[];
}
export interface CompanyUser {
  id: string;
  display_name: string;
  email: string;
  status: 'active' | 'invited' | 'disabled';
  last_login_at: string | null;
  employee_id: string | null;
  employee_code: string | null;
  employee_status: string | null;
  roles: { id: string; name: string }[];
}
export interface AccessResult {
  id: string;
  invitation?: { token: string; expires_at: string };
}
