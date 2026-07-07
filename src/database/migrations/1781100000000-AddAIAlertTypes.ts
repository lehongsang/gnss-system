import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAIAlertTypes1781100000000 implements MigrationInterface {
  name = 'AddAIAlertTypes1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "alerts_alert_type_enum" ADD VALUE IF NOT EXISTS 'sudden_motion';
    `);
    await queryRunner.query(`
      ALTER TYPE "alerts_alert_type_enum" ADD VALUE IF NOT EXISTS 'abnormal_stop';
    `);
  }

  public async down(): Promise<void> {
    // Note: PostgreSQL does not support dropping enum values directly.
    // To revert, one would need to recreate the enum type, which is unsafe if values are in use.
  }
}
