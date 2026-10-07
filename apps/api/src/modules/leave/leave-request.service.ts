import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { HolidayService } from '../holidays/holiday.service';
import { Attendance } from '../attendance/attendance.schemas';
import { LeaveAttendanceService } from './leave-attendance.service';
import { EmployeeLeavePolicy, LeaveBalance, LeavePolicy, LeaveRequest, LeaveType } from './leave.schemas';
import { LeaveAccess } from './leave-access.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveApplicationDto, LeaveReasonDto, LeaveReviewDto } from './leave.dto';
import { daysOverlap, leaveDays, LeaveCalculation, LeaveDay } from './leave-calculation';

@Injectable()
export class LeaveRequestService {
  constructor(readonly access: LeaveAccess, readonly balances: LeaveBalanceService, readonly holidays: HolidayService, readonly attendance: LeaveAttendanceService) {}
  async calculate(manager: EntityManager, actor: Principal, dto: LeaveApplicationDto, timezone: string) {
    const employee = await this.access.employee(manager,actor);
    if (!['active','on_notice'].includes(employee.status)) throw new ForbiddenException('Leave applications require an active employee');
    if (dto.start_date < employee.joining_date || (employee.termination_date && dto.end_date > employee.termination_date)) throw new BadRequestException('Leave dates must be within employment dates');
    const policy = await manager.getRepository(LeavePolicy).findOneBy({tenant_id:actor.tenantId,id:dto.policy_id});
    if (!policy || policy.archived_at) throw new NotFoundException('Active policy not found');
    if (dto.start_date < String(policy.effective_from) || (policy.effective_to && dto.end_date > String(policy.effective_to))) throw new BadRequestException('Policy does not cover the selected dates');
    const type = await manager.getRepository(LeaveType).findOneBy({tenant_id:actor.tenantId,id:String(policy.leave_type_id),is_active:true});
    if (!type) throw new BadRequestException('Leave type is inactive');
    const assignment = await manager.getRepository(EmployeeLeavePolicy).createQueryBuilder('assignment').where('assignment.tenant_id = :tenantId AND assignment.employee_id = :employeeId AND assignment.policy_id = :policyId AND assignment.effective_from <= :from AND (assignment.effective_to IS NULL OR assignment.effective_to >= :to)',{tenantId:actor.tenantId,employeeId:employee.id,policyId:dto.policy_id,from:dto.start_date,to:dto.end_date}).getExists();
    if (!assignment) throw new ConflictException('HR must assign this policy for the selected leave year');
    const schedule = await this.access.workforce.schedule(manager,actor.tenantId!,employee,timezone);
    this.access.workforce.requireSchedule(schedule);
    const holidays = await this.holidays.applicableDates(manager,actor.tenantId!,employee.location_id,dto.start_date,dto.end_date);
    const days = leaveDays(dto.start_date,dto.end_date,dto.start_half,dto.end_half,schedule.working_days,holidays,Boolean(policy.exclude_non_working_days));
    const balance = await manager.getRepository(LeaveBalance).findOneBy({tenant_id:actor.tenantId,employee_id:employee.id,leave_type_id:String(policy.leave_type_id),period_start:`${dto.start_date.slice(0,4)}-01-01`});
    if (policy.balance_controlled && !balance) throw new ConflictException('HR must initialize the leave balance');
    const calculation: LeaveCalculation = {days,balance_id:policy.balance_controlled ? String(balance!.id) : null,balance_controlled:Boolean(policy.balance_controlled),is_paid:Boolean(policy.is_paid),timezone,working_days:schedule.working_days,holidays:[...holidays],exclude_non_working_days:Boolean(policy.exclude_non_working_days),policy_name:String(policy.name),start_time:schedule.start_time,end_time:schedule.end_time};
    await this.access.unlocked(manager,actor.tenantId!,dto.start_date,dto.end_date);
    const existing = await manager.getRepository(LeaveRequest).createQueryBuilder('request').where('request.tenant_id = :tenantId AND request.employee_id = :employeeId AND request.status IN (:...statuses) AND request.start_date <= :to AND request.end_date >= :from',{tenantId:actor.tenantId,employeeId:employee.id,statuses:['pending','approved'],from:dto.start_date,to:dto.end_date}).getMany();
    for (const request of existing) {
      const previous = (request.calculation as Partial<LeaveCalculation>).days;
      if (!previous || daysOverlap(days,previous)) throw new ConflictException('Dates overlap an existing pending or approved leave request');
    }
    await this.checkAttendance(manager,actor.tenantId!,employee.id,calculation);
    const units = days.reduce((sum,day)=>sum+day.units,0);
    if (policy.balance_controlled && this.balances.available(balance!) < units) throw new ConflictException('Insufficient available leave balance');
    return {employee,policy,calculation,units,available:policy.balance_controlled ? this.balances.available(balance!) : null};
  }
  async checkAttendance(manager: EntityManager, tenantId: string, employeeId: string, calculation: LeaveCalculation) {
    const days = calculation.days;
    const records = await manager.getRepository(Attendance).createQueryBuilder('attendance').where('attendance.tenant_id = :tenantId AND attendance.employee_id = :employeeId AND attendance.work_date IN (:...dates)',{tenantId,employeeId,dates:days.map(day=>day.date)}).getMany();
    for (const record of records) {
      if (!record.check_in) continue;
      const day = days.find(day=>day.date === record.work_date)!;
      this.attendance.assertCompatible([{...day,calculation}],new Date(String(record.check_in)),record.check_out ? new Date(String(record.check_out)) : null);
      // Open attendance cannot safely predict the remaining half's eventual checkout.
      if (!record.check_out) throw new ConflictException('Close or correct the open attendance before applying or approving leave');
    }
  }
  preview(actor: Principal, dto: LeaveApplicationDto) {
    return this.access.write(actor,async(manager,timezone)=>{
      const result = await this.calculate(manager,actor,dto,timezone);
      return {days:result.calculation.days,units:result.units,available:result.available,is_paid:result.calculation.is_paid,timezone};
    });
  }
  submit(actor: Principal, dto: LeaveApplicationDto) {
    return this.access.write(actor,async(manager,timezone)=>{
      const {employee,policy,calculation,units} = await this.calculate(manager,actor,dto,timezone);
      const id = randomUUID();
      await manager.getRepository(LeaveRequest).insert({id,tenant_id:actor.tenantId,employee_id:employee.id,leave_type_id:policy.leave_type_id,...dto,units,status:'pending',calculation});
      await this.balances.move(manager,actor,calculation.balance_id,id,units,'reserve');
      await this.access.audit(manager,actor,id,'requested',{employee_id:employee.id,units,calculation});
      return {id,status:'pending',units};
    });
  }
  async find(manager: EntityManager, actor: Principal, id: string) {
    const request = await manager.getRepository(LeaveRequest).findOneBy({tenant_id:actor.tenantId,id});
    if (!request) throw new NotFoundException('Leave request not found');
    const employee = await this.access.employee(manager,actor,String(request.employee_id));
    return {request,employee};
  }
  snapshot(request: Record<string,unknown>): LeaveCalculation {
    const calculation = request.calculation as Partial<LeaveCalculation>;
    if (!calculation.days) throw new ConflictException('Historical request needs HR reconciliation before its balance can change');
    return calculation as LeaveCalculation;
  }
  review(actor: Principal, id: string, dto: LeaveReviewDto) {
    this.access.requireReview(actor);
    return this.access.write(actor,async manager=>{
      const {request,employee} = await this.find(manager,actor,id);
      if (employee.user_id === actor.id) throw new ForbiddenException('You cannot review your own leave');
      if (request.status !== 'pending') throw new ConflictException('Only pending leave can be reviewed');
      const calculation = this.snapshot(request);
      if (dto.decision === 'approved') {
        await this.access.unlocked(manager,actor.tenantId!,String(request.start_date),String(request.end_date));
        if (!['active','on_notice'].includes(employee.status) || (employee.termination_date && String(request.end_date)>employee.termination_date)) throw new ConflictException('Employee is no longer eligible for these leave dates');
        await this.checkAttendance(manager,actor.tenantId!,employee.id,calculation);
      }
      await this.balances.move(manager,actor,calculation.balance_id,id,Number(request.units),dto.decision === 'approved' ? 'approve' : 'release');
      await manager.getRepository(LeaveRequest).update({tenant_id:actor.tenantId,id},{status:dto.decision,reviewer_id:actor.id,reviewed_at:new Date(),review_comment:dto.comment?.trim() || null});
      await this.access.audit(manager,actor,id,dto.decision,{units:Number(request.units),comment:dto.comment ?? null});
      return {id,status:dto.decision};
    });
  }
  cancel(actor: Principal, id: string, dto: LeaveReasonDto) {
    return this.access.write(actor,async manager=>{
      const {request,employee} = await this.find(manager,actor,id);
      if (request.status !== 'pending' && request.status !== 'approved') throw new ConflictException('Only pending or approved leave can be cancelled');
      if (!this.access.manages(actor) && (employee.user_id !== actor.id || request.status !== 'pending')) throw new ForbiddenException('Employees can cancel their own pending leave; approved cancellation requires HR');
      const calculation = this.snapshot(request);
      if (request.status === 'approved') await this.access.unlocked(manager,actor.tenantId!,String(request.start_date),String(request.end_date));
      await this.balances.move(manager,actor,calculation.balance_id,id,Number(request.units),request.status === 'approved' ? 'restore' : 'release');
      await manager.getRepository(LeaveRequest).update({tenant_id:actor.tenantId,id},{status:'cancelled',cancelled_at:new Date()});
      await this.access.audit(manager,actor,id,'cancelled',{previous_status:request.status,units:Number(request.units),reason:dto.reason});
      return {id,status:'cancelled'};
    });
  }
}
