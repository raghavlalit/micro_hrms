import type { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeScheduleDefault1791178103172 implements MigrationInterface {
  name = 'NormalizeScheduleDefault1791178103172';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE work_schedules ALTER COLUMN working_days SET DEFAULT '{1,2,3,4,5}'::smallint[]`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE work_schedules ALTER COLUMN working_days SET DEFAULT ARRAY[1,2,3,4,5]::smallint[]',
    );
  }
}
