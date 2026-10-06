import { DataSource } from 'typeorm';
import { CreateUserPlatformIdentity1791177600000 } from './migrations/1791177600000-create-user-platform-identity';
import { AddAssistantUserProductUniqueness1791177780000 } from './migrations/1791177780000-add-assistant-user-product-uniqueness';
import { readPostgresMigrationEnvironment } from './postgres-migration-environment';

const environment = readPostgresMigrationEnvironment();

/** 独立迁移入口；服务启动不会隐式执行 migration。 */
const UserPlatformMigrationDataSource = new DataSource({
  type: 'postgres',
  host: environment.host,
  port: environment.port,
  username: environment.username,
  password: environment.password,
  database: environment.database,
  ssl: environment.ssl,
  synchronize: false,
  migrationsRun: false,
  migrationsTransactionMode: 'each',
  migrationsTableName: 'user_platform_migrations',
  migrations: [
    CreateUserPlatformIdentity1791177600000,
    AddAssistantUserProductUniqueness1791177780000,
  ],
  extra: { max: 1 },
});

export default UserPlatformMigrationDataSource;
