import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1748310000000 implements MigrationInterface {
  name = 'InitialSchema1748310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable PostGIS extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    // Create custom ENUM types
    await queryRunner.query(`CREATE TYPE "medias_status_enum" AS ENUM('PENDING', 'COMPLETED', 'FAILED')`);
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM('admin', 'user')`);
    await queryRunner.query(`CREATE TYPE "user_status_enum" AS ENUM('pending', 'active', 'inactive')`);
    await queryRunner.query(`CREATE TYPE "device_status_status_enum" AS ENUM('online', 'offline', 'maintenance')`);
    await queryRunner.query(`CREATE TYPE "telemetry_accuracy_status_enum" AS ENUM('gnss_only', 'vision_only', 'fused')`);
    await queryRunner.query(`CREATE TYPE "geofences_type_enum" AS ENUM('allowed_zone', 'forbidden_zone')`);
    await queryRunner.query(`CREATE TYPE "geofence_device_states_state_enum" AS ENUM('inside', 'outside')`);
    await queryRunner.query(`CREATE TYPE "media_logs_media_type_enum" AS ENUM('video_chunk', 'image_frame')`);
    await queryRunner.query(`CREATE TYPE "alerts_alert_type_enum" AS ENUM('trajectory_deviation', 'dangerous_obstacle', 'signal_lost', 'geofence_exit', 'geofence_entry', 'speeding')`);

    // 1. medias table
    await queryRunner.query(`
      CREATE TABLE "medias" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "filename" character varying NOT NULL,
        "originalName" character varying NOT NULL,
        "mimeType" character varying NOT NULL,
        "size" bigint NOT NULL,
        "s3Key" character varying,
        "url" character varying,
        "status" "medias_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_by" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_medias" PRIMARY KEY ("id")
      )
    `);

    // 2. user table
    await queryRunner.query(`
      CREATE TABLE "user" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying(200),
        "phoneNumber" character varying(20),
        "email" character varying(255) NOT NULL,
        "emailVerified" boolean NOT NULL,
        "image" text,
        "mediaId" uuid,
        "role" "user_role_enum" NOT NULL DEFAULT 'user',
        "language" text NOT NULL DEFAULT 'en',
        "banExpires" TIMESTAMP WITH TIME ZONE,
        "banned" boolean,
        "banReason" text,
        "twoFactorEnabled" boolean DEFAULT false,
        "status" "user_status_enum" NOT NULL DEFAULT 'pending',
        "isVerifiedKyc" boolean DEFAULT false,
        CONSTRAINT "UQ_user_phoneNumber" UNIQUE ("phoneNumber"),
        CONSTRAINT "UQ_user_email" UNIQUE ("email"),
        CONSTRAINT "PK_user" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_mediaId" FOREIGN KEY ("mediaId") REFERENCES "medias"("id") ON DELETE SET NULL
      )
    `);

    // 3. verification table
    await queryRunner.query(`
      CREATE TABLE "verification" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "identifier" text NOT NULL,
        "value" text NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_verification" PRIMARY KEY ("id")
      )
    `);

    // 4. twoFactor table
    await queryRunner.query(`
      CREATE TABLE "twoFactor" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "secret" text NOT NULL,
        "backupCodes" text,
        "trustDeviceCookieName" text,
        "trustDevice" boolean DEFAULT false,
        "type" text DEFAULT 'totp',
        "userId" uuid,
        CONSTRAINT "PK_twoFactor" PRIMARY KEY ("id"),
        CONSTRAINT "FK_twoFactor_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // 5. session table
    await queryRunner.query(`
      CREATE TABLE "session" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "expiresAt" TIMESTAMP NOT NULL,
        "token" text NOT NULL,
        "ipAddress" text,
        "userAgent" text,
        "userId" uuid,
        "impersonatedById" uuid,
        CONSTRAINT "UQ_session_token" UNIQUE ("token"),
        CONSTRAINT "PK_session" PRIMARY KEY ("id"),
        CONSTRAINT "FK_session_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_session_impersonatedById" FOREIGN KEY ("impersonatedById") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // 6. jwks table
    await queryRunner.query(`
      CREATE TABLE "jwks" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "publicKey" text NOT NULL,
        "privateKey" text NOT NULL,
        "expiresAt" TIMESTAMP,
        CONSTRAINT "PK_jwks" PRIMARY KEY ("id")
      )
    `);

    // 7. account table
    await queryRunner.query(`
      CREATE TABLE "account" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "accountId" text NOT NULL,
        "providerId" text NOT NULL,
        "accessToken" text,
        "refreshToken" text,
        "idToken" text,
        "accessTokenExpiresAt" TIMESTAMP,
        "refreshTokenExpiresAt" TIMESTAMP,
        "scope" text,
        "password" text,
        "userId" uuid,
        CONSTRAINT "PK_account" PRIMARY KEY ("id"),
        CONSTRAINT "FK_account_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // 8. device_groups table
    await queryRunner.query(`
      CREATE TABLE "device_groups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "description" character varying,
        "owner_id" uuid NOT NULL,
        CONSTRAINT "PK_device_groups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_device_groups_owner_id" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE
      )
    `);

    // 9. devices table
    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "mqtt_username" character varying,
        "mqtt_password_hash" character varying,
        "mqtt_credentials_issued_at" TIMESTAMP,
        "owner_id" uuid,
        "speed_limit_kmh" double precision,
        "device_group_id" uuid,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "UQ_devices_mqtt_username" UNIQUE ("mqtt_username"),
        CONSTRAINT "PK_devices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_devices_owner_id" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_devices_device_group_id" FOREIGN KEY ("device_group_id") REFERENCES "device_groups"("id") ON DELETE SET NULL
      )
    `);

    // 10. device_status table
    await queryRunner.query(`
      CREATE TABLE "device_status" (
        "device_id" uuid NOT NULL,
        "status" "device_status_status_enum" NOT NULL,
        "battery_level" integer NOT NULL,
        "camera_status" boolean NOT NULL,
        "gnss_status" boolean NOT NULL,
        "satellites_tracked" integer NOT NULL DEFAULT 0,
        "signal_strength" integer NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_device_status" PRIMARY KEY ("device_id"),
        CONSTRAINT "FK_device_status_device_id" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE
      )
    `);

    // 11. telemetry table
    await queryRunner.query(`
      CREATE TABLE "telemetry" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "device_id" uuid NOT NULL,
        "timestamp" TIMESTAMP NOT NULL,
        "lat" double precision NOT NULL,
        "lng" double precision NOT NULL,
        "speed" double precision NOT NULL,
        "heading" double precision NOT NULL,
        "accuracy_status" "telemetry_accuracy_status_enum" NOT NULL,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_telemetry" PRIMARY KEY ("id"),
        CONSTRAINT "FK_telemetry_device_id" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_telemetry_device_id_timestamp" ON "telemetry" ("device_id", "timestamp")`);

    // 12. geofences table
    await queryRunner.query(`
      CREATE TABLE "geofences" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "name" character varying NOT NULL,
        "type" "geofences_type_enum" NOT NULL DEFAULT 'allowed_zone',
        "color" character varying DEFAULT '#3b82f6',
        "created_by" uuid,
        "geom" geometry(Polygon, 4326),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_geofences" PRIMARY KEY ("id"),
        CONSTRAINT "FK_geofences_created_by" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL
      )
    `);

    // 13. device_geofence table (Join table)
    await queryRunner.query(`
      CREATE TABLE "device_geofence" (
        "geofence_id" uuid NOT NULL,
        "device_id" uuid NOT NULL,
        CONSTRAINT "PK_device_geofence" PRIMARY KEY ("geofence_id", "device_id"),
        CONSTRAINT "FK_device_geofence_geofence_id" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_device_geofence_device_id" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_device_geofence_geofence_id" ON "device_geofence" ("geofence_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_device_geofence_device_id" ON "device_geofence" ("device_id")`);

    // 14. geofence_device_states table
    await queryRunner.query(`
      CREATE TABLE "geofence_device_states" (
        "device_id" uuid NOT NULL,
        "geofence_id" uuid NOT NULL,
        "state" "geofence_device_states_state_enum" NOT NULL,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_geofence_device_states" PRIMARY KEY ("device_id", "geofence_id"),
        CONSTRAINT "FK_geofence_device_states_device_id" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_geofence_device_states_geofence_id" FOREIGN KEY ("geofence_id") REFERENCES "geofences"("id") ON DELETE CASCADE
      )
    `);

    // 15. media_logs table
    await queryRunner.query(`
      CREATE TABLE "media_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "device_id" uuid NOT NULL,
        "start_time" TIMESTAMP NOT NULL,
        "end_time" TIMESTAMP NOT NULL,
        "media_type" "media_logs_media_type_enum" NOT NULL,
        "s3_key" character varying NOT NULL,
        "file_url" character varying,
        "snapshot_id" character varying(128),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_media_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_media_logs_device_id" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_media_logs_device_id_start_time" ON "media_logs" ("device_id", "start_time")`);
    await queryRunner.query(`CREATE INDEX "IDX_media_logs_device_id_snapshot_id" ON "media_logs" ("device_id", "snapshot_id")`);

    // 16. alerts table
    await queryRunner.query(`
      CREATE TABLE "alerts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "device_id" uuid NOT NULL,
        "alert_type" "alerts_alert_type_enum" NOT NULL,
        "message" text NOT NULL,
        "lat" double precision NOT NULL,
        "lng" double precision NOT NULL,
        "snapshot_url" character varying,
        "snapshot_id" character varying(128),
        "snapshot_media_log_id" uuid,
        "is_resolved" boolean NOT NULL DEFAULT false,
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_alerts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alerts_device_id" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_alerts_snapshot_media_log_id" FOREIGN KEY ("snapshot_media_log_id") REFERENCES "media_logs"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_alerts_device_id_created_at" ON "alerts" ("device_id", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_alerts_device_id_snapshot_id" ON "alerts" ("device_id", "snapshot_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order to avoid FK violations
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_alerts_device_id_snapshot_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_alerts_device_id_created_at"`);
    await queryRunner.query(`DROP TABLE "alerts"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_logs_device_id_snapshot_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_media_logs_device_id_start_time"`);
    await queryRunner.query(`DROP TABLE "media_logs"`);

    await queryRunner.query(`DROP TABLE "geofence_device_states"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_device_geofence_device_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_device_geofence_geofence_id"`);
    await queryRunner.query(`DROP TABLE "device_geofence"`);

    await queryRunner.query(`DROP TABLE "geofences"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_telemetry_device_id_timestamp"`);
    await queryRunner.query(`DROP TABLE "telemetry"`);

    await queryRunner.query(`DROP TABLE "device_status"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TABLE "device_groups"`);

    await queryRunner.query(`DROP TABLE "account"`);
    await queryRunner.query(`DROP TABLE "jwks"`);
    await queryRunner.query(`DROP TABLE "session"`);
    await queryRunner.query(`DROP TABLE "twoFactor"`);
    await queryRunner.query(`DROP TABLE "verification"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TABLE "medias"`);

    // Drop custom ENUM types
    await queryRunner.query(`DROP TYPE "alerts_alert_type_enum"`);
    await queryRunner.query(`DROP TYPE "media_logs_media_type_enum"`);
    await queryRunner.query(`DROP TYPE "geofence_device_states_state_enum"`);
    await queryRunner.query(`DROP TYPE "geofences_type_enum"`);
    await queryRunner.query(`DROP TYPE "telemetry_accuracy_status_enum"`);
    await queryRunner.query(`DROP TYPE "device_status_status_enum"`);
    await queryRunner.query(`DROP TYPE "user_status_enum"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
    await queryRunner.query(`DROP TYPE "medias_status_enum"`);
  }
}
