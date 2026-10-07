import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { LeaveApplication, LeaveCalendar, LeaveEntry, LeaveOverview, LeavePerson, LeavePolicyOption, LeavePreview, LeaveRequest } from './leave.models';
@Injectable({providedIn:'root'})
export class LeaveApi {
  private readonly http = inject(HttpClient);
  private readonly options = {headers:{'X-HRMS-Request':'1'}};
  overview(year: number, employeeId?: string) {return this.http.get<LeaveOverview>(employeeId ? `/api/v1/leave/employees/${employeeId}` : '/api/v1/leave/me',{params:{year}});}
  people(search: string,page=1) {return this.http.get<{items:LeavePerson[];total:number}>('/api/v1/leave/people',{params:{search,page,limit:50}});}
  policies() {return this.http.get<LeavePolicyOption[]>('/api/v1/leave/policies');}
  setup(employeeId: string,body: object) {return this.http.post(`/api/v1/leave/employees/${employeeId}/entitlements`,body,this.options);}
  adjust(id: string,body: object) {return this.http.post(`/api/v1/leave/balances/${id}/adjustments`,body,this.options);}
  entries(id: string,page: number) {return this.http.get<{items:LeaveEntry[];total:number}>(`/api/v1/leave/balances/${id}/entries`,{params:{page,limit:20}});}
  preview(body: LeaveApplication) {return this.http.post<LeavePreview>('/api/v1/leave/preview',body,this.options);}
  submit(body: LeaveApplication) {return this.http.post('/api/v1/leave/requests',body,this.options);}
  requests(scope: string,status: string,page: number) {return this.http.get<{items:LeaveRequest[];total:number}>('/api/v1/leave/requests',{params:{scope,page,limit:20,...(status ? {status} : {})}});}
  review(id: string,decision: string,comment: string) {return this.http.post(`/api/v1/leave/requests/${id}/review`,{decision,comment},this.options);}
  cancel(id: string,reason: string) {return this.http.post(`/api/v1/leave/requests/${id}/cancel`,{reason},this.options);}
  calendar(month: string) {return this.http.get<LeaveCalendar>('/api/v1/leave/calendar',{params:month ? {month} : {}});}
}
export function leaveError(error: unknown): string {
  if(error instanceof HttpErrorResponse) {const message = error.error?.message; if(Array.isArray(message)) return message.join('. '); if(typeof message === 'string') return message;}
  return error instanceof Error ? error.message : 'Leave request failed. Please try again.';
}
