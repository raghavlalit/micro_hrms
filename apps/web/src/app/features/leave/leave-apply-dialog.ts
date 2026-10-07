import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { LeaveApi, leaveError } from './leave-api.service';
import { LeaveOverview, LeavePreview } from './leave.models';
@Component({imports:[ReactiveFormsModule,DatePipe,MatDialogModule,...MATERIAL_FORM_IMPORTS],templateUrl:'./leave-apply-dialog.html',styleUrl:'./leave.scss'})
export class LeaveApplyDialog {
  readonly data = inject<LeaveOverview>(MAT_DIALOG_DATA);
  private readonly api = inject(LeaveApi);
  private readonly ref = inject(MatDialogRef<LeaveApplyDialog>);
  readonly busy = signal(false); readonly error = signal(''); readonly preview = signal<LeavePreview|null>(null);
  readonly form = inject(NonNullableFormBuilder).group({policy_id:['',Validators.required],start_date:['',Validators.required],end_date:['',Validators.required],start_half:['full'],end_half:['full'],reason:['',[Validators.required,Validators.minLength(3),Validators.maxLength(500)]]});
  constructor() { this.form.valueChanges.subscribe(()=>this.preview.set(null)); }
  calculate() {
    if(this.form.invalid || this.busy()) {this.form.markAllAsTouched();return;}
    this.busy.set(true);this.error.set('');this.ref.disableClose=true;
    this.api.preview({...this.form.getRawValue(),reason:this.form.controls.reason.value.trim()}).subscribe({next:result=>{this.preview.set(result);this.done();},error:error=>{this.error.set(leaveError(error));this.done();}});
  }
  submit() {
    if(!this.preview() || this.form.invalid || this.busy()) return;
    this.busy.set(true);this.error.set('');this.ref.disableClose=true;
    this.api.submit({...this.form.getRawValue(),reason:this.form.controls.reason.value.trim()}).subscribe({next:()=>this.ref.close(true),error:error=>{this.error.set(leaveError(error));this.preview.set(null);this.done();}});
  }
  private done() {this.busy.set(false);this.ref.disableClose=false;}
}
