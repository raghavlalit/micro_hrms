import { ConflictException, Injectable, Module } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { LeaveRequest } from './leave.schemas';
import type { LeaveCalculation, LeaveDay } from './leave-calculation';

/** Read-only interface consumed by attendance; leave remains the owner of request data. */
@Injectable()
export class LeaveAttendanceService {
  async approved(manager: EntityManager, tenantId: string, employeeId: string, from: string, to: string) {
    const requests = await manager.getRepository(LeaveRequest).createQueryBuilder('request')
      .where('request.tenant_id = :tenantId AND request.employee_id = :employeeId AND request.status = :status AND request.start_date <= :to AND request.end_date >= :from', {tenantId,employeeId,status:'approved',from,to})
      .getMany();
    return requests.flatMap(request => {
      const calculation = request.calculation as Partial<LeaveCalculation>;
      // Legacy requests without a snapshot must be reviewed rather than silently recalculated.
      if (!calculation.days) throw new ConflictException('Historical approved leave needs an HR calculation snapshot before attendance can change or be displayed');
      return calculation.days.filter(day => day.date >= from && day.date <= to).map(day => ({...day, request_id: String(request.id), calculation: calculation as LeaveCalculation}));
    });
  }
  assertCompatible(days: (LeaveDay & {calculation: LeaveCalculation})[], start: Date | null, end: Date | null) {
    for (const day of days) {
      if (day.units === 1 || !start) throw new ConflictException('Approved leave covers this attendance day. HR must cancel it before changing attendance.');
      const rules = day.calculation;
      const minutes = (time: string) => Number(time.slice(0,2))*60 + Number(time.slice(3,5));
      const midpoint = (minutes(rules.start_time) + minutes(rules.end_time))/2;
      const localMinute = (value: Date) => {
        const parts = new Intl.DateTimeFormat('en-GB',{timeZone:rules.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);
        return Number(parts.find(p=>p.type==='hour')!.value)*60+Number(parts.find(p=>p.type==='minute')!.value);
      };
      // AM/PM divide the assigned shift at its midpoint. The attendance pair must stay in the remaining half.
      if ((day.half === 'am' && localMinute(start) < midpoint) ||
        (day.half === 'pm' && (localMinute(start) >= midpoint || (end && localMinute(end) > midpoint)))) {
        throw new ConflictException('Attendance overlaps the approved half-day leave');
      }
    }
  }
  async checkWrite(manager: EntityManager, tenantId: string, employeeId: string, date: string, start: Date | null, end: Date | null) {
    this.assertCompatible(await this.approved(manager,tenantId,employeeId,date,date),start,end);
  }
}
@Module({providers:[LeaveAttendanceService],exports:[LeaveAttendanceService]})
export class LeaveAttendanceModule {}
