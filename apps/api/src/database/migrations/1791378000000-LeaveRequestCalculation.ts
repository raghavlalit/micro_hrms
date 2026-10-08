import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveRequestCalculation1791378000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE leave_requests ADD COLUMN calculation jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE leave_requests DROP COLUMN calculation`,
    );
  }
}
