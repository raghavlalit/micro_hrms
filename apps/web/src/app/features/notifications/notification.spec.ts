import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NotificationPage } from './notification-page';
import { DeliveryPage } from './delivery-page';
import { NotificationApi, NotificationRow } from './notification-api.service';
describe('Notification center', () => {
  const row: NotificationRow = {
    id: 'notice',
    type: 'leave.approved',
    title: 'Leave request approved',
    body: 'Sign in to view details.',
    created_at: '2026-10-08T10:00:00Z',
    read_at: null,
    link: '/leave',
  };
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return TestBed.inject(HttpTestingController);
  }
  it('keeps read state unchanged when the API rejects the update', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new NotificationPage());
    http
      .expectOne('/api/v1/notifications?status=all&page=1&limit=20')
      .flush({ items: [row], total: 1, unread: 1 });
    page.read(row);
    const request = http.expectOne('/api/v1/notifications/notice/read');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ read: true });
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush({ message: 'Notification not found' }, { status: 404, statusText: 'Not found' });
    expect(page.rows()[0].read_at).toBeNull();
    expect(page.loading()).toBe(false);
    expect(page.error()).toContain('not found');
    expect(TestBed.inject(NotificationApi).unread()).toBe(1);
    http.verify();
  });
  it('refreshes the inbox and badge after marking all read', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new NotificationPage());
    http
      .expectOne((request) => request.url === '/api/v1/notifications')
      .flush({ items: [row], total: 1, unread: 1 });
    page.all();
    const update = http.expectOne('/api/v1/notifications/read-all');
    expect(update.request.body).toEqual({});
    update.flush({ updated: 1 });
    http
      .expectOne('/api/v1/notifications?status=all&page=1&limit=20')
      .flush({ items: [{ ...row, read_at: '2026-10-08T12:00:00Z' }], total: 1, unread: 0 });
    expect(TestBed.inject(NotificationApi).unread()).toBe(0);
    expect(page.notice()).toContain('marked read');
    http.verify();
  });
  it('removes stale rows on failed refresh and can retry', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new NotificationPage());
    http
      .expectOne((request) => request.url === '/api/v1/notifications')
      .flush({ items: [row], total: 1, unread: 1 });
    page.load();
    http
      .expectOne((request) => request.url === '/api/v1/notifications')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(page.rows()).toEqual([]);
    expect(page.error()).toContain('try again');
    page.load();
    http
      .expectOne((request) => request.url === '/api/v1/notifications')
      .flush({ items: [], total: 0, unread: 0 });
    http.verify();
  });
  it('shows invitation retry guidance without reporting success', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new DeliveryPage());
    const delivery = {
      id: 'delivery',
      notification_id: 'notice',
      status: 'failed',
      attempts: 5,
      error_code: 'SMTP_DELIVERY_FAILED',
      created_at: '2026-10-08T10:00:00Z',
      next_attempt_at: '2026-10-08T10:01:00Z',
      finished_at: null,
    };
    http
      .expectOne('/api/v1/notifications/deliveries?status=failed&page=1&limit=20')
      .flush({ items: [delivery], total: 1 });
    page.retry(delivery);
    const retry = http.expectOne('/api/v1/notifications/deliveries/delivery/retry');
    expect(retry.request.headers.get('X-HRMS-Request')).toBe('1');
    retry.flush(
      { message: 'Create a replacement invitation to send a fresh activation link' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(page.notice()).toBe('');
    expect(page.error()).toContain('replacement invitation');
    expect(page.loading()).toBe(false);
    http.verify();
  });
});
