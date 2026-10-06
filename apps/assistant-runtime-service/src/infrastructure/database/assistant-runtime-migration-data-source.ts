import { DataSource } from 'typeorm';
import { CreateAssistantRuntimeCore1791177660000 } from './migrations/1791177660000-create-assistant-runtime-core';
import { CreateAssistantRuntimeExtensions1791177720000 } from './migrations/1791177720000-create-assistant-runtime-extensions';
import { AddAssistantRuntimeProductUniqueness1791177840000 } from './migrations/1791177840000-add-assistant-runtime-product-uniqueness';
import { AddAtomicSessionCommitState1791177900000 } from './migrations/1791177900000-add-atomic-session-commit-state';
import { AddRuntimeQueryIndexes1791177960000 } from './migrations/1791177960000-add-runtime-query-indexes';
import { readPostgresMigrationEnvironment } from './postgres-migration-environment';

const environment = readPostgresMigrationEnvironment();

/** 独立迁移入口；服务启动不会隐式执行 migration。 */
const AssistantRuntimeMigrationDataSource = new DataSource({
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
  migrationsTableName: 'assistant_runtime_migrations',
  migrations: [
    CreateAssistantRuntimeCore1791177660000,
    CreateAssistantRuntimeExtensions1791177720000,
    AddAssistantRuntimeProductUniqueness1791177840000,
    AddAtomicSessionCommitState1791177900000,
    AddRuntimeQueryIndexes1791177960000,
  ],
  extra: { max: 1 },
});

export default AssistantRuntimeMigrationDataSource;
