import { Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DateAdapter } from '@angular/material/core';
import { FormsModule, NgForm, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MATERIAL_FORM_IMPORTS } from './material';
import { appConfig } from '../../app.config';

@Component({
  imports: [FormsModule, ReactiveFormsModule, ...MATERIAL_FORM_IMPORTS],
  template: `
    <form #form="ngForm">
      <mat-form-field
        ><mat-label>Joining date</mat-label>
        <input
          matInput
          [matDatepicker]="picker"
          name="date"
          [(ngModel)]="date"
          required
          min="2028-02-01"
          max="2028-02-29"
        />
        <mat-datepicker-toggle matIconSuffix [for]="picker" /><mat-datepicker #picker />
      </mat-form-field>
      <button type="submit" [disabled]="form.invalid">Save</button>
    </form>
    <mat-form-field
      ><mat-label>Leave date</mat-label>
      <input matInput [matDatepicker]="leavePicker" [formControl]="leave" />
      <mat-datepicker-toggle matIconSuffix [for]="leavePicker" /><mat-datepicker #leavePicker />
    </mat-form-field>
  `,
})
class CalendarTestForm {
  date: string | null = '2028-02-20';
  leave = new FormControl<string | null>('2028-02-20', Validators.required);
  form = viewChild.required(NgForm);
}

describe('Shared calendar controls', () => {
  it('provides the date adapter in the application environment used by dialog overlays', () => {
    TestBed.configureTestingModule({ providers: appConfig.providers });
    const adapter = TestBed.inject<DateAdapter<string>>(DateAdapter);
    expect(adapter.createDate(2028, 1, 29)).toBe('2028-02-29');
    expect(adapter.format('2028-02-29', 'iso')).toBe('2028-02-29');
  });
  it('keeps strict date-only strings and handles leap days and calendar arithmetic', () => {
    TestBed.configureTestingModule({ imports: [CalendarTestForm] });
    const fixture = TestBed.createComponent(CalendarTestForm);
    const adapter = fixture.debugElement.injector.get<DateAdapter<string>>(DateAdapter);
    expect(adapter.createDate(2028, 1, 29)).toBe('2028-02-29');
    expect(adapter.parse('2026-02-29', null)).toBe(adapter.invalid());
    expect(adapter.parse('02/03/2028', null)).toBe(adapter.invalid());
    expect(adapter.deserialize('2028-02-29T00:00:00Z')).toBe(adapter.invalid());
    expect(adapter.parse('', null)).toBeNull();
    expect(adapter.addCalendarDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(adapter.addCalendarMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(adapter.addCalendarYears('2028-02-29', 1)).toBe('2029-02-28');
    expect(adapter.format('2028-02-29', 'iso')).toBe('2028-02-29');
  });
  it('validates typed dates, limits, required values and disabled state in both form styles', async () => {
    TestBed.configureTestingModule({ imports: [CalendarTestForm] });
    const fixture = TestBed.createComponent(CalendarTestForm);
    await fixture.whenStable();
    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    const enter = async (index: number, value: string) => {
      inputs[index].value = value;
      inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
      inputs[index].dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    };
    await enter(0, '2028-02-29');
    expect(fixture.componentInstance.date).toBe('2028-02-29');
    expect(fixture.componentInstance.form().valid).toBe(true);
    await enter(0, '2028-03-01');
    expect(fixture.componentInstance.form().valid).toBe(false);
    await enter(0, '2028-02-30');
    expect(fixture.componentInstance.form().valid).toBe(false);
    await enter(0, '');
    expect(fixture.componentInstance.date).toBeNull();
    expect(fixture.componentInstance.form().valid).toBe(false);
    await enter(1, '2028-02-29');
    expect(fixture.componentInstance.leave.value).toBe('2028-02-29');
    await enter(1, 'invalid');
    expect(fixture.componentInstance.leave.hasError('matDatepickerParse')).toBe(true);
    fixture.componentInstance.leave.disable();
    await fixture.whenStable();
    expect(inputs[1].disabled).toBe(true);
  });
});
