import { Module } from '@nestjs/common';
import { CompanyAdminService } from './company-admin.service';
import { EmployeeUserService } from './employee-user.service';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { InvitationsModule } from '../auth/invitations.module';
import { AccessPolicyService } from './access-policy.service';
import { UserManagementService } from './user-management.service';
import { RoleManagementService } from './role-management.service';
import {
  UserManagementController,
  RoleManagementController,
} from './user-management.controller';
@Module({
  imports: [TenantContextModule, InvitationsModule],
  controllers: [UserManagementController, RoleManagementController],
  providers: [
    CompanyAdminService,
    EmployeeUserService,
    AccessPolicyService,
    UserManagementService,
    RoleManagementService,
  ],
  exports: [CompanyAdminService, EmployeeUserService],
})
export class UsersModule {}
