import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoutePlans1780000000000 implements MigrationInterface {
  name = 'CreateRoutePlans1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'route_plans_status_enum') THEN
          CREATE TYPE "route_plans_status_enum" AS ENUM('planned', 'active', 'completed', 'cancelled');
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "route_plans" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "device_id" uuid NOT NULL,
        "owner_id" uuid,
        "name" character varying,
        "status" "route_plans_status_enum" NOT NULL DEFAULT 'planned',
        "provider" character varying NOT NULL DEFAULT 'mapbox',
        "profile" character varying NOT NULL DEFAULT 'mapbox/driving',
        "origin_lat" double precision NOT NULL,
        "origin_lng" double precision NOT NULL,
        "destination_lat" double precision NOT NULL,
        "destination_lng" double precision NOT NULL,
        "distance_meters" double precision,
        "duration_seconds" integer,
        "encoded_polyline" text,
        "geom" geometry(LineString, 4326),
        "deviation_threshold_meters" integer NOT NULL DEFAULT 50,
        "activated_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_route_plans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_route_plans_device_id" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_route_plans_owner_id" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_route_plans_device_status"
      ON "route_plans" ("device_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_route_plans_geom"
      ON "route_plans" USING GIST ("geom")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_route_plans_geom"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_route_plans_device_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "route_plans"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "route_plans_status_enum"`);
  }
}
