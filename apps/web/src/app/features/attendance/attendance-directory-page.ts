import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AttendanceApi, attendanceError } from './attendance-api.service';
import { AttendancePerson } from './attendance.models';

@Component({
  imports: [FormsModule, RouterLink, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './attendance-directory-page.html',
  styleUrl: './attendance.scss',
})
export class AttendanceDirectoryPage {
  private readonly api = inject(AttendanceApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(SessionService);
  readonly people = signal<AttendancePerson[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly total = signal(0);
  search = this.route.snapshot.queryParamMap.get('search') ?? '';
  month = this.route.snapshot.queryParamMap.get('month') ?? '';
  page = Math.max(1, Number(this.route.snapshot.queryParamMap.get('page')) || 1);
  limit = 20;
  readonly selfAllowed = !!this.session.user()?.permissions.includes('attendance.self');
  readonly companyAccess = !!this.session.user()?.permissions.includes('attendance.manage');

  constructor() {
    if (
      !this.session
        .user()
        ?.permissions.some((p) => ['attendance.manage', 'attendance.approve.team'].includes(p))
    ) {
      void this.router.navigate(['/attendance/me'], { replaceUrl: true });
      return;
    }
    this.load();
  }
  get query() {
    return { search: this.search || undefined, month: this.month || undefined, page: this.page };
  }
  load(reset = false) {
    if (this.loading()) return;
    if (this.month && !/^(19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(this.month)) {
      this.error.set('Choose a valid month.');
      return;
    }
    if (reset) this.page = 1;
    this.loading.set(true);
    this.error.set('');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.query,
      replaceUrl: true,
    });
    this.api.people(this.search, this.page, this.limit, true).subscribe({
      next: (result) => {
        this.people.set(result.items);
        this.total.set(result.total);
        this.loading.set(false);
      },
      error: (error) => {
        this.people.set([]);
        this.total.set(0);
        this.error.set(attendanceError(error));
        this.loading.set(false);
      },
    });
  }
  step(direction: number) {
    this.page += direction;
    this.load();
  }
}
