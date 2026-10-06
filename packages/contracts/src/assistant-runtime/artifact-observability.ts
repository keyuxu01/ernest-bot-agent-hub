import { z } from 'zod';
import {
  AssistantRuntimeCommandIdSchema,
  AssistantRuntimeCorrelationIdSchema,
  AssistantRuntimeIdSchema,
  AssistantRuntimeResourceVersionSchema,
  AssistantRuntimeRetryClassificationSchema,
  AssistantRuntimeRunIdSchema,
  AssistantRuntimeSchemaVersionSchema,
  AssistantRuntimeSessionIdSchema,
  AssistantRuntimeTimestampSchema,
} from './protocol';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const SafeCodeSchema = z.string().min(1).max(128).regex(/^[A-Z][A-Z0-9_]*$/);
const ArtifactIdSchema = AssistantRuntimeIdSchema;
const ArtifactReferenceIdSchema = AssistantRuntimeIdSchema;

const AssistantRuntimeArtifactReferenceSchema = z.object({
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  artifactId: ArtifactIdSchema,
  referenceId: ArtifactReferenceIdSchema,
  resourceVersion: AssistantRuntimeResourceVersionSchema,
  contentSha256: Sha256Schema,
  mimeType: z.string().min(3).max(255).regex(/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/),
  byteSize: z.int().nonnegative(),
}).strict();

const artifactMetadataBase = {
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  artifactId: ArtifactIdSchema,
  resourceVersion: AssistantRuntimeResourceVersionSchema,
  ownerId: AssistantRuntimeIdSchema,
  sessionId: AssistantRuntimeSessionIdSchema,
  runId: AssistantRuntimeRunIdSchema,
  toolExecutionId: AssistantRuntimeIdSchema.nullable(),
  contentSha256: Sha256Schema,
  byteSize: z.int().nonnegative(),
  storageReferenceId: AssistantRuntimeIdSchema,
  createdAt: AssistantRuntimeTimestampSchema,
};

const AssistantRuntimeArtifactMetadataSchema = z.discriminatedUnion('kind', [
  z.object({ ...artifactMetadataBase, kind: z.literal('image'), mimeType: z.string().regex(/^image\/[a-z0-9.+-]+$/), width: z.int().positive(), height: z.int().positive(), frameCount: z.int().positive().optional() }).strict().refine(value => value.byteSize > 0, { path: ['byteSize'], message: 'Image artifact must not be empty' }),
  z.object({ ...artifactMetadataBase, kind: z.enum(['text', 'binary']), mimeType: z.string().min(3).max(255).regex(/^(?!image\/)[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/) }).strict(),
]);

const artifactAttemptBase = {
  schemaVersion: AssistantRuntimeSchemaVersionSchema,
  artifactAttemptId: AssistantRuntimeIdSchema,
  runId: AssistantRuntimeRunIdSchema,
  toolExecutionId: AssistantRuntimeIdSchema.nullable(),
  correlationId: AssistantRuntimeCorrelationIdSchema,
  completedAt: AssistantRuntimeTimestampSchema,
};

const AssistantRuntimeArtifactCommitOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ ...artifactAttemptBase, status: z.literal('committed'), metadata: AssistantRuntimeArtifactMetadataSchema, reference: AssistantRuntimeArtifactReferenceSchema }).strict().superRefine((value, context) => {
    if (value.runId !== value.metadata.runId || value.toolExecutionId !== value.metadata.toolExecutionId) context.addIssue({ code: 'custom', path: ['metadata'], message: 'Committed metadata must belong to the artifact attempt Run and ToolExecution', input: value });
    if (value.metadata.artifactId !== value.reference.artifactId || value.metadata.resourceVersion !== value.reference.resourceVersion || value.metadata.contentSha256 !== value.reference.contentSha256 || value.metadata.byteSize !== value.reference.byteSize || value.metadata.mimeType !== value.reference.mimeType) context.addIssue({ code: 'custom', path: ['reference'], message: 'Artifact reference must match committed metadata', input: value });
  }),
  z.object({ ...artifactAttemptBase, status: z.literal('failed'), failureCode: SafeCodeSchema, retry: AssistantRuntimeRetryClassificationSchema }).strict(),
]);

const AssistantRuntimeArtifactByteRangeSchema = z.object({ start: z.int().nonnegative(), endInclusive: z.int().nonnegative() }).strict().refine(value => value.endInclusive >= value.start, { path: ['endInclusive'], message: 'Range end must not precede start' });
const AssistantRuntimeArtifactRetrievalRequestSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, artifactId: ArtifactIdSchema, referenceId: ArtifactReferenceIdSchema, range: AssistantRuntimeArtifactByteRangeSchema.nullable() }).strict();
const AssistantRuntimeArtifactRetrievalReceiptSchema = z.discriminatedUnion('disposition', [
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, disposition: z.literal('allowed'), reference: AssistantRuntimeArtifactReferenceSchema, acceptedRange: AssistantRuntimeArtifactByteRangeSchema.nullable(), contentLength: z.int().nonnegative(), retrievalId: AssistantRuntimeIdSchema, expiresAt: AssistantRuntimeTimestampSchema }).strict().superRefine((value, context) => {
    const expectedLength = value.acceptedRange === null ? value.reference.byteSize : value.acceptedRange.endInclusive - value.acceptedRange.start + 1;
    if (value.acceptedRange !== null && value.acceptedRange.endInclusive >= value.reference.byteSize) context.addIssue({ code: 'custom', path: ['acceptedRange'], message: 'Accepted range must stay within artifact size', input: value });
    if (value.contentLength !== expectedLength) context.addIssue({ code: 'custom', path: ['contentLength'], message: 'Content length must match the accepted range', input: value });
  }),
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, disposition: z.literal('not_found_or_not_authorized'), correlationId: AssistantRuntimeCorrelationIdSchema }).strict(),
]);

const AssistantRuntimeArtifactEventPayloadSchema = z.discriminatedUnion('state', [
  z.object({ type: z.literal('artifact'), state: z.literal('committed'), reference: AssistantRuntimeArtifactReferenceSchema }).strict(),
  z.object({ type: z.literal('artifact'), state: z.literal('failed'), artifactAttemptId: AssistantRuntimeIdSchema, failureCode: SafeCodeSchema, retry: AssistantRuntimeRetryClassificationSchema }).strict(),
]);

const AssistantRuntimeDeletionTargetSchema = z.object({ targetType: z.literal('session'), ownerId: AssistantRuntimeIdSchema, sessionId: AssistantRuntimeSessionIdSchema, confirmation: z.literal('irreversible_delete') }).strict();
const AssistantRuntimeDeletionStepNameSchema = z.enum(['postgres_session_data', 'checkpoint_tool_records', 'redis_projection', 'mem0_session', 'mem0_user_scope', 'artifact_references', 'artifact_blobs', 'mcp_credentials', 'binding_metadata', 'independent_forks', 'audit_minimization']);
const deletionStepBase = { step: AssistantRuntimeDeletionStepNameSchema, attempt: z.int().positive(), completedAt: AssistantRuntimeTimestampSchema };
const RETRYABLE_DELETION_STEPS = ['postgres_session_data', 'checkpoint_tool_records', 'redis_projection', 'mem0_session', 'artifact_references', 'artifact_blobs', 'mcp_credentials', 'binding_metadata', 'audit_minimization'] as const;
const ordinaryDeletionStepBase = { ...deletionStepBase, step: z.enum(RETRYABLE_DELETION_STEPS.filter(step => step !== 'artifact_blobs') as [Exclude<(typeof RETRYABLE_DELETION_STEPS)[number], 'artifact_blobs'>, ...Array<Exclude<(typeof RETRYABLE_DELETION_STEPS)[number], 'artifact_blobs'>>]) };
const AssistantRuntimeDeletionStepReceiptSchema = z.union([
  z.object({ ...ordinaryDeletionStepBase, disposition: z.literal('deleted') }).strict(),
  z.object({ ...ordinaryDeletionStepBase, disposition: z.literal('retryable_failure'), failureCode: SafeCodeSchema, cleanupReferenceId: AssistantRuntimeIdSchema }).strict(),
  z.object({ ...ordinaryDeletionStepBase, disposition: z.literal('permanent_failure'), failureCode: SafeCodeSchema }).strict(),
  z.object({ ...deletionStepBase, step: z.literal('artifact_blobs'), disposition: z.literal('deleted'), remainingArtifactReferences: z.literal(0) }).strict(),
  z.object({ ...deletionStepBase, step: z.literal('artifact_blobs'), disposition: z.literal('preserved'), reason: z.literal('shared_blob_reference'), remainingArtifactReferences: z.int().positive() }).strict(),
  z.object({ ...deletionStepBase, step: z.literal('artifact_blobs'), disposition: z.literal('retryable_failure'), failureCode: SafeCodeSchema, cleanupReferenceId: AssistantRuntimeIdSchema }).strict(),
  z.object({ ...deletionStepBase, step: z.literal('artifact_blobs'), disposition: z.literal('permanent_failure'), failureCode: SafeCodeSchema }).strict(),
  z.object({ ...deletionStepBase, step: z.literal('mem0_user_scope'), disposition: z.literal('preserved'), reason: z.literal('user_scoped_memory') }).strict(),
  z.object({ ...deletionStepBase, step: z.literal('independent_forks'), disposition: z.literal('preserved'), reason: z.literal('independent_fork') }).strict(),
]);

const REQUIRED_DELETION_STEPS = ['postgres_session_data', 'checkpoint_tool_records', 'redis_projection', 'mem0_session', 'mem0_user_scope', 'artifact_references', 'artifact_blobs', 'mcp_credentials', 'binding_metadata', 'independent_forks', 'audit_minimization'] as const;
const deletionReceiptBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, deletionId: AssistantRuntimeIdSchema, resourceVersion: AssistantRuntimeResourceVersionSchema, target: AssistantRuntimeDeletionTargetSchema, attempt: z.int().positive(), correlationId: AssistantRuntimeCorrelationIdSchema, steps: z.array(AssistantRuntimeDeletionStepReceiptSchema).length(REQUIRED_DELETION_STEPS.length), finishedAt: AssistantRuntimeTimestampSchema };
const AssistantRuntimeDeletionReceiptSchema = z.discriminatedUnion('status', [
  z.object({ ...deletionReceiptBase, status: z.literal('completed') }).strict(),
  z.object({ ...deletionReceiptBase, status: z.literal('partial_failure'), retryCleanupReferenceId: AssistantRuntimeIdSchema }).strict(),
  z.object({ ...deletionReceiptBase, status: z.literal('blocked_failure') }).strict(),
]).superRefine((value, context) => {
  const names = value.steps.map(step => step.step);
  if (new Set(names).size !== names.length || REQUIRED_DELETION_STEPS.some(step => !names.includes(step))) context.addIssue({ code: 'custom', path: ['steps'], message: 'Deletion receipt must contain every step exactly once', input: value });
  const retryableFailures = value.steps.filter(step => step.disposition === 'retryable_failure');
  const permanentFailures = value.steps.filter(step => step.disposition === 'permanent_failure');
  const failures = [...retryableFailures, ...permanentFailures];
  if (value.status === 'completed' && failures.length > 0) context.addIssue({ code: 'custom', path: ['status'], message: 'Completed deletion cannot contain failed steps', input: value });
  if (value.status === 'partial_failure' && (retryableFailures.length === 0 || permanentFailures.length > 0)) context.addIssue({ code: 'custom', path: ['status'], message: 'Partial deletion requires retryable failures and no permanent failure', input: value });
  if (value.status === 'partial_failure' && retryableFailures.some(step => step.cleanupReferenceId !== value.retryCleanupReferenceId)) context.addIssue({ code: 'custom', path: ['retryCleanupReferenceId'], message: 'Retry cleanup reference must match every retryable failed step', input: value });
  if (value.status === 'blocked_failure' && permanentFailures.length === 0) context.addIssue({ code: 'custom', path: ['status'], message: 'Blocked deletion requires a permanent failure', input: value });
  const userMemory = value.steps.find(step => step.step === 'mem0_user_scope');
  const independentForks = value.steps.find(step => step.step === 'independent_forks');
  if (userMemory?.disposition !== 'preserved' || userMemory.reason !== 'user_scoped_memory') context.addIssue({ code: 'custom', path: ['steps'], message: 'Session deletion must explicitly preserve user-scoped memory', input: value });
  if (independentForks?.disposition !== 'preserved' || independentForks.reason !== 'independent_fork') context.addIssue({ code: 'custom', path: ['steps'], message: 'Session deletion must explicitly preserve independent forks', input: value });
});
const AssistantRuntimeDeletionRetryCommandSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, commandId: AssistantRuntimeCommandIdSchema, deletionId: AssistantRuntimeIdSchema, expectedVersion: AssistantRuntimeResourceVersionSchema, retryCleanupReferenceId: AssistantRuntimeIdSchema, failedSteps: z.array(z.enum(RETRYABLE_DELETION_STEPS)).min(1).max(RETRYABLE_DELETION_STEPS.length) }).strict().refine(value => new Set(value.failedSteps).size === value.failedSteps.length, { path: ['failedSteps'], message: 'Retry step identities must be unique' });

const AssistantRuntimeCorrelationContextSchema = z.object({ correlationId: AssistantRuntimeCorrelationIdSchema, requestId: AssistantRuntimeIdSchema, sessionId: AssistantRuntimeSessionIdSchema.nullable(), runId: AssistantRuntimeRunIdSchema.nullable(), turnId: AssistantRuntimeIdSchema.nullable(), toolExecutionId: AssistantRuntimeIdSchema.nullable(), attempt: z.int().positive().nullable() }).strict();
const auditBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, auditId: AssistantRuntimeIdSchema, actor: z.object({ actorType: z.enum(['user', 'service', 'worker']), actorId: AssistantRuntimeIdSchema }).strict(), action: z.enum(['admission', 'authorization', 'tool_execution', 'settings_change', 'fork', 'deletion', 'administrative_change', 'fenced_commit']), target: z.object({ targetType: z.enum(['session', 'run', 'tool_execution', 'settings', 'artifact', 'user', 'system']), targetId: AssistantRuntimeIdSchema.nullable() }).strict(), resultClass: z.enum(['success', 'denied', 'failure', 'conflict', 'result_unknown']), policyId: AssistantRuntimeIdSchema, policyVersion: AssistantRuntimeResourceVersionSchema, correlation: AssistantRuntimeCorrelationContextSchema, occurredAt: AssistantRuntimeTimestampSchema, reasonCode: SafeCodeSchema };
const AssistantRuntimeAuditRecordSchema = z.discriminatedUnion('decisionKind', [
  z.object({ ...auditBase, decisionKind: z.literal('authorization'), authorization: z.enum(['allowed', 'denied']) }).strict().superRefine((value, context) => { if ((value.authorization === 'denied') !== (value.resultClass === 'denied')) context.addIssue({ code: 'custom', path: ['resultClass'], message: 'Authorization decision and result class must agree', input: value }); }),
  z.object({ ...auditBase, decisionKind: z.literal('operational') }).strict(),
  z.object({ ...auditBase, decisionKind: z.literal('stale_fence_rejected'), staleOwnerId: AssistantRuntimeIdSchema, currentOwnerId: AssistantRuntimeIdSchema, staleFencingToken: z.int().nonnegative(), currentFencingToken: z.int().positive() }).strict().superRefine((value, context) => {
    if (value.currentFencingToken <= value.staleFencingToken) context.addIssue({ code: 'custom', path: ['currentFencingToken'], message: 'Current fencing token must be newer than stale token', input: value });
    if (value.currentOwnerId === value.staleOwnerId || value.action !== 'fenced_commit' || value.resultClass !== 'denied') context.addIssue({ code: 'custom', path: ['decisionKind'], message: 'Stale-fence audit must identify distinct owners and a denied fenced commit', input: value });
  }),
]);

const AssistantRuntimeLivenessSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, status: z.enum(['alive', 'shutting_down']), service: z.literal('assistant-runtime-service'), instanceId: AssistantRuntimeIdSchema, checkedAt: AssistantRuntimeTimestampSchema }).strict();
const DEPENDENCY_NAMES = ['postgres', 'redis', 'mem0', 'object_storage', 'user_platform_keys', 'model_provider', 'remote_mcp'] as const;
const REQUIRED_DEPENDENCY_SURFACES: Record<(typeof DEPENDENCY_NAMES)[number], Array<'command' | 'stream' | 'worker'>> = {
  postgres: ['command', 'stream', 'worker'], redis: ['worker'], mem0: [], object_storage: [], user_platform_keys: ['command', 'stream'], model_provider: ['worker'], remote_mcp: [],
};
const AssistantRuntimeDependencyHealthSchema = z.object({ dependency: z.enum(DEPENDENCY_NAMES), status: z.enum(['healthy', 'degraded', 'unavailable', 'not_configured']), requiredFor: z.array(z.enum(['command', 'stream', 'worker'])).max(3), reasonCode: SafeCodeSchema.nullable(), checkedAt: AssistantRuntimeTimestampSchema }).strict().superRefine((value, context) => {
  const actual = [...new Set(value.requiredFor)].sort();
  const expected = [...REQUIRED_DEPENDENCY_SURFACES[value.dependency]].sort();
  if (actual.length !== value.requiredFor.length || actual.join(',') !== expected.join(',')) context.addIssue({ code: 'custom', path: ['requiredFor'], message: 'Dependency surfaces are fixed by the Runtime contract', input: value });
  if ((value.status === 'healthy') !== (value.reasonCode === null)) context.addIssue({ code: 'custom', path: ['reasonCode'], message: 'Only healthy dependencies omit a reason code', input: value });
});
const exposureControls = { authentication: z.boolean(), ownershipEnforcement: z.boolean(), finiteRequestAndStreamLimits: z.boolean(), perUserConcurrencyBudget: z.boolean(), modelCostBudget: z.boolean() };
const AssistantRuntimePublicExposureGateSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, ...exposureControls, status: z.enum(['satisfied', 'blocked']), commandAdmission: z.boolean(), streamAdmission: z.boolean() }).strict().superRefine((value, context) => {
  const enabled = value.authentication && value.ownershipEnforcement && value.finiteRequestAndStreamLimits && value.perUserConcurrencyBudget && value.modelCostBudget;
  if (enabled !== (value.status === 'satisfied') || value.commandAdmission !== enabled || value.streamAdmission !== enabled) context.addIssue({ code: 'custom', path: ['status'], message: 'Public exposure gate and admission must exactly reflect all five controls', input: value });
});
const AssistantRuntimeReadinessSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, environment: z.enum(['development', 'test', 'production']), liveness: AssistantRuntimeLivenessSchema, publicExposureGate: AssistantRuntimePublicExposureGateSchema, dependencies: z.array(AssistantRuntimeDependencyHealthSchema).length(DEPENDENCY_NAMES.length), workerReady: z.boolean(), status: z.enum(['ready', 'degraded', 'not_ready']), commandAdmission: z.boolean(), streamAdmission: z.boolean(), workerAdmission: z.boolean(), checkedAt: AssistantRuntimeTimestampSchema }).strict().superRefine((value, context) => {
  const dependencyNames = value.dependencies.map(item => item.dependency);
  if (new Set(dependencyNames).size !== dependencyNames.length || DEPENDENCY_NAMES.some(item => !dependencyNames.includes(item))) context.addIssue({ code: 'custom', path: ['dependencies'], message: 'Readiness must report each dependency exactly once', input: value });
  const alive = value.liveness.status === 'alive';
  const availableFor = (capability: 'command' | 'stream' | 'worker') => value.dependencies.every(item => !item.requiredFor.includes(capability) || item.status === 'healthy' || item.status === 'degraded');
  const command = alive && availableFor('command') && (value.environment !== 'production' || value.publicExposureGate.commandAdmission);
  const stream = alive && availableFor('stream') && (value.environment !== 'production' || value.publicExposureGate.streamAdmission);
  const worker = alive && value.workerReady && availableFor('worker');
  if (value.commandAdmission !== command || value.streamAdmission !== stream || value.workerAdmission !== worker) context.addIssue({ code: 'custom', path: ['commandAdmission'], message: 'Readiness admissions must match liveness, dependencies, worker state and production gate', input: value });
  const expectedStatus = command && stream && worker ? 'ready' : command || stream || worker ? 'degraded' : 'not_ready';
  if (value.status !== expectedStatus) context.addIssue({ code: 'custom', path: ['status'], message: 'Readiness status must reflect admitted surfaces', input: value });
});

const AssistantRuntimeCapabilityStatusSchema = z.enum(['Proposed', 'Specified', 'Implemented', 'Verified', 'Blocked']);
const SafeEvidenceReferenceSchema = z.string().min(1).max(1024).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine(reference => !reference.startsWith('/') && !/^[A-Za-z]:/.test(reference) && !reference.split('/').includes('..'), 'Evidence reference must be a safe relative or opaque reference');
const AssistantRuntimeCapabilityEvidenceReferenceSchema = z.object({ evidenceId: AssistantRuntimeIdSchema, kind: z.enum(['specification', 'implementation', 'behavior_test', 'runtime_acceptance', 'migration', 'rollback_or_rollforward', 'independent_audit']), reference: SafeEvidenceReferenceSchema, sha256: Sha256Schema, recordedAt: AssistantRuntimeTimestampSchema }).strict();
const AssistantRuntimeCapabilityLedgerEntrySchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, capabilityId: z.string().regex(/^CAP-(00[1-9]|0[12][0-9]|03[0-2])$/), status: AssistantRuntimeCapabilityStatusSchema, required: z.boolean(), delivered: z.boolean(), evidence: z.array(AssistantRuntimeCapabilityEvidenceReferenceSchema).max(128), residualRisks: z.array(z.string().min(1).max(1024)).max(64) }).strict().superRefine((value, context) => {
  const kinds = new Set(value.evidence.map(item => item.kind));
  if (value.delivered !== (value.status === 'Verified')) context.addIssue({ code: 'custom', path: ['delivered'], message: 'Only Verified capabilities are delivered', input: value });
  if (['Specified', 'Implemented', 'Verified'].includes(value.status) && !kinds.has('specification')) context.addIssue({ code: 'custom', path: ['evidence'], message: 'Specified or later status requires specification evidence', input: value });
  if (['Implemented', 'Verified'].includes(value.status) && (!kinds.has('implementation') || !kinds.has('behavior_test'))) context.addIssue({ code: 'custom', path: ['evidence'], message: 'Implemented or later status requires implementation and behavior-test evidence', input: value });
  if (value.status === 'Verified' && (!kinds.has('runtime_acceptance') || !kinds.has('independent_audit'))) context.addIssue({ code: 'custom', path: ['evidence'], message: 'Verified requires runtime acceptance and independent audit evidence', input: value });
});
const AssistantRuntimeCodingSessionAuditReceiptSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, sessionId: AssistantRuntimeIdSchema, implementationAuthorId: AssistantRuntimeIdSchema, auditorId: AssistantRuntimeIdSchema, capabilityIds: z.array(z.string().regex(/^CAP-(00[1-9]|0[12][0-9]|03[0-2])$/)).min(1).max(32), sourceManifestSha256: Sha256Schema, diffEvidence: AssistantRuntimeCapabilityEvidenceReferenceSchema, testEvidence: z.array(AssistantRuntimeCapabilityEvidenceReferenceSchema).min(1).max(64), runtimeEvidence: z.array(AssistantRuntimeCapabilityEvidenceReferenceSchema).max(64), residualRisks: z.array(z.string().min(1).max(1024)).max(64), verdict: z.enum(['passed', 'failed']), auditedAt: AssistantRuntimeTimestampSchema }).strict().superRefine((value, context) => {
  if (value.implementationAuthorId === value.auditorId) context.addIssue({ code: 'custom', path: ['auditorId'], message: 'Independent auditor must differ from implementation author', input: value });
  if (new Set(value.capabilityIds).size !== value.capabilityIds.length) context.addIssue({ code: 'custom', path: ['capabilityIds'], message: 'Audited capability identities must be unique', input: value });
  if (value.diffEvidence.kind !== 'implementation' || value.testEvidence.some(item => item.kind !== 'behavior_test') || value.runtimeEvidence.some(item => item.kind !== 'runtime_acceptance')) context.addIssue({ code: 'custom', path: ['diffEvidence'], message: 'Audit evidence categories must match diff, behavior-test and runtime slots', input: value });
});
const AssistantRuntimeMigrationEvidenceSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, changeId: AssistantRuntimeIdSchema, forwardMigrationReference: SafeEvidenceReferenceSchema, compatibilityBoundary: z.string().min(1).max(2048), recoveryStrategy: z.discriminatedUnion('strategy', [z.object({ strategy: z.literal('rollback'), reference: SafeEvidenceReferenceSchema }).strict(), z.object({ strategy: z.literal('rollforward'), reference: SafeEvidenceReferenceSchema }).strict()]), forwardVerification: z.object({ method: z.literal('migration_integration'), result: z.literal('passed'), evidenceReference: SafeEvidenceReferenceSchema, verifiedAt: AssistantRuntimeTimestampSchema }).strict(), recoveryVerification: z.discriminatedUnion('strategy', [z.object({ strategy: z.literal('rollback'), method: z.literal('rollback_rehearsal'), result: z.literal('passed'), evidenceReference: SafeEvidenceReferenceSchema, verifiedAt: AssistantRuntimeTimestampSchema }).strict(), z.object({ strategy: z.literal('rollforward'), method: z.literal('rollforward_rehearsal'), result: z.literal('passed'), evidenceReference: SafeEvidenceReferenceSchema, verifiedAt: AssistantRuntimeTimestampSchema }).strict()]), backupRestoreVerification: z.object({ method: z.literal('backup_restore'), result: z.literal('passed'), evidenceReference: SafeEvidenceReferenceSchema, verifiedAt: AssistantRuntimeTimestampSchema }).strict().optional() }).strict().refine(value => value.recoveryStrategy.strategy === value.recoveryVerification.strategy, { path: ['recoveryVerification'], message: 'Recovery verification must exercise the selected recovery strategy' });
const REQUIRED_CAPABILITY_IDS = Array.from({ length: 32 }, (_, index) => `CAP-${String(index + 1).padStart(3, '0')}`);
const AssistantRuntimeReleaseGateDecisionSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, requiredCapabilities: z.array(z.object({ capabilityId: z.string().regex(/^CAP-(00[1-9]|0[12][0-9]|03[0-2])$/), status: AssistantRuntimeCapabilityStatusSchema }).strict()).length(32), approvedTargetComplete: z.boolean(), exactBaselineParity: z.literal(false), blockingCapabilities: z.array(z.string().regex(/^CAP-(00[1-9]|0[12][0-9]|03[0-2])$/)).max(32), exclusions: z.array(z.object({ exclusionId: z.string().min(1).max(128), reason: z.string().min(1).max(1024) }).strict()).min(1).max(64), untestedPlatforms: z.array(z.string().min(1).max(128)).max(64), knownRisks: z.array(z.string().min(1).max(1024)).max(128), decidedAt: AssistantRuntimeTimestampSchema }).strict().superRefine((value, context) => {
  const unique = new Set(value.requiredCapabilities.map(item => item.capabilityId));
  if (unique.size !== value.requiredCapabilities.length || REQUIRED_CAPABILITY_IDS.some(item => !unique.has(item))) context.addIssue({ code: 'custom', path: ['requiredCapabilities'], message: 'Release gate must contain CAP-001 through CAP-032 exactly once', input: value });
  const blockers = value.requiredCapabilities.filter(item => item.status !== 'Verified').map(item => item.capabilityId);
  if (value.approvedTargetComplete !== (blockers.length === 0) || blockers.some(item => !value.blockingCapabilities.includes(item)) || value.blockingCapabilities.some(item => !blockers.includes(item))) context.addIssue({ code: 'custom', path: ['approvedTargetComplete'], message: 'Completion and blockers must exactly reflect required Verified status', input: value });
  if (!value.exclusions.some(item => item.exclusionId === 'suggested_sessions')) context.addIssue({ code: 'custom', path: ['exclusions'], message: 'Approved target must disclose the fixed suggested_sessions exclusion', input: value });
});

type AssistantRuntimeArtifactReference = z.output<typeof AssistantRuntimeArtifactReferenceSchema>;
type AssistantRuntimeArtifactMetadata = z.output<typeof AssistantRuntimeArtifactMetadataSchema>;
type AssistantRuntimeArtifactCommitOutcome = z.output<typeof AssistantRuntimeArtifactCommitOutcomeSchema>;
type AssistantRuntimeArtifactByteRange = z.output<typeof AssistantRuntimeArtifactByteRangeSchema>;
type AssistantRuntimeArtifactRetrievalRequest = z.output<typeof AssistantRuntimeArtifactRetrievalRequestSchema>;
type AssistantRuntimeArtifactRetrievalReceipt = z.output<typeof AssistantRuntimeArtifactRetrievalReceiptSchema>;
type AssistantRuntimeArtifactEventPayload = z.output<typeof AssistantRuntimeArtifactEventPayloadSchema>;
type AssistantRuntimeDeletionTarget = z.output<typeof AssistantRuntimeDeletionTargetSchema>;
type AssistantRuntimeDeletionStepName = z.output<typeof AssistantRuntimeDeletionStepNameSchema>;
type AssistantRuntimeDeletionStepReceipt = z.output<typeof AssistantRuntimeDeletionStepReceiptSchema>;
type AssistantRuntimeDeletionReceipt = z.output<typeof AssistantRuntimeDeletionReceiptSchema>;
type AssistantRuntimeDeletionRetryCommand = z.output<typeof AssistantRuntimeDeletionRetryCommandSchema>;
type AssistantRuntimeCorrelationContext = z.output<typeof AssistantRuntimeCorrelationContextSchema>;
type AssistantRuntimeAuditRecord = z.output<typeof AssistantRuntimeAuditRecordSchema>;
type AssistantRuntimeLiveness = z.output<typeof AssistantRuntimeLivenessSchema>;
type AssistantRuntimeDependencyHealth = z.output<typeof AssistantRuntimeDependencyHealthSchema>;
type AssistantRuntimePublicExposureGate = z.output<typeof AssistantRuntimePublicExposureGateSchema>;
type AssistantRuntimeReadiness = z.output<typeof AssistantRuntimeReadinessSchema>;
type AssistantRuntimeCapabilityStatus = z.output<typeof AssistantRuntimeCapabilityStatusSchema>;
type AssistantRuntimeCapabilityEvidenceReference = z.output<typeof AssistantRuntimeCapabilityEvidenceReferenceSchema>;
type AssistantRuntimeCapabilityLedgerEntry = z.output<typeof AssistantRuntimeCapabilityLedgerEntrySchema>;
type AssistantRuntimeCodingSessionAuditReceipt = z.output<typeof AssistantRuntimeCodingSessionAuditReceiptSchema>;
type AssistantRuntimeMigrationEvidence = z.output<typeof AssistantRuntimeMigrationEvidenceSchema>;
type AssistantRuntimeReleaseGateDecision = z.output<typeof AssistantRuntimeReleaseGateDecisionSchema>;

export type { AssistantRuntimeArtifactByteRange, AssistantRuntimeArtifactCommitOutcome, AssistantRuntimeArtifactEventPayload, AssistantRuntimeArtifactMetadata, AssistantRuntimeArtifactReference, AssistantRuntimeArtifactRetrievalReceipt, AssistantRuntimeArtifactRetrievalRequest, AssistantRuntimeAuditRecord, AssistantRuntimeCapabilityEvidenceReference, AssistantRuntimeCapabilityLedgerEntry, AssistantRuntimeCapabilityStatus, AssistantRuntimeCodingSessionAuditReceipt, AssistantRuntimeCorrelationContext, AssistantRuntimeDeletionReceipt, AssistantRuntimeDeletionRetryCommand, AssistantRuntimeDeletionStepName, AssistantRuntimeDeletionStepReceipt, AssistantRuntimeDeletionTarget, AssistantRuntimeDependencyHealth, AssistantRuntimeLiveness, AssistantRuntimeMigrationEvidence, AssistantRuntimePublicExposureGate, AssistantRuntimeReadiness, AssistantRuntimeReleaseGateDecision };
export { AssistantRuntimeArtifactByteRangeSchema, AssistantRuntimeArtifactCommitOutcomeSchema, AssistantRuntimeArtifactEventPayloadSchema, AssistantRuntimeArtifactMetadataSchema, AssistantRuntimeArtifactReferenceSchema, AssistantRuntimeArtifactRetrievalReceiptSchema, AssistantRuntimeArtifactRetrievalRequestSchema, AssistantRuntimeAuditRecordSchema, AssistantRuntimeCapabilityEvidenceReferenceSchema, AssistantRuntimeCapabilityLedgerEntrySchema, AssistantRuntimeCapabilityStatusSchema, AssistantRuntimeCodingSessionAuditReceiptSchema, AssistantRuntimeCorrelationContextSchema, AssistantRuntimeDeletionReceiptSchema, AssistantRuntimeDeletionRetryCommandSchema, AssistantRuntimeDeletionStepNameSchema, AssistantRuntimeDeletionStepReceiptSchema, AssistantRuntimeDeletionTargetSchema, AssistantRuntimeDependencyHealthSchema, AssistantRuntimeLivenessSchema, AssistantRuntimeMigrationEvidenceSchema, AssistantRuntimePublicExposureGateSchema, AssistantRuntimeReadinessSchema, AssistantRuntimeReleaseGateDecisionSchema };
