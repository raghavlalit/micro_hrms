import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { EmployeeLeavePolicy, LeaveBalance, LeaveBalanceEntry, LeavePolicy, LeaveType } from './leave.schemas';
import { LeaveAccess } from './leave-access.service';
import { LeaveAdjustmentDto, LeaveEntitlementDto } from './leave.dto';
import { roundDays } from './leave-calculation';

@Injectable()
export class LeaveBalanceService {
  constructor(readonly access: LeaveAccess) {}
  async entry(manager: EntityManager, actor: Principal, balanceId: string, kind: string, units: number, reason: string, key: string, requestId?: string) {
    if (!units) return;
    await manager.getRepository(LeaveBalanceEntry).insert({tenant_id:actor.tenantId,balance_id:balanceId,request_id:requestId ?? null,actor_id:actor.id,kind,units,reason,idempotency_key:key});
  }
  available(balance: Record<string,unknown>) { return roundDays(Number(balance.credited)+Number(balance.adjusted)-Number(balance.used)-Number(balance.pending)); }
  setup(actor: Principal, employeeId: string, dto: LeaveEntitlementDto) {
    return this.access.write(actor,async manager => {
      const employee = await this.access.employee(manager,actor,employeeId);
      const policy = await manager.getRepository(LeavePolicy).findOneBy({tenant_id:actor.tenantId,id:dto.policy_id});
      if (!policy || policy.archived_at) throw new NotFoundException('Active policy not found');
      const type = await manager.getRepository(LeaveType).findOneBy({tenant_id:actor.tenantId,id:String(policy.leave_type_id),is_active:true});
      if (!type) throw new BadRequestException('Leave type is inactive');
      const from = `${dto.year}-01-01`, to = `${dto.year}-12-31`;
      const effectiveFrom = [from,String(policy.effective_from),employee.joining_date].sort().at(-1)!;
      const effectiveTo = [to,...(policy.effective_to ? [String(policy.effective_to)] : []),...(employee.termination_date ? [employee.termination_date] : [])].sort()[0];
      if (effectiveFrom > effectiveTo) throw new BadRequestException('Policy and employment dates do not cover this year');
      const existing = await manager.getRepository(LeaveBalance).findOneBy({tenant_id:actor.tenantId,employee_id:employeeId,leave_type_id:String(policy.leave_type_id),period_start:from});
      if (existing) throw new ConflictException('This leave type already has an entitlement for this employee/year');
      const credited = dto.credited ?? Number(policy.annual_entitlement);
      if (!policy.balance_controlled && (credited !== 0 || dto.carry_forward !== 0)) throw new BadRequestException('Uncontrolled leave uses zero credit and no carry-forward');
      const id = randomUUID();
      await manager.getRepository(LeaveBalance).insert({id,tenant_id:actor.tenantId,employee_id:employeeId,leave_type_id:policy.leave_type_id,period_start:from,period_end:to,credited,used:0,pending:0,adjusted:dto.carry_forward});
      await manager.getRepository(EmployeeLeavePolicy).insert({tenant_id:actor.tenantId,employee_id:employeeId,policy_id:dto.policy_id,effective_from:effectiveFrom,effective_to:effectiveTo});
      await this.entry(manager,actor,id,'credit',credited,dto.reason,`entitlement:${id}`);
      if (dto.carry_forward) {
        if (!policy.carry_forward_enabled) throw new BadRequestException('Carry-forward is disabled for this policy');
        const previous = await manager.getRepository(LeaveBalance).findOneBy({tenant_id:actor.tenantId,employee_id:employeeId,leave_type_id:String(policy.leave_type_id),period_start:`${dto.year-1}-01-01`});
        if (!previous || Number(previous.pending) !== 0 || this.available(previous) < dto.carry_forward) throw new ConflictException('Previous year must have sufficient available balance and no pending requests');
        await manager.getRepository(LeaveBalance).update({id:String(previous.id),tenant_id:actor.tenantId},{adjusted:roundDays(Number(previous.adjusted)-dto.carry_forward)});
        await this.entry(manager,actor,String(previous.id),'adjust',-dto.carry_forward,dto.reason,`carry-out:${id}`);
        await this.entry(manager,actor,id,'adjust',dto.carry_forward,dto.reason,`carry-in:${id}`);
      }
      await this.access.audit(manager,actor,id,'entitlement_created',{employee_id:employeeId,policy_id:dto.policy_id,year:dto.year,credited,carry_forward:dto.carry_forward,reason:dto.reason});
      return {id,credited,available:roundDays(credited+dto.carry_forward)};
    });
  }
  adjust(actor: Principal, id: string, dto: LeaveAdjustmentDto) {
    return this.access.write(actor,async manager => {
      const balance = await manager.getRepository(LeaveBalance).findOneBy({tenant_id:actor.tenantId,id});
      if (!balance) throw new NotFoundException('Balance not found');
      if (!dto.units) throw new BadRequestException('Adjustment cannot be zero');
      const key = `adjust:${dto.operation_id}`;
      const existing = await manager.getRepository(LeaveBalanceEntry).findOneBy({tenant_id:actor.tenantId,idempotency_key:key});
      if (existing) {
        if (existing.balance_id !== id || Number(existing.units) !== dto.units || existing.reason !== dto.reason) throw new ConflictException('Operation ID already used for a different adjustment');
        return {id,available:this.available(balance),replayed:true};
      }
      if (this.available(balance)+dto.units < 0) throw new ConflictException('Adjustment would make available balance negative');
      await manager.getRepository(LeaveBalance).update({id,tenant_id:actor.tenantId},{adjusted:roundDays(Number(balance.adjusted)+dto.units)});
      await this.entry(manager,actor,id,'adjust',dto.units,dto.reason,key);
      await this.access.audit(manager,actor,id,'balance_adjusted',{units:dto.units,reason:dto.reason,operation_id:dto.operation_id});
      return {id,available:roundDays(this.available(balance)+dto.units)};
    });
  }
  async move(manager: EntityManager, actor: Principal, balanceId: string | null, requestId: string, units: number, action: 'reserve'|'approve'|'release'|'restore') {
    if (!balanceId) return; // Uncontrolled policies record usage in requests, not a fictitious capped balance.
    const balance = await manager.getRepository(LeaveBalance).findOneByOrFail({tenant_id:actor.tenantId,id:balanceId});
    if (action === 'reserve' && this.available(balance) < units) throw new ConflictException('Insufficient available leave balance');
    const pending = roundDays(Number(balance.pending) + (action === 'reserve' ? units : ['approve','release'].includes(action) ? -units : 0));
    const used = roundDays(Number(balance.used) + (action === 'approve' ? units : action === 'restore' ? -units : 0));
    if (pending < 0 || used < 0) throw new ConflictException('Leave balance requires HR reconciliation');
    await manager.getRepository(LeaveBalance).update({tenant_id:actor.tenantId,id:balanceId},{pending,used});
    if (action === 'approve') await this.entry(manager,actor,balanceId,'release',units,'Approved reservation',`${requestId}:approval-release`,requestId);
    await this.entry(manager,actor,balanceId,action === 'approve' ? 'use' : action,units,`Leave request ${action}`,`${requestId}:${action}`,requestId);
  }
}
