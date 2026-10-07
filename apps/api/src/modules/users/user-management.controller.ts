import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { UserManagementService } from './user-management.service';
import { RoleManagementService } from './role-management.service';
import {
  AccessReasonDto,
  CreateRoleDto,
  InviteUserDto,
  RoleDetailsDto,
  UserListDto,
  UserRolesDto,
  UserStatusDto,
} from './user-access.dto';

@Controller('users')
@Access('tenant', 'roles.manage')
export class UserManagementController {
  constructor(private readonly users: UserManagementService) {}
  @Get() list(@Req() r: AuthRequest, @Query() dto: UserListDto) {
    return this.users.list(r.principal, dto);
  }
  @Post() invite(@Req() r: AuthRequest, @Body() dto: InviteUserDto) {
    return this.users.invite(r.principal, dto);
  }
  @Put(':id/roles') roles(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UserRolesDto,
  ) {
    return this.users.roles(r.principal, id, dto);
  }
  @Put(':id/status') status(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UserStatusDto,
  ) {
    return this.users.status(r.principal, id, dto);
  }
  @Post(':id/invitation') reinvite(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AccessReasonDto,
  ) {
    return this.users.reinvite(r.principal, id, dto);
  }
}

@Controller('roles')
@Access('tenant', 'roles.manage')
export class RoleManagementController {
  constructor(private readonly roles: RoleManagementService) {}
  @Get() catalog(@Req() r: AuthRequest) {
    return this.roles.catalog(r.principal);
  }
  @Post() create(@Req() r: AuthRequest, @Body() dto: CreateRoleDto) {
    return this.roles.create(r.principal, dto);
  }
  @Put(':id') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoleDetailsDto,
  ) {
    return this.roles.update(r.principal, id, dto);
  }
}
