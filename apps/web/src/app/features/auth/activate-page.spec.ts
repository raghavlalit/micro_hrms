import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ActivatePage } from './activate-page';
describe('Administrator activation', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [ActivatePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { fragment: 'test-token' } } },
      ],
    }),
  );
  it('removes the token from the URL and only sends it in the activation body', () => {
    window.history.replaceState(null, '', '/activate#test-token');
    const fixture = TestBed.createComponent(ActivatePage),
      http = TestBed.inject(HttpTestingController),
      page = fixture.componentInstance;
    expect(window.location.hash).toBe('');
    page.password = 'A long test password';
    page.confirmation = 'different';
    page.activate();
    http.expectNone('/api/v1/auth/activate');
    page.confirmation = page.password;
    page.activate();
    const request = http.expectOne('/api/v1/auth/activate');
    expect(request.request.body.token).toBe('test-token');
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush({ message: 'Activated' });
    expect(page.done()).toBe(true);
    expect(page.token).toBe('');
    expect(page.password).toBe('');
    http.verify();
  });
});
