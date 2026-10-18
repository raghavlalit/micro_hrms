import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { AttendanceDirectoryPage } from './attendance-directory-page';

describe('Attendance employee directory', () => {
  function setup(permissions = ['attendance.manage']) {
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: SessionService, useValue: { user: () => ({ permissions }) } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({search: 'Amit', page: '2', month: '2026-10'}) } } },
    ] });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AttendanceDirectoryPage);
    return { fixture, navigate, http: TestBed.inject(HttpTestingController) };
  }
  it('loads only active employees with server paging and preserves directory navigation', () => {
    const { fixture, http } = setup();
    const request = http.expectOne(r => r.url === '/api/v1/attendance/people');
    expect(request.request.params.get('active_only')).toBe('true');
    expect(request.request.params.get('page')).toBe('2');
    request.flush({ items: [{id: 'employee-1', name: 'Amit Kumar', employee_code: 'AT-003', status: 'active'}], total: 21 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Amit Kumar');
    expect(fixture.nativeElement.querySelector('a[aria-label="View attendance for Amit Kumar"]').getAttribute('href')).toContain('/attendance/employees/employee-1');
    expect(fixture.componentInstance.query).toEqual({search: 'Amit', month: '2026-10', page: 2});
    fixture.componentInstance.search = 'Nobody';
    fixture.componentInstance.load(true);
    const search = http.expectOne(r => r.params.get('search') === 'Nobody');
    expect(search.request.params.get('page')).toBe('1');
    search.flush({items: [], total: 0});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No active employees match');
    http.verify();
  });
  it('sends self-service users to their own attendance without requesting the directory', () => {
    const { navigate, http } = setup(['attendance.self']);
    expect(navigate).toHaveBeenCalledWith(['/attendance/me'], {replaceUrl: true});
    http.expectNone(r => r.url === '/api/v1/attendance/people');
    http.verify();
  });
});
