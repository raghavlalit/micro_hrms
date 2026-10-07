import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { EmployeeApi, employeeError } from './employee-api.service';
import { EmployeeContact, EmployeeDetail, EmployeePrivate, emptyContact } from './employee.models';
import { EmployeeContactFields } from './employee-contact-fields';
import { EmployeeStatusDialog } from './employee-status-dialog';
import { EmployeeInviteDialog } from './employee-invite-dialog';

@Component({
  imports: [FormsModule, RouterLink, EmployeeContactFields, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './employee-detail-page.html',
  styleUrl: './employees.scss',
})
export class EmployeeDetailPage {
  private readonly api = inject(EmployeeApi);
  private readonly dialog = inject(MatDialog);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? 'me';
  readonly detail = signal<EmployeeDetail | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly failed = signal(false);
  readonly invitation = signal('');
  readonly invitationExpiry = signal('');
  readonly editingContact = signal(false);
  readonly privateData = signal<EmployeePrivate | null>(null);
  readonly privateSections = [
    { key: 'bank_details', label: 'Bank details' },
    { key: 'statutory_identifiers', label: 'Tax & statutory identifiers' },
  ] as const;
  contact: EmployeeContact = emptyContact();
  constructor() {
    this.load();
  }
  load() {
    this.loading.set(true);
    this.privateData.set(null);
    this.api.detail(this.id).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.contact = {
          phone: detail.employee.phone ?? '',
          address: { ...emptyContact().address, ...detail.employee.address },
          emergency_contact: {
            ...emptyContact().emergency_contact,
            ...detail.employee.emergency_contact,
          },
        };
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.fail(error);
      },
    });
  }
  changeStatus() {
    const employee = this.detail()!.employee;
    this.dialog
      .open(EmployeeStatusDialog, { width: '480px', data: employee })
      .afterClosed()
      .subscribe((result) => {
        if (!result || this.busy()) return;
        this.begin();
        this.api.status(employee.id, result).subscribe({
          next: () => {
            this.done('Employee status updated.');
            this.load();
          },
          error: (error) => this.fail(error),
        });
      });
  }
  invite() {
    const employee = this.detail()!.employee;
    this.dialog
      .open(EmployeeInviteDialog, { width: '480px', data: employee })
      .afterClosed()
      .subscribe((role) => {
        if (!role || this.busy()) return;
        this.begin();
        this.invitation.set('');
        this.api.invite(employee.id, role).subscribe({
          next: (result) => {
            this.invitation.set(`${window.location.origin}/activate#${result.invitation.token}`);
            this.invitationExpiry.set(new Date(result.invitation.expires_at).toLocaleString());
            this.done('Invitation created. Share the activation link securely.');
            this.load();
          },
          error: (error) => this.fail(error),
        });
      });
  }
  saveContact() {
    if (this.busy()) return;
    this.begin();
    this.api.saveContact(this.contact).subscribe({
      next: () => {
        this.editingContact.set(false);
        this.done('Contact details saved.');
        this.load();
      },
      error: (error) => this.fail(error),
    });
  }
  revealPrivate() {
    if (this.busy()) return;
    this.begin();
    this.api.privateDetails(this.detail()!.employee.id).subscribe({
      next: (data) => {
        this.privateData.set(data);
        this.busy.set(false);
      },
      error: (error) => this.fail(error),
    });
  }
  savePrivate() {
    if (this.busy() || !this.privateData()) return;
    this.begin();
    this.api.savePrivate(this.detail()!.employee.id, this.privateData()!).subscribe({
      next: () => {
        this.privateData.set(null);
        this.done('Protected details saved.');
      },
      error: (error) => this.fail(error),
    });
  }
  address() {
    return (
      Object.values(this.detail()?.employee.address ?? {})
        .filter(Boolean)
        .join(', ') || 'Not provided'
    );
  }
  private begin() {
    this.busy.set(true);
    this.message.set('');
    this.failed.set(false);
  }
  private done(message: string) {
    this.busy.set(false);
    this.message.set(message);
    this.failed.set(false);
  }
  private fail(error: Parameters<typeof employeeError>[0]) {
    this.busy.set(false);
    this.failed.set(true);
    this.message.set(employeeError(error));
  }
}
