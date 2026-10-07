import { Component, input } from '@angular/core';

const paths: Record<string, string> = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  company: 'M4 21V3h12v18 M16 9h4v12 M8 7h4 M8 11h4 M8 15h4 M2 21h20',
  team: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  calendar: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2 M8 14h2 M14 14h2',
  settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  document: 'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h8',
  wallet: 'M3 6h17v15H3V4h14 M15 11h6v5h-6z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  plus: 'M12 5v14 M5 12h14',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  check: 'M5 12l4 4L19 6',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
};
@Component({
  selector: 'app-icon',
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="path()" />
  </svg>`,
  styles: [
    ':host { display: inline-flex; width: 20px; height: 20px; flex-shrink: 0; } svg { width: 100%; height: 100%; }',
  ],
})
export class AppIcon {
  readonly name = input('grid');
  path() {
    return paths[this.name()] ?? paths['grid'];
  }
}
