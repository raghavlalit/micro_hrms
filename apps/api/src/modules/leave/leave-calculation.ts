import { BadRequestException } from '@nestjs/common';
export interface LeaveDay { date: string; units: number; half: 'full' | 'am' | 'pm'; }
export interface LeaveCalculation {
  days: LeaveDay[];
  balance_id: string | null;
  balance_controlled: boolean;
  is_paid: boolean;
  timezone: string;
  working_days: number[];
  holidays: string[];
  exclude_non_working_days: boolean;
  policy_name: string;
  start_time: string;
  end_time: string;
}
export function leaveDays(start: string, end: string, startHalf: LeaveDay['half'], endHalf: LeaveDay['half'], workingDays: number[], holidays: Set<string>, exclude: boolean): LeaveDay[] {
  if (end < start || start.slice(0,4) !== end.slice(0,4)) throw new BadRequestException('Use an ordered date range within one calendar year');
  if (start === end && startHalf !== endHalf) throw new BadRequestException('For one day, select the same full day or half at both ends');
  if (start !== end && (startHalf === 'am' || endHalf === 'pm')) throw new BadRequestException('A multi-day request can start with PM and end with AM, or use full days');
  const result: LeaveDay[] = [];
  for (let day = new Date(start + 'T00:00:00Z'); day.toISOString().slice(0,10) <= end; day.setUTCDate(day.getUTCDate()+1)) {
    const date = day.toISOString().slice(0,10);
    if (exclude && (!workingDays.includes(day.getUTCDay()) || holidays.has(date))) continue;
    const half = date === start ? startHalf : date === end ? endHalf : 'full';
    result.push({date,half,units:half === 'full' ? 1 : 0.5});
  }
  if (!result.length) throw new BadRequestException('The selected range contains no chargeable leave days');
  return result;
}
export const roundDays = (value: number) => Math.round(value * 100) / 100;
export function daysOverlap(left: LeaveDay[], right: LeaveDay[]) {
  return left.some(a => right.some(b => a.date === b.date && (a.half === 'full' || b.half === 'full' || a.half === b.half)));
}
