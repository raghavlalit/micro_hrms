import * as tenants from '../modules/tenants/tenant.schemas';
import * as users from '../modules/users/user.schemas';
import * as organization from '../modules/organization/organization.schemas';
import * as employees from '../modules/employees/employee.schemas';
import * as attendance from '../modules/attendance/attendance.schemas';
import * as holidays from '../modules/holidays/holiday.schemas';
import * as leave from '../modules/leave/leave.schemas';
import * as payroll from '../modules/payroll/payroll.schemas';
import * as documents from '../modules/documents/document.schemas';
import * as notifications from '../modules/notifications/notification.schemas';
import * as audit from '../modules/audit/audit.schemas';
import * as auth from '../modules/auth/auth.schemas';
import * as platform from '../modules/platform/platform.schemas';
export const entities = [
  tenants,
  users,
  organization,
  employees,
  attendance,
  holidays,
  leave,
  payroll,
  documents,
  notifications,
  audit,
  auth,
  platform,
].flatMap(Object.values);
