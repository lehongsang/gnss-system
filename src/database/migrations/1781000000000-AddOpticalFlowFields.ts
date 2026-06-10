import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOpticalFlowFields1781000000000 implements MigrationInterface {
  name = 'AddOpticalFlowFields1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "media_logs" 
      ADD COLUMN IF NOT EXISTS "processed_s3_key" character varying,
      ADD COLUMN IF NOT EXISTS "processing_status" character varying,
      ADD COLUMN IF NOT EXISTS "processing_error" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "media_logs" 
      DROP COLUMN IF EXISTS "processing_error",
      DROP COLUMN IF EXISTS "processing_status",
      DROP COLUMN IF EXISTS "processed_s3_key"
    `);
  }
}
