import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLocationToMediaLogs1780100000000 implements MigrationInterface {
  name = 'AddLocationToMediaLogs1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "media_logs"
      ADD COLUMN IF NOT EXISTS "lat" double precision,
      ADD COLUMN IF NOT EXISTS "lng" double precision,
      ADD COLUMN IF NOT EXISTS "geom" geometry(Point, 4326)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_media_logs_geom"
      ON "media_logs" USING GIST ("geom")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_media_logs_geom"`);
    await queryRunner.query(`
      ALTER TABLE "media_logs"
      DROP COLUMN IF EXISTS "geom",
      DROP COLUMN IF EXISTS "lng",
      DROP COLUMN IF EXISTS "lat"
    `);
  }
}
