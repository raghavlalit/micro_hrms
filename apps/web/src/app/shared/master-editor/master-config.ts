export interface MasterField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'checkbox' | 'date' | 'time' | 'select' | 'weekdays';
  required?: boolean;
  hint?: string;
  min?: number;
  max?: number;
  step?: string;
  options?: { value: string; label: string }[];
  lookup?: string;
}
export interface MasterConfig {
  title: string;
  endpoint: string;
  description: string;
  fields: MasterField[];
  defaults: Record<string, unknown>;
}
export const nameAndCode: MasterField[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  {
    key: 'code',
    label: 'Code',
    hint: 'Use uppercase letters, numbers and underscores.',
    type: 'text',
    required: true,
  },
];
