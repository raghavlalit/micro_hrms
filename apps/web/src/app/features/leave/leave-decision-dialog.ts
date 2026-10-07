import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { LeaveApi, leaveError } from './leave-api.service';
import { LeaveRequest } from './leave.models';
@Component({imports:[FormsModule,MatDialogModule,...MATERIAL_FORM_IMPORTS],styleUrl:'./leave.scss',template:`
<h2 mat-dialog-title>{{data.cancel ? 'Cancel leave' : 'Review leave request'}}</h2>
<form #form="ngForm" (ngSubmit)="save(form)"><mat-dialog-content>
<p><strong>{{data.request.name}}</strong> · {{data.request.type_name}}</p><p>{{data.request.start_date}} ({{data.request.start_half}}) – {{data.request.end_date}} ({{data.request.end_half}}) · {{data.request.units}} day(s)</p>
<p class="reason">{{data.request.reason}}</p>
@if(error()) {<p class="message error" role="alert">{{error()}}</p>}
<div class="leave-form">
@if(!data.cancel) {<mat-form-field appearance="outline"><mat-label>Decision</mat-label><mat-select name="decision" [(ngModel)]="decision"><mat-option value="approved">Approve</mat-option><mat-option value="rejected">Reject</mat-option></mat-select></mat-form-field>}
@else {<p>Cancellation releases pending reservations or restores approved balance. This change is recorded in the audit log.</p>}
<mat-form-field appearance="outline"><mat-label>{{data.cancel ? 'Cancellation reason' : 'Comment (optional)'}}</mat-label><textarea matInput name="comment" [(ngModel)]="comment" rows="3" [required]="data.cancel" [minlength]="data.cancel ? 3 : 0" maxlength="500"></textarea></mat-form-field>
</div></mat-dialog-content><mat-dialog-actions align="end"><button mat-button type="button" mat-dialog-close [disabled]="busy()">Close</button><button mat-flat-button type="submit" [disabled]="busy()">{{data.cancel ? 'Confirm cancellation' : 'Save decision'}}</button></mat-dialog-actions></form>`})
export class LeaveDecisionDialog {
  readonly data=inject<{request:LeaveRequest;cancel:boolean}>(MAT_DIALOG_DATA);private readonly api=inject(LeaveApi);private readonly ref=inject(MatDialogRef<LeaveDecisionDialog>);
  readonly busy=signal(false);readonly error=signal('');decision='approved';comment='';
  save(form: NgForm) {if(form.invalid || this.busy() || (this.data.cancel && this.comment.trim().length<3)) {form.form.markAllAsTouched();return;}this.busy.set(true);this.ref.disableClose=true;this.error.set('');
    const request=this.data.cancel ? this.api.cancel(this.data.request.id,this.comment.trim()) : this.api.review(this.data.request.id,this.decision,this.comment.trim());
    request.subscribe({next:()=>this.ref.close(true),error:error=>{this.error.set(leaveError(error));this.busy.set(false);this.ref.disableClose=false;}});
  }
}
