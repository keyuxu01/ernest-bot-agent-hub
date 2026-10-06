import { describe, expect, it } from 'vitest';
import * as contracts from './artifact-observability';

const hash = 'a'.repeat(64);
const timestamp = '2026-10-05T18:30:00+08:00';
const artifactReference = { schemaVersion: 1, artifactId: 'artifact-1', referenceId: 'reference-1', resourceVersion: 1, contentSha256: hash, mimeType: 'image/png', byteSize: 128 };
const imageMetadata = { schemaVersion: 1, artifactId: 'artifact-1', resourceVersion: 1, ownerId: 'owner-1', sessionId: 'session-1', runId: 'run-1', toolExecutionId: 'tool-1', contentSha256: hash, byteSize: 128, storageReferenceId: 'storage-ref-1', createdAt: timestamp, kind: 'image', mimeType: 'image/png', width: 16, height: 8 };
const correlation = { correlationId: 'correlation-1', requestId: 'request-1', sessionId: 'session-1', runId: 'run-1', turnId: 'turn-1', toolExecutionId: 'tool-1', attempt: 1 };
const liveness = { schemaVersion: 1, status: 'alive', service: 'assistant-runtime-service', instanceId: 'instance-1', checkedAt: timestamp };
const gate = { schemaVersion: 1, authentication: true, ownershipEnforcement: true, finiteRequestAndStreamLimits: true, perUserConcurrencyBudget: true, modelCostBudget: true, status: 'satisfied', commandAdmission: true, streamAdmission: true };
const dependencyNames = ['postgres', 'redis', 'mem0', 'object_storage', 'user_platform_keys', 'model_provider', 'remote_mcp'] as const;
const dependencies = dependencyNames.map(dependency => ({ dependency, status: 'healthy', requiredFor: dependency === 'postgres' ? ['command', 'stream', 'worker'] : dependency === 'user_platform_keys' ? ['command', 'stream'] : dependency === 'model_provider' || dependency === 'redis' ? ['worker'] : [], reasonCode: null, checkedAt: timestamp }));
const evidence = (kind: string, id = kind) => ({ evidenceId: `evidence-${id}`, kind, reference: `receipt/${id}.json`, sha256: hash, recordedAt: timestamp });

const deletionSteps = (): Array<Record<string, unknown>> => [
  ...[
    'postgres_session_data', 'checkpoint_tool_records', 'redis_projection', 'mem0_session',
    'artifact_references', 'mcp_credentials', 'binding_metadata', 'audit_minimization',
  ].map(step => ({ step, attempt: 1, completedAt: timestamp, disposition: 'deleted' })),
  { step: 'artifact_blobs', attempt: 1, completedAt: timestamp, disposition: 'deleted', remainingArtifactReferences: 0 },
  { step: 'mem0_user_scope', attempt: 1, completedAt: timestamp, disposition: 'preserved', reason: 'user_scoped_memory' },
  { step: 'independent_forks', attempt: 1, completedAt: timestamp, disposition: 'preserved', reason: 'independent_fork' },
];

describe('assistant artifact, observability and delivery contracts', () => {
  it('models immutable artifacts and image-only rendering metadata', () => {
    expect(contracts.AssistantRuntimeArtifactReferenceSchema.parse(artifactReference)).toEqual(artifactReference);
    expect(contracts.AssistantRuntimeArtifactMetadataSchema.parse(imageMetadata)).toMatchObject({ kind: 'image', width: 16 });
    const binaryMetadata = { schemaVersion: 1, artifactId: 'artifact-2', resourceVersion: 1, ownerId: 'owner-1', sessionId: 'session-1', runId: 'run-1', toolExecutionId: null, contentSha256: hash, byteSize: 128, storageReferenceId: 'storage-ref-2', createdAt: timestamp, kind: 'binary', mimeType: 'application/octet-stream' };
    expect(contracts.AssistantRuntimeArtifactMetadataSchema.parse(binaryMetadata)).toMatchObject({ kind: 'binary' });
    expect(() => contracts.AssistantRuntimeArtifactMetadataSchema.parse({ ...imageMetadata, width: 0 })).toThrow();
    expect(() => contracts.AssistantRuntimeArtifactMetadataSchema.parse({ ...imageMetadata, kind: 'binary', mimeType: 'application/octet-stream' })).toThrow();
  });

  it('never turns artifact persistence failure into a successful reference', () => {
    const attempt = { schemaVersion: 1, artifactAttemptId: 'artifact-attempt-1', runId: 'run-1', toolExecutionId: 'tool-1', correlationId: 'correlation-1', completedAt: timestamp };
    expect(contracts.AssistantRuntimeArtifactCommitOutcomeSchema.parse({ ...attempt, status: 'committed', metadata: imageMetadata, reference: artifactReference })).toMatchObject({ status: 'committed' });
    expect(contracts.AssistantRuntimeArtifactCommitOutcomeSchema.parse({ ...attempt, status: 'failed', failureCode: 'OBJECT_STORE_UNAVAILABLE', retry: 'retryable' })).toMatchObject({ status: 'failed' });
    expect(() => contracts.AssistantRuntimeArtifactCommitOutcomeSchema.parse({ ...attempt, status: 'failed', failureCode: 'OBJECT_STORE_UNAVAILABLE', retry: 'retryable', reference: artifactReference })).toThrow();
    expect(() => contracts.AssistantRuntimeArtifactCommitOutcomeSchema.parse({ ...attempt, status: 'committed', metadata: imageMetadata, reference: { ...artifactReference, contentSha256: 'b'.repeat(64) } })).toThrow('must match');
    expect(() => contracts.AssistantRuntimeArtifactCommitOutcomeSchema.parse({ ...attempt, runId: 'run-other', status: 'committed', metadata: imageMetadata, reference: artifactReference })).toThrow('must belong');
  });

  it('supports bounded authenticated retrieval without owner selectors or existence leaks', () => {
    expect(contracts.AssistantRuntimeArtifactRetrievalRequestSchema.parse({ schemaVersion: 1, artifactId: 'artifact-1', referenceId: 'reference-1', range: { start: 0, endInclusive: 63 } })).toMatchObject({ artifactId: 'artifact-1' });
    expect(() => contracts.AssistantRuntimeArtifactRetrievalRequestSchema.parse({ schemaVersion: 1, artifactId: 'artifact-1', referenceId: 'reference-1', range: { start: 64, endInclusive: 1 } })).toThrow();
    expect(() => contracts.AssistantRuntimeArtifactRetrievalRequestSchema.parse({ schemaVersion: 1, artifactId: 'artifact-1', referenceId: 'reference-1', range: null, ownerId: 'foreign-owner' })).toThrow();
    expect(contracts.AssistantRuntimeArtifactRetrievalReceiptSchema.parse({ schemaVersion: 1, disposition: 'allowed', reference: artifactReference, acceptedRange: { start: 0, endInclusive: 63 }, contentLength: 64, retrievalId: 'retrieval-1', expiresAt: timestamp })).toMatchObject({ disposition: 'allowed' });
    expect(() => contracts.AssistantRuntimeArtifactRetrievalReceiptSchema.parse({ schemaVersion: 1, disposition: 'allowed', reference: artifactReference, acceptedRange: { start: 0, endInclusive: 127 }, contentLength: 64, retrievalId: 'retrieval-1', expiresAt: timestamp })).toThrow();
    expect(contracts.AssistantRuntimeArtifactRetrievalReceiptSchema.parse({ schemaVersion: 1, disposition: 'not_found_or_not_authorized', correlationId: 'correlation-1' })).not.toHaveProperty('artifactId');
    expect(() => contracts.AssistantRuntimeArtifactRetrievalReceiptSchema.parse({ schemaVersion: 1, disposition: 'not_found_or_not_authorized', correlationId: 'correlation-1', metadata: imageMetadata })).toThrow();
  });

  it('uses strict committed and failed artifact event payloads', () => {
    expect(contracts.AssistantRuntimeArtifactEventPayloadSchema.parse({ type: 'artifact', state: 'committed', reference: artifactReference })).toMatchObject({ state: 'committed' });
    expect(contracts.AssistantRuntimeArtifactEventPayloadSchema.parse({ type: 'artifact', state: 'failed', artifactAttemptId: 'attempt-1', failureCode: 'PERSIST_FAILED', retry: 'retryable' })).toMatchObject({ state: 'failed' });
    expect(() => contracts.AssistantRuntimeArtifactEventPayloadSchema.parse({ type: 'artifact', state: 'failed', artifactAttemptId: 'attempt-1', failureCode: 'PERSIST_FAILED', retry: 'retryable', reference: artifactReference })).toThrow();
  });

  it('enforces deletion completion, partial failure and preserved scopes', () => {
    const base = { schemaVersion: 1, deletionId: 'deletion-1', resourceVersion: 2, target: { targetType: 'session', ownerId: 'owner-1', sessionId: 'session-1', confirmation: 'irreversible_delete' }, attempt: 1, correlationId: 'correlation-1', steps: deletionSteps(), finishedAt: timestamp };
    expect(contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, status: 'completed' })).toMatchObject({ status: 'completed' });
    const failedSteps = deletionSteps().map(step => step.step === 'mem0_session' ? { step: 'mem0_session', attempt: 1, completedAt: timestamp, disposition: 'retryable_failure', failureCode: 'MEM0_UNAVAILABLE', cleanupReferenceId: 'cleanup-1' } : step);
    expect(contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, status: 'partial_failure', retryCleanupReferenceId: 'cleanup-1', steps: failedSteps })).toMatchObject({ status: 'partial_failure' });
    expect(() => contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, status: 'partial_failure', retryCleanupReferenceId: 'cleanup-other', steps: failedSteps })).toThrow('must match');
    expect(() => contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, status: 'completed', steps: failedSteps })).toThrow('cannot contain failed');
    expect(() => contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, status: 'partial_failure', retryCleanupReferenceId: 'cleanup-1' })).toThrow('requires retryable failures');
    const permanentSteps = deletionSteps().map(step => step.step === 'mem0_session' ? { step: 'mem0_session', attempt: 1, completedAt: timestamp, disposition: 'permanent_failure', failureCode: 'DELETE_DENIED' } : step);
    expect(contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, status: 'blocked_failure', steps: permanentSteps })).toMatchObject({ status: 'blocked_failure' });
    expect(() => contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, status: 'partial_failure', retryCleanupReferenceId: 'cleanup-1', steps: permanentSteps })).toThrow('no permanent');
  });

  it('does not delete shared blobs or user-scoped memory with a Session', () => {
    const base = { schemaVersion: 1, deletionId: 'deletion-1', resourceVersion: 2, target: { targetType: 'session', ownerId: 'owner-1', sessionId: 'session-1', confirmation: 'irreversible_delete' }, attempt: 1, correlationId: 'correlation-1', finishedAt: timestamp, status: 'completed' };
    const shared = deletionSteps().map(step => step.step === 'artifact_blobs' ? { step: 'artifact_blobs', attempt: 1, completedAt: timestamp, disposition: 'preserved', reason: 'shared_blob_reference', remainingArtifactReferences: 2 } : step);
    expect(contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, steps: shared })).toMatchObject({ status: 'completed' });
    const unsafeBlob = deletionSteps().map(step => step.step === 'artifact_blobs' ? { step: 'artifact_blobs', attempt: 1, completedAt: timestamp, disposition: 'deleted', remainingArtifactReferences: 2 } : step);
    expect(() => contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, steps: unsafeBlob })).toThrow();
    const deletedUserMemory = deletionSteps().map(step => step.step === 'mem0_user_scope' ? { step: 'mem0_user_scope', attempt: 1, completedAt: timestamp, disposition: 'deleted' } : step);
    expect(() => contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, steps: deletedUserMemory })).toThrow();
    const preservedPostgres = deletionSteps().map(step => step.step === 'postgres_session_data' ? { step: 'postgres_session_data', attempt: 1, completedAt: timestamp, disposition: 'preserved', reason: 'user_scoped_memory' } : step);
    expect(() => contracts.AssistantRuntimeDeletionReceiptSchema.parse({ ...base, steps: preservedPostgres })).toThrow();
    expect(() => contracts.AssistantRuntimeDeletionStepReceiptSchema.parse({ step: 'mem0_user_scope', attempt: 1, completedAt: timestamp, disposition: 'deleted' })).toThrow();
  });

  it('retries only named failed deletion steps', () => {
    const command = { schemaVersion: 1, commandId: 'command-1', deletionId: 'deletion-1', expectedVersion: 2, retryCleanupReferenceId: 'cleanup-1', failedSteps: ['mem0_session'] };
    expect(contracts.AssistantRuntimeDeletionRetryCommandSchema.parse(command)).toEqual(command);
    expect(() => contracts.AssistantRuntimeDeletionRetryCommandSchema.parse({ ...command, failedSteps: ['mem0_session', 'mem0_session'] })).toThrow('must be unique');
    expect(() => contracts.AssistantRuntimeDeletionRetryCommandSchema.parse({ ...command, failedSteps: ['mem0_user_scope'] })).toThrow();
  });

  it('keeps audit correlation allowlisted and closes stale fencing evidence', () => {
    expect(contracts.AssistantRuntimeCorrelationContextSchema.parse(correlation)).toEqual(correlation);
    expect(() => contracts.AssistantRuntimeCorrelationContextSchema.parse({ ...correlation, prompt: 'protected' })).toThrow();
    const base = { schemaVersion: 1, auditId: 'audit-1', actor: { actorType: 'worker', actorId: 'worker-old' }, action: 'fenced_commit', target: { targetType: 'run', targetId: 'run-1' }, resultClass: 'denied', policyId: 'fencing-policy', policyVersion: 1, correlation, occurredAt: timestamp, reasonCode: 'STALE_FENCE' };
    expect(contracts.AssistantRuntimeAuditRecordSchema.parse({ ...base, decisionKind: 'stale_fence_rejected', staleOwnerId: 'worker-old', currentOwnerId: 'worker-new', staleFencingToken: 3, currentFencingToken: 4 })).toMatchObject({ decisionKind: 'stale_fence_rejected' });
    expect(() => contracts.AssistantRuntimeAuditRecordSchema.parse({ ...base, decisionKind: 'stale_fence_rejected', staleOwnerId: 'worker-old', currentOwnerId: 'worker-new', staleFencingToken: 4, currentFencingToken: 4 })).toThrow('must be newer');
    expect(() => contracts.AssistantRuntimeAuditRecordSchema.parse({ ...base, decisionKind: 'operational', toolOutput: 'protected' })).toThrow();
  });

  it('distinguishes liveness, five-control exposure gate and dependency readiness', () => {
    expect(contracts.AssistantRuntimeLivenessSchema.parse(liveness)).toMatchObject({ status: 'alive' });
    expect(contracts.AssistantRuntimePublicExposureGateSchema.parse(gate)).toMatchObject({ status: 'satisfied' });
    const ready = { schemaVersion: 1, environment: 'production', liveness, publicExposureGate: gate, dependencies, workerReady: true, status: 'ready', commandAdmission: true, streamAdmission: true, workerAdmission: true, checkedAt: timestamp };
    expect(contracts.AssistantRuntimeReadinessSchema.parse(ready)).toMatchObject({ status: 'ready' });
    expect(() => contracts.AssistantRuntimePublicExposureGateSchema.parse({ ...gate, authentication: false })).toThrow('exactly reflect');
    const blockedGate = { ...gate, authentication: false, status: 'blocked', commandAdmission: false, streamAdmission: false };
    expect(() => contracts.AssistantRuntimeReadinessSchema.parse({ ...ready, publicExposureGate: blockedGate })).toThrow('must match');
    const unavailable = dependencies.map(item => item.dependency === 'postgres' ? { ...item, status: 'unavailable', reasonCode: 'PG_DOWN' } : item);
    expect(() => contracts.AssistantRuntimeReadinessSchema.parse({ ...ready, dependencies: unavailable })).toThrow();
    expect(() => contracts.AssistantRuntimeReadinessSchema.parse({ ...ready, dependencies: unavailable.map(item => item.dependency === 'postgres' ? { ...item, requiredFor: [] } : item) })).toThrow('fixed by the Runtime');
  });

  it('prevents compile-only capability promotion and self-audit', () => {
    const implemented = { schemaVersion: 1, capabilityId: 'CAP-025', status: 'Implemented', required: true, delivered: false, evidence: [evidence('specification'), evidence('implementation')], residualRisks: [] };
    expect(() => contracts.AssistantRuntimeCapabilityLedgerEntrySchema.parse(implemented)).toThrow('behavior-test');
    expect(contracts.AssistantRuntimeCapabilityLedgerEntrySchema.parse({ ...implemented, evidence: [evidence('specification'), evidence('implementation'), evidence('behavior_test')] })).toMatchObject({ status: 'Implemented' });
    expect(() => contracts.AssistantRuntimeCapabilityLedgerEntrySchema.parse({ ...implemented, status: 'Verified', delivered: true, evidence: [evidence('runtime_acceptance'), evidence('independent_audit')] })).toThrow('specification');
    const audit = { schemaVersion: 1, sessionId: 'coding-session-1', implementationAuthorId: 'agent-a', auditorId: 'agent-b', capabilityIds: ['CAP-025'], sourceManifestSha256: hash, diffEvidence: evidence('implementation', 'diff'), testEvidence: [evidence('behavior_test')], runtimeEvidence: [], residualRisks: ['contracts only'], verdict: 'passed', auditedAt: timestamp };
    expect(contracts.AssistantRuntimeCodingSessionAuditReceiptSchema.parse(audit)).toMatchObject({ auditorId: 'agent-b' });
    expect(() => contracts.AssistantRuntimeCodingSessionAuditReceiptSchema.parse({ ...audit, auditorId: 'agent-a' })).toThrow('must differ');
    expect(() => contracts.AssistantRuntimeCodingSessionAuditReceiptSchema.parse({ ...audit, testEvidence: [evidence('specification')] })).toThrow('categories');
  });

  it('requires verified migration recovery and exact release blockers', () => {
    const migration = { schemaVersion: 1, changeId: 'migration-1', forwardMigrationReference: 'migrations/0001.sql', compatibilityBoundary: 'old and new binaries read v1', recoveryStrategy: { strategy: 'rollforward', reference: 'runbooks/rollforward.md' }, forwardVerification: { method: 'migration_integration', result: 'passed', evidenceReference: 'receipts/migration-forward.json', verifiedAt: timestamp }, recoveryVerification: { strategy: 'rollforward', method: 'rollforward_rehearsal', result: 'passed', evidenceReference: 'receipts/migration-recovery.json', verifiedAt: timestamp } };
    expect(contracts.AssistantRuntimeMigrationEvidenceSchema.parse(migration)).toMatchObject({ recoveryVerification: { result: 'passed' } });
    expect(() => contracts.AssistantRuntimeMigrationEvidenceSchema.parse({ ...migration, recoveryVerification: { ...migration.recoveryVerification, strategy: 'rollback', method: 'rollback_rehearsal' } })).toThrow('selected recovery strategy');
    expect(() => contracts.AssistantRuntimeMigrationEvidenceSchema.parse({ ...migration, recoveryVerification: { ...migration.recoveryVerification, method: 'backup_restore' } })).toThrow();
    const requiredCapabilities = Array.from({ length: 32 }, (_, index) => ({ capabilityId: `CAP-${String(index + 1).padStart(3, '0')}`, status: index === 24 ? 'Specified' : 'Verified' }));
    const disclosures = { exclusions: [{ exclusionId: 'suggested_sessions', reason: 'approved product exclusion' }], untestedPlatforms: [], knownRisks: ['production adapters pending'] };
    const blocked = { schemaVersion: 1, requiredCapabilities, approvedTargetComplete: false, exactBaselineParity: false, blockingCapabilities: ['CAP-025'], ...disclosures, decidedAt: timestamp };
    expect(contracts.AssistantRuntimeReleaseGateDecisionSchema.parse(blocked)).toMatchObject({ approvedTargetComplete: false });
    expect(() => contracts.AssistantRuntimeReleaseGateDecisionSchema.parse({ ...blocked, approvedTargetComplete: true, blockingCapabilities: [] })).toThrow('exactly reflect');
    expect(() => contracts.AssistantRuntimeReleaseGateDecisionSchema.parse({ ...blocked, exactBaselineParity: true })).toThrow();
    expect(() => contracts.AssistantRuntimeReleaseGateDecisionSchema.parse({ ...blocked, exclusions: [] })).toThrow();
  });

  it('gives every supporting public schema a valid and key-invalid fixture', () => {
    const step = { step: 'redis_projection', attempt: 1, completedAt: timestamp, disposition: 'deleted' };
    const cases: Array<[schema: { parse: (value: unknown) => unknown }, valid: unknown, invalid: unknown]> = [
      [contracts.AssistantRuntimeArtifactByteRangeSchema, { start: 0, endInclusive: 0 }, { start: -1, endInclusive: 0 }],
      [contracts.AssistantRuntimeDeletionTargetSchema, { targetType: 'session', ownerId: 'owner-1', sessionId: 'session-1', confirmation: 'irreversible_delete' }, { targetType: 'session', ownerId: 'owner-1', sessionId: 'session-1', confirmation: 'archive' }],
      [contracts.AssistantRuntimeDeletionStepNameSchema, 'redis_projection', 'unknown_store'],
      [contracts.AssistantRuntimeDeletionStepReceiptSchema, step, { ...step, attempt: 0 }],
      [contracts.AssistantRuntimeDependencyHealthSchema, dependencies[0], { ...dependencies[0], dependency: 'unknown' }],
      [contracts.AssistantRuntimeCapabilityStatusSchema, 'Specified', 'Complete'],
      [contracts.AssistantRuntimeCapabilityEvidenceReferenceSchema, evidence('specification'), { ...evidence('specification'), sha256: 'short' }],
    ];
    for (const [schema, valid, invalid] of cases) { expect(() => schema.parse(valid)).not.toThrow(); expect(() => schema.parse(invalid)).toThrow(); }
    expect(() => contracts.AssistantRuntimeCapabilityEvidenceReferenceSchema.parse({ ...evidence('specification'), reference: '/Users/example/private.txt' })).toThrow('safe relative');
  });
});
