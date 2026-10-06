import type { MigrationInterface, QueryRunner } from 'typeorm';
import { validatePostgresSchemaName } from '../../../config/environment';

const schemaName = (): string =>
  validatePostgresSchemaName(process.env.POSTGRES_SCHEMA ?? 'user_platform');

/**
 * UserPlatform 的第一版耐久身份模型。
 * 这里只保存 token 哈希和安全状态码，绝不保存 JWT、OAuth code 或签名私钥明文。
 */
export class CreateUserPlatformIdentity1791177600000 implements MigrationInterface {
  readonly name = 'CreateUserPlatformIdentity1791177600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_user" (
        "user_id" varchar(128) PRIMARY KEY,
        "google_subject" varchar(256) NOT NULL,
        "normalized_email" varchar(320) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "resource_version" bigint NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "disabled_at" timestamptz NULL,
        CONSTRAINT "ck_assistant_user_identity"
          CHECK (char_length("user_id") > 0 AND char_length("google_subject") > 0 AND char_length("normalized_email") > 0),
        CONSTRAINT "ck_assistant_user_resource_version"
          CHECK ("resource_version" >= 0),
        CONSTRAINT "ck_assistant_user_normalized_email"
          CHECK ("normalized_email" = lower(btrim("normalized_email"))),
        CONSTRAINT "ck_assistant_user_enabled_time"
          CHECK (("enabled" AND "disabled_at" IS NULL) OR (NOT "enabled" AND "disabled_at" IS NOT NULL))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "${schema}"."assistant_access_grant" (
        "grant_id" varchar(128) PRIMARY KEY,
        "user_id" varchar(128) NOT NULL,
        "token_hash" bytea NOT NULL,
        "signing_key_id" varchar(128) NOT NULL,
        "issued_at" timestamptz NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz NULL,
        "revocation_reason_code" varchar(128) NULL,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ck_assistant_access_grant_identity"
          CHECK (char_length("grant_id") > 0 AND char_length("user_id") > 0 AND char_length("signing_key_id") > 0),
        CONSTRAINT "fk_assistant_access_grant_user"
          FOREIGN KEY ("user_id") REFERENCES "${schema}"."assistant_user" ("user_id") ON DELETE RESTRICT,
        CONSTRAINT "ck_assistant_access_grant_token_hash"
          CHECK (octet_length("token_hash") = 32),
        CONSTRAINT "ck_assistant_access_grant_lifetime"
          CHECK ("expires_at" = "issued_at" + interval '5 minutes'),
        CONSTRAINT "ck_assistant_access_grant_revocation"
          CHECK (
            ("revoked_at" IS NULL AND "revocation_reason_code" IS NULL)
            OR ("revoked_at" IS NOT NULL AND "revoked_at" >= "issued_at" AND "revocation_reason_code" IS NOT NULL)
          )
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = schemaName();
    await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."assistant_access_grant"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "${schema}"."assistant_user"`);
  }
}
