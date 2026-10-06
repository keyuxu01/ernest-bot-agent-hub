import type {
  OwnerId,
  OwnerScopedRuntimeRepositories,
} from './assistant-runtime-repository.port';

interface AssistantRuntimeTransactionPort {
  withOwnerTransaction<T>(
    ownerId: OwnerId,
    work: (repositories: OwnerScopedRuntimeRepositories) => Promise<T>,
  ): Promise<T>;
}

const ASSISTANT_RUNTIME_TRANSACTION = Symbol('ASSISTANT_RUNTIME_TRANSACTION');

export { ASSISTANT_RUNTIME_TRANSACTION, type AssistantRuntimeTransactionPort };
