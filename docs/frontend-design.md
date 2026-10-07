# Frontend design foundation

The frontend uses Angular Material and CDK 22.2 with a custom light theme, a navy
sidebar and teal actions. No external font or icon service is required. Small
inline SVG icons are kept in the shared UI folder.

## Screens

- `/login`: responsive sign-in, password change and session management. Successful
  login opens the platform company directory or the company overview; temporary
  passwords still require a password change first.
- `/activate`: account activation using the same authentication layout.
- `/platform/companies`: company directory, server-side search/pagination,
  focused company creation form and a Material confirmation dialog before
  replacing a pending invitation.
- `/company/overview`: setup shortcuts filtered by the user's permissions. It
  does not display invented employee, attendance or payroll statistics.
- `/company/settings`: company profile, contact details and regional preferences.
- Existing organization, leave, payroll, document and holiday routes: searchable,
  paginated master lists and separate add/edit views. Status filtering is available
  where the master supports an active flag.

Add/edit views currently switch within the feature route. They are not separate
bookmarkable URLs. Reloading the page discards an unsaved form. Company directory
pagination is server-side; small master-data lists use client-side pagination.

## Code ownership

| Folder | Responsibility |
| --- | --- |
| `apps/web/src/app/layouts` | Responsive admin navigation/header and authentication layout |
| `apps/web/src/app/features/auth` | Login, password, sessions and activation workflows |
| `apps/web/src/app/features/platform` | Company directory and onboarding workflow |
| `apps/web/src/app/features/company` | Company overview and profile settings |
| Existing domain feature folders | Route permissions and domain-specific master field configuration |
| `apps/web/src/app/shared/master-editor` | Common master listing and editing presentation |
| `apps/web/src/app/shared/ui` | Form imports, icons and confirmation dialog |
| `apps/web/src/styles.scss` | Material theme and global design tokens |
| `apps/web/src/styles/_workspace.scss` | Shared page, panel, table and form styles |

Use the shared page patterns for future features. Keep templates and substantial
styles in their own files. Keep business workflows in their feature folders.
The shared company-profile fields register with their parent's Angular form;
required fields must participate in validation. Use Angular Material controls,
visible labels, explicit submit/cancel actions and loading/error/empty states.

Navigation visibility is a convenience, not an authorization boundary. Existing
route guards and API permission/tenant checks remain in place.

## Verification and local preview

```powershell
npm.cmd run build:web
npm.cmd run test --workspace=apps/web -- --watch=false
```

The redesign was checked in headless Edge at 1440px and 390px widths using mocked
API responses, including login redirects, onboarding validation, invitation
cancellation, record search/pagination/editing, role-specific navigation and
restricted-route redirects. Screenshots under `docs/ui-previews` use sample data,
not database records. The browser checks do not replace real API integration tests.

To review against the local API, use the existing development setup and run these
in separate terminals:

```powershell
npm.cmd run dev:api
npm.cmd run dev:web
```

Open `http://localhost:4200`. No database migration is needed for this UI change.
Employee management is now available; its additional migration and encryption
setup are documented in [Employee management](employee-management.md).
The dedicated [Holiday calendar](holiday-calendar.md) provides monthly/annual
views, upcoming entries and location-scoped employee access.
