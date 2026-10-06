import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type MigrationModule = {
  default: DataSource;
};

const schema = process.env.POSTGRES_SCHEMA;
if (typeof schema !== 'string' || !schema.endsWith('_test')) {
  throw new Error(
    'POSTGRES_SCHEMA must end with _test for destructive migration integration tests',
  );
}

// 从 dist 加载，避免 TypeScript 源码测试掩盖编译产物或 CLI 入口错误。
const requireFromPackage = createRequire(resolve(process.cwd(), 'package.json'));
const migrationModule = requireFromPackage(
  resolve(
    process.cwd(),
    'dist/infrastructure/database/user-platform-migration-data-source.js',
  ),
) as MigrationModule;
const dataSource = migrationModule.default;

const tableNames = async (): Promise<string[]> => {
  const rows = (await dataSource.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
    [schema],
  )) as Array<{ table_name: string }>;
  return rows.map(row => row.table_name);
};

describe.sequential('UserPlatform compiled PostgreSQL migrations', () => {
  beforeAll(async () => {
    await dataSource.initialize();
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await dataSource.query('DROP TABLE IF EXISTS "user_platform_migrations"');
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await dataSource.query('DROP TABLE IF EXISTS "user_platform_migrations"');
      await dataSource.destroy();
    }
  });

  it('creates only the owned identity tables with timestamptz and constraints', async () => {
    expect(await tableNames()).toEqual(['assistant_access_grant', 'assistant_user']);

    const timestampColumns = (await dataSource.query(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = $1 AND column_name IN ('created_at', 'updated_at', 'disabled_at', 'issued_at', 'expires_at', 'revoked_at')`,
      [schema],
    )) as Array<{ data_type: string }>;
    expect(timestampColumns.length).toBeGreaterThanOrEqual(7);
    expect(
      timestampColumns.every(column => column.data_type === 'timestamp with time zone'),
    ).toBe(true);

    const constraints = (await dataSource.query(
      `SELECT conname FROM pg_constraint WHERE connamespace = $1::regnamespace`,
      [schema],
    )) as Array<{ conname: string }>;
    expect(constraints.map(item => item.conname)).toEqual(
      expect.arrayContaining([
        'ck_assistant_user_normalized_email',
        'ck_assistant_access_grant_token_hash',
        'ck_assistant_access_grant_lifetime',
        'fk_assistant_access_grant_user',
        'uq_assistant_user_google_subject',
      ]),
    );
  });

  it('accepts a legal user/grant and rejects unsafe identity state', async () => {
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_user"
       (user_id, google_subject, normalized_email, enabled, resource_version)
       VALUES ($1, $2, $3, true, 0)`,
      ['user-1', 'google-subject-1', 'fixture@example.test'],
    );
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_access_grant"
       (grant_id, user_id, token_hash, signing_key_id, issued_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        'grant-1',
        'user-1',
        Buffer.alloc(32, 1),
        'fixture-signing-key',
        '2026-10-05T10:00:00Z',
        '2026-10-05T10:05:00Z',
      ],
    );

    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_user"
         (user_id, google_subject, normalized_email, enabled, resource_version)
         VALUES ('user-bad-version', 'subject-bad-version', 'bad@example.test', true, -1)`,
      ),
    ).rejects.toThrow();

    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_user"
         (user_id, google_subject, normalized_email)
         VALUES ('user-duplicate-subject', 'google-subject-1', 'other@example.test')`,
      ),
    ).rejects.toThrow();
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_user"
       (user_id, google_subject, normalized_email)
       VALUES ('user-case-distinct', 'GOOGLE-SUBJECT-1', 'case@example.test')`,
    );
    await dataSource.query(
      `UPDATE "${schema}"."assistant_user"
       SET enabled = false, disabled_at = CURRENT_TIMESTAMP
       WHERE user_id = 'user-1'`,
    );
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_user"
         (user_id, google_subject, normalized_email)
         VALUES ('user-disabled-subject-reuse', 'google-subject-1', 'reuse@example.test')`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_user"
         (user_id, google_subject, normalized_email, enabled)
         VALUES ('user-bad-email', 'subject-bad-email', 'Not-Normalized@Example.Test', true)`,
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_access_grant"
         (grant_id, user_id, token_hash, signing_key_id, issued_at, expires_at)
         VALUES ('grant-short-hash', 'user-1', $1, 'fixture-key', $2, $3)`,
        [Buffer.alloc(31, 1), '2026-10-05T10:00:00Z', '2026-10-05T10:05:00Z'],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_access_grant"
         (grant_id, user_id, token_hash, signing_key_id, issued_at, expires_at)
         VALUES ('grant-long-lived', 'user-1', $1, 'fixture-key', $2, $3)`,
        [Buffer.alloc(32, 2), '2026-10-05T10:00:00Z', '2026-10-05T10:06:00Z'],
      ),
    ).rejects.toThrow();
    await expect(
      dataSource.query(
        `INSERT INTO "${schema}"."assistant_access_grant"
         (grant_id, user_id, token_hash, signing_key_id, issued_at, expires_at, revocation_reason_code)
         VALUES ('grant-reason-without-time', 'user-1', $1, 'fixture-key', $2, $3, 'TEST_REVOKED')`,
        [Buffer.alloc(32, 3), '2026-10-05T10:00:00Z', '2026-10-05T10:05:00Z'],
      ),
    ).rejects.toThrow();
  });

  it('is idempotent after the first successful migration', async () => {
    expect(await dataSource.runMigrations()).toEqual([]);
  });

  it('reverts 4.3 without dropping identity tables, then fully reverts owned tables', async () => {
    await dataSource.undoLastMigration();
    expect(await tableNames()).toEqual(['assistant_access_grant', 'assistant_user']);
    await dataSource.query(
      `INSERT INTO "${schema}"."assistant_user"
       (user_id, google_subject, normalized_email)
       VALUES ('user-after-43-down', 'google-subject-1', 'after-down@example.test')`,
    );
    await dataSource.undoLastMigration();
    expect(await tableNames()).toEqual([]);
    const rows = (await dataSource.query(
      'SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1',
      [schema],
    )) as unknown[];
    expect(rows).toHaveLength(1);
  });

  it('reapplies cleanly after revert', async () => {
    expect(await dataSource.runMigrations()).toHaveLength(2);
    expect(await tableNames()).toEqual(['assistant_access_grant', 'assistant_user']);
  });
});
