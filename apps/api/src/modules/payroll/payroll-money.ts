import { BadRequestException } from '@nestjs/common';
// Money never passes through Number/parseFloat. Only dates and half-day counts use numbers.
export function cents(value: string): bigint {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value))
    throw new BadRequestException(
      'Money must be a nonnegative decimal string with at most two places',
    );
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function money(value: bigint): string {
  if (value < 0n || value > 999999999999999999n)
    throw new BadRequestException(
      'Payroll amount is outside the supported nonnegative range',
    );
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
export function divideRounded(value: bigint, denominator: bigint): bigint {
  if (value < 0n || denominator <= 0n)
    throw new BadRequestException('Invalid proration inputs');
  return (value + denominator / 2n) / denominator;
}
export function datesInMonth(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );
}
export function previousDate(date: string) {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
