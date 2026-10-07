import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Principal } from '../auth/auth.service';
import { Tenant } from '../tenants/tenant.schemas';
import { Employee } from '../employees/employee.schemas';
import { companyToday } from '../holidays/holiday-calendar';
import { monthDates } from '../attendance/attendance-calculation';
import { LeaveAccess } from './leave-access.service';
import { LeaveBalanceService } from './leave-balance.service';
import { EmployeeLeavePolicy, LeaveBalance, LeaveBalanceEntry, LeavePolicy, LeaveRequest, LeaveType } from './leave.schemas';
import { LeaveListDto } from './leave.dto';
import type { LeaveCalculation } from './leave-calculation';

@Injectable()
export class LeaveQueryService {
  constructor(readonly access: LeaveAccess, readonly balances: LeaveBalanceService) {}
  people(actor: Principal, dto: LeaveListDto) {
    this.access.requireReview(actor);
    return this.access.tenants.withTenant(actor.tenantId!,async manager=>{
      const query = this.access.workforce.employeeQuery(manager,actor.tenantId!);
      if (!this.access.manages(actor)) query.andWhere('employee.manager_id = :managerId',{managerId:(await this.access.workforce.self(manager,actor)).id});
      if (dto.search) query.andWhere('(employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.employee_code ILIKE :search)',{search:`%${dto.search.replace(/[\\%_]/g,'\\$&')}%`});
      const total = await query.getCount();
      const rows = await query.orderBy('employee.first_name','ASC').addOrderBy('employee.id','ASC').offset((dto.page-1)*dto.limit).limit(dto.limit).getRawMany();
      return {items:rows.map(row=>({id:row.id,name:`${row.first_name} ${row.last_name}`,employee_code:row.employee_code})),total};
    });
  }
  overview(actor: Principal, year?: number, employeeId?: string) {
    return this.access.tenants.withTenant(actor.tenantId!,async manager=>{
      const employee = await this.access.employee(manager,actor,employeeId);
      const tenant = await manager.getRepository(Tenant).findOneByOrFail({id:actor.tenantId});
      const today = companyToday(String(tenant.timezone));
      year ??= Number(today.slice(0,4));
      const rows = await manager.getRepository(LeaveBalance).createQueryBuilder('balance').innerJoin(LeaveType.options.name,'type','type.id = balance.leave_type_id AND type.tenant_id = balance.tenant_id').where('balance.tenant_id = :tenantId AND balance.employee_id = :employeeId AND balance.period_start = :from',{tenantId:actor.tenantId,employeeId:employee.id,from:`${year}-01-01`}).select(['balance.*','type.name AS type_name']).orderBy('type.name','ASC').getRawMany();
      const assignments = await manager.getRepository(EmployeeLeavePolicy).createQueryBuilder('assignment').innerJoin(LeavePolicy.options.name,'policy','policy.id = assignment.policy_id AND policy.tenant_id = assignment.tenant_id').innerJoin(LeaveType.options.name,'type','type.id = policy.leave_type_id AND type.tenant_id = policy.tenant_id').where('assignment.tenant_id = :tenantId AND assignment.employee_id = :employeeId AND assignment.effective_from <= :to AND (assignment.effective_to IS NULL OR assignment.effective_to >= :from)',{tenantId:actor.tenantId,employeeId:employee.id,from:`${year}-01-01`,to:`${year}-12-31`}).select(['policy.id AS policy_id','policy.name AS name','policy.leave_type_id AS leave_type_id','policy.balance_controlled AS balance_controlled','policy.is_paid AS is_paid','type.is_active AS is_active','assignment.effective_from::text AS effective_from','assignment.effective_to::text AS effective_to']).getRawMany();
      return {employee:{id:employee.id,name:`${employee.first_name} ${employee.last_name}`,employee_code:employee.employee_code},year,today,timezone:tenant.timezone,assignments,balances:rows.map(row=>({id:row.id,leave_type_id:row.leave_type_id,type_name:row.type_name,credited:Number(row.credited),adjusted:Number(row.adjusted),pending:Number(row.pending),used:Number(row.used),available:this.balances.available(row),balance_controlled:assignments.find(p=>p.leave_type_id===row.leave_type_id)?.balance_controlled ?? true}))};
    });
  }
  ledger(actor: Principal, id: string, dto: LeaveListDto) {
    return this.access.tenants.withTenant(actor.tenantId!,async manager=>{
      const balance = await manager.getRepository(LeaveBalance).findOneBy({tenant_id:actor.tenantId,id});
      if (!balance) throw new ForbiddenException('Balance unavailable');
      await this.access.employee(manager,actor,String(balance.employee_id));
      const query = manager.getRepository(LeaveBalanceEntry).createQueryBuilder('entry').where('entry.tenant_id = :tenantId AND entry.balance_id = :id',{tenantId:actor.tenantId,id});
      const total = await query.getCount();
      const items = await query.select(['entry.id AS id','entry.kind AS kind','entry.units AS units','entry.reason AS reason','entry.created_at AS created_at','entry.request_id AS request_id']).orderBy('entry.created_at','DESC').addOrderBy('entry.id','DESC').offset((dto.page-1)*dto.limit).limit(dto.limit).getRawMany();
      return {items,total};
    });
  }
  requests(actor: Principal, dto: LeaveListDto, calendarMonth?: string) {
    const scope = dto.scope ?? (this.access.reviews(actor) ? 'review' : 'mine');
    if (scope === 'review') this.access.requireReview(actor);
    else if (!actor.permissions.includes('leave.self')) throw new ForbiddenException('Leave self-service access required');
    return this.access.tenants.withTenant(actor.tenantId!,async manager=>{
      const query = manager.getRepository(LeaveRequest).createQueryBuilder('request').innerJoin(Employee.options.name,'employee','employee.id = request.employee_id AND employee.tenant_id = request.tenant_id').innerJoin(LeaveType.options.name,'type','type.id = request.leave_type_id AND type.tenant_id = request.tenant_id').where('request.tenant_id = :tenantId',{tenantId:actor.tenantId});
      if (scope === 'mine') query.andWhere('employee.user_id = :userId',{userId:actor.id});
      else if (!this.access.manages(actor)) query.andWhere('employee.manager_id = :managerId',{managerId:(await this.access.workforce.self(manager,actor)).id});
      if (dto.employee_id) query.andWhere('employee.id = :employeeId',{employeeId:dto.employee_id});
      if (dto.status) query.andWhere('request.status = :status',{status:dto.status});
      if (dto.year) query.andWhere('request.start_date >= :from AND request.start_date <= :to',{from:`${dto.year}-01-01`,to:`${dto.year}-12-31`});
      if (calendarMonth !== undefined) {
        const tenant = await manager.getRepository(Tenant).findOneByOrFail({id:actor.tenantId});
        const month = calendarMonth || companyToday(String(tenant.timezone)).slice(0,7);
        const dates = monthDates(month);
        query.andWhere('request.status = :approved AND request.start_date <= :last AND request.end_date >= :first',{approved:'approved',first:dates[0],last:dates.at(-1)});
        // Calendar deliberately omits reason, leave type, paid flag and review comments.
        const rows = await query.select(['request.id AS id','request.calculation AS calculation','employee.id AS employee_id','employee.first_name AS first_name','employee.last_name AS last_name']).orderBy('employee.first_name','ASC').getRawMany();
        return {month,items:rows.flatMap(row=>((row.calculation as LeaveCalculation).days ?? []).filter(day=>day.date.startsWith(month)).map(day=>({request_id:row.id,employee_id:row.employee_id,name:`${row.first_name} ${row.last_name}`,date:day.date,half:day.half,units:day.units})))};
      }
      const total = await query.getCount();
      const rows = await query.select(['request.id AS id','request.employee_id AS employee_id','request.start_date::text AS start_date','request.end_date::text AS end_date','request.start_half AS start_half','request.end_half AS end_half','request.units AS units','request.reason AS reason','request.status AS status','request.review_comment AS review_comment','request.reviewed_at AS reviewed_at','request.created_at AS created_at','type.name AS type_name','employee.first_name AS first_name','employee.last_name AS last_name','employee.user_id AS user_id']).orderBy('request.created_at','DESC').addOrderBy('request.id','DESC').offset((dto.page-1)*dto.limit).limit(dto.limit).getRawMany();
      return {items:rows.map(({user_id,first_name,last_name,...row})=>({...row,name:`${first_name} ${last_name}`,units:Number(row.units),can_review:row.status==='pending' && user_id!==actor.id && this.access.reviews(actor),can_cancel:['pending','approved'].includes(row.status) && (this.access.manages(actor) || (user_id===actor.id && row.status==='pending'))})),total};
    });
  }
}
