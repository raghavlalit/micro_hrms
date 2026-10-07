import { EntitySchema } from 'typeorm';
import type { EntitySchemaColumnOptions, EntitySchemaOptions } from 'typeorm';
type EntitySchemaForeignKeyOptions = NonNullable<
  EntitySchemaOptions<Record<string, unknown>>['foreignKeys']
>[number];

export const uuid = (nullable = false): EntitySchemaColumnOptions => ({
  type: 'uuid',
  nullable,
});
export const text = (nullable = false): EntitySchemaColumnOptions => ({
  type: 'text',
  nullable,
});
export const date = (nullable = false): EntitySchemaColumnOptions => ({
  type: 'date',
  nullable,
});
export const timestamp = (nullable = false): EntitySchemaColumnOptions => ({
  type: 'timestamptz',
  nullable,
});
export const decimal = (
  scale = 2,
  defaultValue?: string,
): EntitySchemaColumnOptions => ({
  type: 'numeric',
  precision: 18,
  scale,
  ...(defaultValue === undefined ? {} : { default: defaultValue }),
});
export const json = (): EntitySchemaColumnOptions => ({
  type: 'jsonb',
  default: {},
});
export const flag = (value = false): EntitySchemaColumnOptions => ({
  type: 'boolean',
  default: value,
});
export const integer = (value = 0): EntitySchemaColumnOptions => ({
  type: 'integer',
  default: value,
});
export const state = (value: string): EntitySchemaColumnOptions => ({
  type: 'varchar',
  length: 32,
  default: value,
});

// Scalar foreign keys keep persistence ownership within each business module.
// Every tenant relationship includes tenant_id, not just the target's UUID.
export function tenantFk(
  table: string,
  column: string,
): EntitySchemaForeignKeyOptions {
  return {
    target: table,
    columnNames: ['tenant_id', column],
    referencedColumnNames: ['tenant_id', 'id'],
    onDelete: 'RESTRICT',
  };
}
type SchemaExtras = Pick<
  EntitySchemaOptions<Record<string, unknown>>,
  'uniques' | 'indices' | 'checks' | 'foreignKeys' | 'exclusions'
>;
export function schema(
  name: string,
  columns: Record<string, EntitySchemaColumnOptions>,
  extras: SchemaExtras = {},
  tenantOwned = true,
) {
  return new EntitySchema<Record<string, unknown>>({
    name,
    tableName: name,
    columns: {
      id: { type: 'uuid', primary: true, generated: 'uuid' },
      ...(tenantOwned ? { tenant_id: uuid() } : {}),
      ...columns,
      created_at: {
        type: 'timestamptz',
        createDate: true,
        default: () => 'CURRENT_TIMESTAMP',
      },
      updated_at: {
        type: 'timestamptz',
        updateDate: true,
        default: () => 'CURRENT_TIMESTAMP',
      },
    },
    ...extras,
    uniques: [
      ...(tenantOwned
        ? [{ name: `uq_${name}_tenant_id`, columns: ['tenant_id', 'id'] }]
        : []),
      ...(extras.uniques ?? []),
    ],
    foreignKeys: [
      ...(tenantOwned
        ? [
            {
              target: 'tenants',
              columnNames: ['tenant_id'],
              referencedColumnNames: ['id'],
              onDelete: 'RESTRICT' as const,
            },
          ]
        : []),
      ...(extras.foreignKeys ?? []),
    ],
  });
}
export const unique = (...columns: string[]) => ({ columns });
export const index = (...columns: string[]) => ({ columns });
export const check = (expression: string) => ({ expression });
