import { z } from 'zod';
import { AssistantRuntimeArtifactReferenceSchema } from './artifact-observability';
import { AssistantRuntimeHttpsUrlSchema } from './model-context-memory';
import { AssistantRuntimeCommandIdSchema, AssistantRuntimeResourceVersionSchema, AssistantRuntimeRunIdSchema, AssistantRuntimeSchemaVersionSchema, AssistantRuntimeSessionIdSchema, AssistantRuntimeTimestampSchema } from './protocol';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const SecretReferenceSchema = z.string().regex(/^secret:\/\/[A-Za-z0-9._/-]{1,240}$/);
const RelativePathSchema = z.string().min(1).max(2048).refine(path => {
  const normalized = path.replaceAll('\\', '/');
  return !normalized.startsWith('/') && !/^[A-Za-z]:/.test(normalized) && !normalized.split('/').includes('..');
}, 'Path must stay relative to the workspace');
const BoundedJsonSchema = z.record(z.string().min(1).max(128), z.json()).refine(value => JSON.stringify(value).length <= 65_536, 'Inline JSON exceeds 64 KiB');

/** 静态拒绝明显内网地址；连接器仍须在初始、redirect 和实际连接时重新解析 DNS。 */
const AssistantRuntimePublicHttpsUrlSchema = AssistantRuntimeHttpsUrlSchema.refine(value => {
  const host = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (/^(0\.|10\.|127\.|192\.168\.|169\.254\.|198\.18\.|198\.19\.)/.test(host)) return false;
  const match = host.match(/^(100|172)\.(\d{1,3})\./);
  if (match?.[1] === '100' && Number(match[2]) >= 64 && Number(match[2]) <= 127) return false;
  if (match?.[1] === '172' && Number(match[2]) >= 16 && Number(match[2]) <= 31) return false;
  return !['::', '::1', '169.254.169.254'].includes(host) && !/^(fe[89ab]|fc|fd)/.test(host);
}, 'Remote endpoint must be public-network HTTPS');

const AssistantRuntimeRemoteMcpConfigurationSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, connectionId: z.string().min(1).max(128), resourceVersion: AssistantRuntimeResourceVersionSchema, ownerId: z.string().min(1).max(128), displayName: z.string().min(1).max(128), transport: z.literal('https'), endpoint: AssistantRuntimePublicHttpsUrlSchema, enabled: z.boolean(), authReference: SecretReferenceSchema.nullable() });
const remoteMcpCommandBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, commandId: AssistantRuntimeCommandIdSchema, idempotencyKey: z.string().min(1).max(256), connectionId: z.string().min(1).max(128), ownerId: z.string().min(1).max(128) };
const AssistantRuntimeRemoteMcpOAuthCommandSchema = z.discriminatedUnion('action', [
  z.object({ ...remoteMcpCommandBase, action: z.literal('begin_login'), redirectUri: AssistantRuntimePublicHttpsUrlSchema, stateReference: SecretReferenceSchema }),
  z.object({ ...remoteMcpCommandBase, action: z.literal('complete_callback'), stateReference: SecretReferenceSchema, authorizationCodeReference: SecretReferenceSchema }),
  z.object({ ...remoteMcpCommandBase, action: z.literal('refresh'), credentialReference: SecretReferenceSchema }),
  z.object({ ...remoteMcpCommandBase, action: z.literal('logout'), credentialReference: SecretReferenceSchema }),
]);
const AssistantRuntimeRemoteMcpConnectionStateSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, connectionId: z.string().min(1).max(128), resourceVersion: AssistantRuntimeResourceVersionSchema, status: z.enum(['disabled', 'authorization_required', 'connecting', 'ready', 'degraded', 'revoked']), catalogGeneration: z.int().positive().nullable(), checkedAt: AssistantRuntimeTimestampSchema, retryAt: AssistantRuntimeTimestampSchema.nullable() });
const AssistantRuntimeRemoteMcpCatalogSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, connectionId: z.string().min(1).max(128), generation: z.int().positive(), capturedAt: AssistantRuntimeTimestampSchema, tools: z.array(z.object({ name: z.string().min(1).max(256), description: z.string().max(4096), schemaHash: Sha256Schema, inputSchema: BoundedJsonSchema, outputSchema: BoundedJsonSchema.nullable() })).max(1024) });
const remoteExecutionIdentity = { executionId: z.string().min(1).max(128), attempt: z.int().positive(), requestHash: Sha256Schema };
const AssistantRuntimeRemoteMcpToolRequestSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, ...remoteExecutionIdentity, ownerId: z.string().min(1).max(128), runId: AssistantRuntimeRunIdSchema, connectionId: z.string().min(1).max(128), catalogGeneration: z.int().positive(), toolName: z.string().min(1).max(256), inputSchemaHash: Sha256Schema, input: BoundedJsonSchema, idempotency: z.enum(['safe_retry', 'never_automatic_retry']) });
const remoteResultBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, ...remoteExecutionIdentity, connectionId: z.string().min(1).max(128), catalogGeneration: z.int().positive(), completedAt: AssistantRuntimeTimestampSchema };
const AssistantRuntimeRemoteMcpToolResultSchema = z.discriminatedUnion('status', [
  z.object({ ...remoteResultBase, status: z.literal('completed'), output: BoundedJsonSchema.optional(), artifactReference: AssistantRuntimeArtifactReferenceSchema.optional() }).refine(value => value.output !== undefined || value.artifactReference !== undefined, 'Completed result needs inline output or artifact'),
  z.object({ ...remoteResultBase, status: z.literal('failed'), errorCode: z.string().min(1).max(128), message: z.string().min(1).max(4096), retryable: z.boolean() }),
  z.object({ ...remoteResultBase, status: z.literal('result_unknown'), reason: z.string().min(1).max(4096), mayHaveSideEffects: z.literal(true) }),
  z.object({ ...remoteResultBase, status: z.literal('cancelled'), outcome: z.enum(['observed', 'unknown']) }),
]);

const AssistantRuntimeBindingCapabilitySchema = z.enum(['file_read', 'file_search', 'file_patch', 'shell', 'process_input', 'image_view']);
const approvalBase = { version: AssistantRuntimeResourceVersionSchema, readAndSearch: z.literal('automatic_inside_workspace'), patch: z.literal('render_diff_then_apply_inside_workspace'), outsideWorkspace: z.literal('deny') };
const AssistantRuntimeLocalApprovalPolicySchema = z.discriminatedUnion('shell', [z.object({ ...approvalBase, shell: z.literal('confirm_each') }), z.object({ ...approvalBase, shell: z.literal('automatic_inside_workspace_for_session'), sessionId: AssistantRuntimeSessionIdSchema, expiresAt: AssistantRuntimeTimestampSchema })]);
const AssistantRuntimeClientBindingSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, bindingId: z.string().min(1).max(128), ownerId: z.string().min(1).max(128), cliInstanceId: z.string().min(1).max(128), workspaceId: z.string().min(1).max(128), workspaceFingerprint: Sha256Schema, streamCredentialReference: SecretReferenceSchema, capabilities: z.array(AssistantRuntimeBindingCapabilitySchema).min(1).max(32), approvalPolicy: AssistantRuntimeLocalApprovalPolicySchema, leaseVersion: AssistantRuntimeResourceVersionSchema, fencingToken: z.int().nonnegative(), leaseExpiresAt: AssistantRuntimeTimestampSchema });
const AssistantRuntimeToolExecutionIdentitySchema = z.object({ executionId: z.string().min(1).max(128), attempt: z.int().positive(), bindingId: z.string().min(1).max(128), requestHash: Sha256Schema, fencingToken: z.int().nonnegative() });
/** CLI 的 realpath 校验回执；两个路径都必须留在绑定 workspace。 */
const AssistantRuntimeLocalPathResolutionSchema = z.object({ workspaceId: z.string().min(1).max(128), workspaceFingerprint: Sha256Schema, requestedRelativePath: RelativePathSchema, canonicalRelativePath: RelativePathSchema, containment: z.literal('inside_workspace'), symbolicLinkEscape: z.literal(false) });

const codingInputBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, toolVersion: z.literal(1) };
const AssistantRuntimeCodingToolInputSchema = z.discriminatedUnion('toolName', [
  z.object({ ...codingInputBase, toolName: z.literal('apply_patch'), patch: z.string().min(1).max(1_048_576), expectedFiles: z.array(z.object({ relativePath: RelativePathSchema, sha256: Sha256Schema })).min(1).max(1024) }),
  z.object({ ...codingInputBase, toolName: z.literal('exec_command'), executable: z.string().min(1).max(4096), arguments: z.array(z.string().max(8192)).max(1024), workingDirectory: AssistantRuntimeLocalPathResolutionSchema, terminal: z.boolean() }),
  z.object({ ...codingInputBase, toolName: z.literal('write_stdin'), processHandle: z.string().min(32).max(256), operationId: z.string().min(1).max(128), data: z.string().max(65_536) }),
  z.object({ ...codingInputBase, toolName: z.literal('read_file'), relativePath: RelativePathSchema, offset: z.int().nonnegative(), limit: z.int().positive().max(1_048_576) }),
  z.object({ ...codingInputBase, toolName: z.literal('search_files'), query: z.string().min(1).max(8192), roots: z.array(RelativePathSchema).min(1).max(128), maxResults: z.int().positive().max(10_000) }),
  z.object({ ...codingInputBase, toolName: z.literal('view_image'), relativePath: RelativePathSchema, detail: z.enum(['auto', 'low', 'high', 'original']) }),
  z.object({ ...codingInputBase, toolName: z.literal('web'), operation: z.enum(['search', 'open', 'find']), request: z.string().min(1).max(16_384) }),
  z.object({ ...codingInputBase, toolName: z.literal('image_generation'), prompt: z.string().min(1).max(32_768), referencedArtifacts: z.array(AssistantRuntimeArtifactReferenceSchema).max(16) }),
  z.object({ ...codingInputBase, toolName: z.literal('update_plan'), planVersion: AssistantRuntimeResourceVersionSchema, steps: z.array(z.object({ stepId: z.string().min(1).max(128), description: z.string().min(1).max(4096), status: z.enum(['pending', 'in_progress', 'completed']) })).max(256) }),
  z.object({ ...codingInputBase, toolName: z.literal('context_budget'), operation: z.literal('inspect') }),
]);
const AssistantRuntimeCodingToolNameSchema = z.enum(['apply_patch', 'exec_command', 'write_stdin', 'read_file', 'search_files', 'view_image', 'web', 'image_generation', 'update_plan', 'context_budget']);
const completedResultBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, toolVersion: z.literal(1), status: z.literal('completed') };
const AssistantRuntimeCodingToolCompletedResultSchema = z.discriminatedUnion('toolName', [
  z.object({ ...completedResultBase, toolName: z.literal('apply_patch'), changedPaths: z.array(AssistantRuntimeLocalPathResolutionSchema).max(1024), conflictPaths: z.array(RelativePathSchema).max(1024) }),
  z.object({ ...completedResultBase, toolName: z.literal('exec_command'), processHandle: z.string().min(32).max(256).nullable(), exitCode: z.int().nullable(), output: z.string().max(65_536).optional(), artifactReference: AssistantRuntimeArtifactReferenceSchema.optional() }),
  z.object({ ...completedResultBase, toolName: z.literal('write_stdin'), operationId: z.string().min(1).max(128), bytesAccepted: z.int().nonnegative() }),
  z.object({ ...completedResultBase, toolName: z.literal('read_file'), content: z.string().max(65_536).optional(), artifactReference: AssistantRuntimeArtifactReferenceSchema.optional(), sha256: Sha256Schema }),
  z.object({ ...completedResultBase, toolName: z.literal('search_files'), matches: z.array(z.object({ relativePath: RelativePathSchema, line: z.int().positive(), preview: z.string().max(4096) })).max(10_000), artifactReference: AssistantRuntimeArtifactReferenceSchema.optional() }),
  z.object({ ...completedResultBase, toolName: z.literal('view_image'), artifactReference: AssistantRuntimeArtifactReferenceSchema, mimeType: z.string().regex(/^image\//) }),
  z.object({ ...completedResultBase, toolName: z.literal('web'), output: z.string().max(65_536).optional(), artifactReference: AssistantRuntimeArtifactReferenceSchema.optional() }),
  z.object({ ...completedResultBase, toolName: z.literal('image_generation'), artifactReference: AssistantRuntimeArtifactReferenceSchema }),
  z.object({ ...completedResultBase, toolName: z.literal('update_plan'), planVersion: AssistantRuntimeResourceVersionSchema }),
  z.object({ ...completedResultBase, toolName: z.literal('context_budget'), contextLimit: z.int().positive(), tokensUsed: z.int().nonnegative(), tokensRemaining: z.int().nonnegative() }),
]);
const codingTerminalBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, toolVersion: z.literal(1), toolName: AssistantRuntimeCodingToolNameSchema };
const AssistantRuntimeCodingToolResultSchema = z.union([
  AssistantRuntimeCodingToolCompletedResultSchema,
  z.object({ ...codingTerminalBase, status: z.literal('failed'), errorCode: z.string().min(1).max(128), message: z.string().min(1).max(4096), retryable: z.boolean() }),
  z.object({ ...codingTerminalBase, status: z.literal('result_unknown'), reason: z.string().min(1).max(4096), mayHaveSideEffects: z.literal(true) }),
  z.object({ ...codingTerminalBase, status: z.literal('cancelled'), outcome: z.enum(['observed', 'unknown']) }),
]);

const LOCAL_TOOL_NAMES = new Set(['apply_patch', 'exec_command', 'write_stdin', 'read_file', 'search_files', 'view_image']);
const localExecutionBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, ...AssistantRuntimeToolExecutionIdentitySchema.shape, runId: AssistantRuntimeRunIdSchema, sessionId: AssistantRuntimeSessionIdSchema, workspaceId: z.string().min(1).max(128) };
const AssistantRuntimeLocalToolRequestSchema = z.object({ ...localExecutionBase, approvalPolicyVersion: AssistantRuntimeResourceVersionSchema, idempotency: z.enum(['safe_retry', 'retry_with_precondition', 'never_automatic_retry']), tool: AssistantRuntimeCodingToolInputSchema, createdAt: AssistantRuntimeTimestampSchema }).refine(value => LOCAL_TOOL_NAMES.has(value.tool.toolName), { path: ['tool', 'toolName'], message: 'Local gateway accepts only bound CLI tools' });
const submissionBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, ...AssistantRuntimeToolExecutionIdentitySchema.shape, commandId: AssistantRuntimeCommandIdSchema, idempotencyKey: z.string().min(1).max(256), expectedExecutionVersion: AssistantRuntimeResourceVersionSchema };
const AssistantRuntimeLocalToolAcknowledgementSchema = z.object({ ...submissionBase, acknowledgedAt: AssistantRuntimeTimestampSchema, disposition: z.enum(['accepted', 'rejected_stale_binding', 'rejected_policy', 'rejected_unsupported']) });
const AssistantRuntimeLocalToolResultSchema = z.discriminatedUnion('status', [
  z.object({ ...submissionBase, completedAt: AssistantRuntimeTimestampSchema, status: z.literal('completed'), result: AssistantRuntimeCodingToolCompletedResultSchema }),
  z.object({ ...submissionBase, completedAt: AssistantRuntimeTimestampSchema, status: z.literal('failed'), errorCode: z.string().min(1).max(128), message: z.string().min(1).max(4096), retryable: z.boolean() }),
  z.object({ ...submissionBase, completedAt: AssistantRuntimeTimestampSchema, status: z.literal('conflict'), message: z.string().min(1).max(4096), currentContentHash: Sha256Schema.optional() }),
  z.object({ ...submissionBase, completedAt: AssistantRuntimeTimestampSchema, status: z.literal('rejected'), reason: z.string().min(1).max(4096) }),
  z.object({ ...submissionBase, completedAt: AssistantRuntimeTimestampSchema, status: z.literal('result_unknown'), reason: z.string().min(1).max(4096), mayHaveSideEffects: z.literal(true) }),
  z.object({ ...submissionBase, completedAt: AssistantRuntimeTimestampSchema, status: z.literal('cancelled'), outcome: z.enum(['observed', 'unknown']) }),
]);
const AssistantRuntimeLocalToolResultReceiptSchema = z.discriminatedUnion('disposition', [
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, commandId: AssistantRuntimeCommandIdSchema, executionId: z.string().min(1).max(128), attempt: z.int().positive(), disposition: z.literal('accepted'), terminalExecutionVersion: AssistantRuntimeResourceVersionSchema }),
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, commandId: AssistantRuntimeCommandIdSchema, executionId: z.string().min(1).max(128), attempt: z.int().positive(), disposition: z.literal('replayed'), terminalExecutionVersion: AssistantRuntimeResourceVersionSchema }),
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, commandId: AssistantRuntimeCommandIdSchema, executionId: z.string().min(1).max(128), attempt: z.int().positive(), disposition: z.literal('conflict'), currentExecutionVersion: AssistantRuntimeResourceVersionSchema, terminalStatus: z.string().min(1).max(64).nullable() }),
]);

const processIdentity = { schemaVersion: AssistantRuntimeSchemaVersionSchema, ...AssistantRuntimeToolExecutionIdentitySchema.shape };
const operationIdentity = { operationId: z.string().min(1).max(128), idempotencyKey: z.string().min(1).max(256) };
const AssistantRuntimeProcessCommandSchema = z.discriminatedUnion('command', [
  z.object({ ...processIdentity, ...operationIdentity, command: z.literal('start'), executable: z.string().min(1).max(4096), arguments: z.array(z.string().max(8192)).max(1024), workingDirectory: AssistantRuntimeLocalPathResolutionSchema, terminal: z.boolean() }),
  z.object({ ...processIdentity, ...operationIdentity, command: z.literal('write_input'), processHandle: z.string().min(32).max(256), data: z.string().max(65_536) }),
  z.object({ ...processIdentity, ...operationIdentity, command: z.literal('resize'), processHandle: z.string().min(32).max(256), columns: z.int().positive().max(1000), rows: z.int().positive().max(1000) }),
  z.object({ ...processIdentity, command: z.literal('poll'), processHandle: z.string().min(32).max(256), afterSequence: z.int().nonnegative() }),
  z.object({ ...processIdentity, ...operationIdentity, command: z.literal('terminate_tree'), processHandle: z.string().min(32).max(256), reason: z.string().min(1).max(1024) }),
]);
const AssistantRuntimeProcessObservationSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, ...AssistantRuntimeToolExecutionIdentitySchema.shape, processHandle: z.string().min(32).max(256), chunks: z.array(z.object({ sequence: z.int().nonnegative(), stream: z.enum(['stdout', 'stderr']), encoding: z.enum(['utf8', 'base64']), data: z.string().max(65_536) })).max(1024), truncated: z.boolean(), overflowArtifactReference: AssistantRuntimeArtifactReferenceSchema.nullable(), state: z.enum(['running', 'exited', 'termination_unknown', 'owner_lost']), exitCode: z.int().nullable(), exitSignal: z.string().min(1).max(32).nullable(), nextSequence: z.int().nonnegative() }).superRefine((value, context) => {
  if (value.truncated !== (value.overflowArtifactReference !== null)) context.addIssue({ code: 'custom', path: ['overflowArtifactReference'], message: 'Truncated output requires an artifact and only truncated output may reference one', input: value });
  const hasExit = value.exitCode !== null || value.exitSignal !== null;
  if ((value.state === 'exited') !== hasExit || (value.exitCode !== null && value.exitSignal !== null)) context.addIssue({ code: 'custom', path: ['exitCode'], message: 'Only exited processes have exactly one exit code or signal', input: value });
});
const AssistantRuntimeCodingToolDescriptorSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, toolName: AssistantRuntimeCodingToolNameSchema, toolVersion: z.literal(1), executionLocation: z.enum(['bound_cli', 'runtime', 'remote_service']), ownerScope: z.literal('session_owner'), workspacePolicy: z.enum(['required_and_confined', 'not_applicable']), maxInlineResultBytes: z.int().positive().max(1_048_576), overflow: z.literal('artifact'), cancellation: z.enum(['cooperative', 'process_tree']), failureSemantics: z.literal('explicit_failure_or_result_unknown') }).superRefine((value, context) => {
  const local = LOCAL_TOOL_NAMES.has(value.toolName);
  if (local && (value.executionLocation !== 'bound_cli' || value.workspacePolicy !== 'required_and_confined')) context.addIssue({ code: 'custom', path: ['executionLocation'], message: 'Local coding tools must execute in the confined bound CLI', input: value });
  if (!local && value.workspacePolicy !== 'not_applicable') context.addIssue({ code: 'custom', path: ['workspacePolicy'], message: 'Non-local tools cannot claim workspace access', input: value });
});

const allowedResponders = z.object({ ownerId: z.string().min(1).max(128), bindingIds: z.array(z.string().min(1).max(128)).min(1).max(32) });
const interruptBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, interruptId: z.string().min(1).max(128), runId: AssistantRuntimeRunIdSchema, checkpointId: z.string().min(1).max(128), resourceVersion: AssistantRuntimeResourceVersionSchema, allowedResponders };
const choice = z.object({ choiceId: z.string().min(1).max(128), label: z.string().min(1).max(1024) });
const AssistantRuntimeInterruptSchema = z.union([
  z.object({ ...interruptBase, kind: z.literal('question'), prompt: z.string().min(1).max(8192), answerFormat: z.literal('text'), displayPolicy: z.literal('plain') }),
  z.object({ ...interruptBase, kind: z.literal('question'), prompt: z.string().min(1).max(8192), answerFormat: z.literal('secret'), displayPolicy: z.literal('masked') }),
  z.object({ ...interruptBase, kind: z.literal('question'), prompt: z.string().min(1).max(8192), answerFormat: z.literal('single_choice'), displayPolicy: z.literal('plain'), choiceSetHash: Sha256Schema, choices: z.array(choice).min(2).max(64) }),
  z.object({ ...interruptBase, kind: z.literal('question'), prompt: z.string().min(1).max(8192), answerFormat: z.literal('multiple_choice'), displayPolicy: z.literal('plain'), choiceSetHash: Sha256Schema, choices: z.array(choice).min(2).max(64) }),
  z.object({ ...interruptBase, kind: z.literal('approval'), summary: z.string().min(1).max(8192), requestedAction: z.string().min(1).max(256), risk: z.enum(['low', 'medium', 'high']), displayPolicy: z.literal('plain') }),
]);
const resolutionBase = { schemaVersion: AssistantRuntimeSchemaVersionSchema, interruptId: z.string().min(1).max(128), runId: AssistantRuntimeRunIdSchema, checkpointId: z.string().min(1).max(128), resourceVersion: AssistantRuntimeResourceVersionSchema, responderOwnerId: z.string().min(1).max(128), responderBindingId: z.string().min(1).max(128), commandId: AssistantRuntimeCommandIdSchema, idempotencyKey: z.string().min(1).max(256) };
const AssistantRuntimeInterruptResolutionSchema = z.union([
  z.object({ ...resolutionBase, interruptKind: z.literal('question'), answerFormat: z.enum(['text', 'secret']), resolution: z.literal('answered'), answer: z.string().max(65_536) }),
  z.object({ ...resolutionBase, interruptKind: z.literal('question'), answerFormat: z.literal('single_choice'), resolution: z.literal('answered'), choiceSetHash: Sha256Schema, selectedChoiceId: z.string().min(1).max(128) }),
  z.object({ ...resolutionBase, interruptKind: z.literal('question'), answerFormat: z.literal('multiple_choice'), resolution: z.literal('answered'), choiceSetHash: Sha256Schema, selectedChoiceIds: z.array(z.string().min(1).max(128)).min(1).max(64) }),
  z.object({ ...resolutionBase, interruptKind: z.literal('question'), resolution: z.literal('cancelled'), reason: z.string().min(1).max(4096) }),
  z.object({ ...resolutionBase, interruptKind: z.literal('approval'), resolution: z.literal('approved') }),
  z.object({ ...resolutionBase, interruptKind: z.literal('approval'), resolution: z.literal('rejected'), reason: z.string().min(1).max(4096) }),
  z.object({ ...resolutionBase, interruptKind: z.literal('approval'), resolution: z.literal('cancelled'), reason: z.string().min(1).max(4096) }),
]);
const AssistantRuntimeInterruptResolutionReceiptSchema = z.discriminatedUnion('disposition', [
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, interruptId: z.string().min(1).max(128), commandId: AssistantRuntimeCommandIdSchema, disposition: z.literal('accepted'), terminalResourceVersion: AssistantRuntimeResourceVersionSchema }),
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, interruptId: z.string().min(1).max(128), commandId: AssistantRuntimeCommandIdSchema, disposition: z.literal('replayed'), terminalResourceVersion: AssistantRuntimeResourceVersionSchema }),
  z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, interruptId: z.string().min(1).max(128), commandId: AssistantRuntimeCommandIdSchema, disposition: z.literal('conflict'), currentResourceVersion: AssistantRuntimeResourceVersionSchema }),
]);

const AssistantRuntimeSubAgentBudgetSchema = z.object({ maxTokens: z.int().positive(), maxToolExecutions: z.int().nonnegative(), deadlineAt: AssistantRuntimeTimestampSchema });
const AssistantRuntimeSubAgentPermissionSnapshotSchema = z.object({ ownerId: z.string().min(1).max(128), workspaceId: z.string().min(1).max(128), toolNames: z.array(z.string().min(1).max(128)).max(256), memoryScopes: z.array(z.string().min(1).max(128)).max(64) });
const AssistantRuntimeSubAgentParentSnapshotReferenceSchema = z.object({ parentRunId: AssistantRuntimeRunIdSchema, snapshotId: z.string().min(1).max(128), resourceVersion: AssistantRuntimeResourceVersionSchema, snapshotHash: Sha256Schema, budgetLedgerVersion: AssistantRuntimeResourceVersionSchema });
const AssistantRuntimeSubAgentRunRequestSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, parentRunId: AssistantRuntimeRunIdSchema, childRunId: AssistantRuntimeRunIdSchema, lineage: z.array(AssistantRuntimeRunIdSchema).min(1).max(32), objective: z.string().min(1).max(16_384), isolatedContextSnapshotId: z.string().min(1).max(128), parentSnapshotReference: AssistantRuntimeSubAgentParentSnapshotReferenceSchema, childPermissions: AssistantRuntimeSubAgentPermissionSnapshotSchema, childBudget: AssistantRuntimeSubAgentBudgetSchema, budgetReservationId: z.string().min(1).max(128), returnMode: z.literal('automatic_to_parent') }).superRefine((value, context) => {
  if (value.parentRunId === value.childRunId || value.lineage.at(-1) !== value.parentRunId || value.lineage.includes(value.childRunId)) context.addIssue({ code: 'custom', path: ['lineage'], message: 'Lineage must end at the parent and exclude the new child', input: value });
  if (value.parentSnapshotReference.parentRunId !== value.parentRunId) context.addIssue({ code: 'custom', path: ['parentSnapshotReference'], message: 'Parent snapshot must belong to the parent Run', input: value });
});
/** 服务端解析耐久 parent snapshot 并以 budget ledger CAS 成功后，才能产生 accepted admission。 */
const AssistantRuntimeSubAgentAdmissionSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, request: AssistantRuntimeSubAgentRunRequestSchema, resolvedParentPermissions: AssistantRuntimeSubAgentPermissionSnapshotSchema, resolvedParentBudget: AssistantRuntimeSubAgentBudgetSchema, committedBudgetLedgerVersion: AssistantRuntimeResourceVersionSchema, disposition: z.literal('accepted') }).superRefine((value, context) => {
  const { request, resolvedParentPermissions: parent, resolvedParentBudget: budget } = value;
  const child = request.childPermissions;
  if (child.ownerId !== parent.ownerId || child.workspaceId !== parent.workspaceId) context.addIssue({ code: 'custom', path: ['request', 'childPermissions'], message: 'Child owner and workspace must exactly inherit the durable parent snapshot', input: value });
  if (!child.toolNames.every(item => parent.toolNames.includes(item)) || !child.memoryScopes.every(item => parent.memoryScopes.includes(item))) context.addIssue({ code: 'custom', path: ['request', 'childPermissions'], message: 'Child tools and memory scopes must be a subset of the durable parent snapshot', input: value });
  if (request.childBudget.maxTokens > budget.maxTokens || request.childBudget.maxToolExecutions > budget.maxToolExecutions || Date.parse(request.childBudget.deadlineAt) > Date.parse(budget.deadlineAt)) context.addIssue({ code: 'custom', path: ['request', 'childBudget'], message: 'Child budget must not exceed durable parent remaining budget', input: value });
  if (value.committedBudgetLedgerVersion !== request.parentSnapshotReference.budgetLedgerVersion + 1) context.addIssue({ code: 'custom', path: ['committedBudgetLedgerVersion'], message: 'Admission must commit the next budget ledger CAS version', input: value });
});
const AssistantRuntimeSubAgentCancellationSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, commandId: AssistantRuntimeCommandIdSchema, idempotencyKey: z.string().min(1).max(256), parentRunId: AssistantRuntimeRunIdSchema, childRunId: AssistantRuntimeRunIdSchema, source: z.literal('parent'), action: z.literal('cancel_unfinished_child') }).refine(value => value.parentRunId !== value.childRunId, { path: ['childRunId'], message: 'Cancellation must target a child Run' });
const AssistantRuntimeSubAgentRunResultSchema = z.object({ schemaVersion: AssistantRuntimeSchemaVersionSchema, parentRunId: AssistantRuntimeRunIdSchema, childRunId: AssistantRuntimeRunIdSchema, status: z.enum(['completed', 'failed', 'cancelled', 'budget_exhausted']), returnedAt: AssistantRuntimeTimestampSchema, returnMode: z.literal('automatic_to_parent'), boundedResult: z.string().max(65_536).optional(), artifactReference: AssistantRuntimeArtifactReferenceSchema.optional(), cancellationSource: z.enum(['parent', 'child', 'runtime']).optional() }).refine(value => value.status !== 'completed' || value.boundedResult !== undefined || value.artifactReference !== undefined, { path: ['boundedResult'], message: 'Completed child Run must return a result' });

type AssistantRuntimePublicHttpsUrl = z.output<typeof AssistantRuntimePublicHttpsUrlSchema>;
type AssistantRuntimeRemoteMcpConfiguration = z.output<typeof AssistantRuntimeRemoteMcpConfigurationSchema>;
type AssistantRuntimeRemoteMcpOAuthCommand = z.output<typeof AssistantRuntimeRemoteMcpOAuthCommandSchema>;
type AssistantRuntimeRemoteMcpConnectionState = z.output<typeof AssistantRuntimeRemoteMcpConnectionStateSchema>;
type AssistantRuntimeRemoteMcpCatalog = z.output<typeof AssistantRuntimeRemoteMcpCatalogSchema>;
type AssistantRuntimeRemoteMcpToolRequest = z.output<typeof AssistantRuntimeRemoteMcpToolRequestSchema>;
type AssistantRuntimeRemoteMcpToolResult = z.output<typeof AssistantRuntimeRemoteMcpToolResultSchema>;
type AssistantRuntimeBindingCapability = z.output<typeof AssistantRuntimeBindingCapabilitySchema>;
type AssistantRuntimeLocalApprovalPolicy = z.output<typeof AssistantRuntimeLocalApprovalPolicySchema>;
type AssistantRuntimeClientBinding = z.output<typeof AssistantRuntimeClientBindingSchema>;
type AssistantRuntimeToolExecutionIdentity = z.output<typeof AssistantRuntimeToolExecutionIdentitySchema>;
type AssistantRuntimeLocalPathResolution = z.output<typeof AssistantRuntimeLocalPathResolutionSchema>;
type AssistantRuntimeCodingToolInput = z.output<typeof AssistantRuntimeCodingToolInputSchema>;
type AssistantRuntimeCodingToolResult = z.output<typeof AssistantRuntimeCodingToolResultSchema>;
type AssistantRuntimeLocalToolRequest = z.output<typeof AssistantRuntimeLocalToolRequestSchema>;
type AssistantRuntimeLocalToolAcknowledgement = z.output<typeof AssistantRuntimeLocalToolAcknowledgementSchema>;
type AssistantRuntimeLocalToolResult = z.output<typeof AssistantRuntimeLocalToolResultSchema>;
type AssistantRuntimeLocalToolResultReceipt = z.output<typeof AssistantRuntimeLocalToolResultReceiptSchema>;
type AssistantRuntimeProcessCommand = z.output<typeof AssistantRuntimeProcessCommandSchema>;
type AssistantRuntimeProcessObservation = z.output<typeof AssistantRuntimeProcessObservationSchema>;
type AssistantRuntimeCodingToolName = z.output<typeof AssistantRuntimeCodingToolNameSchema>;
type AssistantRuntimeCodingToolDescriptor = z.output<typeof AssistantRuntimeCodingToolDescriptorSchema>;
type AssistantRuntimeInterrupt = z.output<typeof AssistantRuntimeInterruptSchema>;
type AssistantRuntimeInterruptResolution = z.output<typeof AssistantRuntimeInterruptResolutionSchema>;
type AssistantRuntimeInterruptResolutionReceipt = z.output<typeof AssistantRuntimeInterruptResolutionReceiptSchema>;
type AssistantRuntimeSubAgentBudget = z.output<typeof AssistantRuntimeSubAgentBudgetSchema>;
type AssistantRuntimeSubAgentPermissionSnapshot = z.output<typeof AssistantRuntimeSubAgentPermissionSnapshotSchema>;
type AssistantRuntimeSubAgentParentSnapshotReference = z.output<typeof AssistantRuntimeSubAgentParentSnapshotReferenceSchema>;
type AssistantRuntimeSubAgentRunRequest = z.output<typeof AssistantRuntimeSubAgentRunRequestSchema>;
type AssistantRuntimeSubAgentAdmission = z.output<typeof AssistantRuntimeSubAgentAdmissionSchema>;
type AssistantRuntimeSubAgentCancellation = z.output<typeof AssistantRuntimeSubAgentCancellationSchema>;
type AssistantRuntimeSubAgentRunResult = z.output<typeof AssistantRuntimeSubAgentRunResultSchema>;

export type { AssistantRuntimeBindingCapability, AssistantRuntimeClientBinding, AssistantRuntimeCodingToolDescriptor, AssistantRuntimeCodingToolInput, AssistantRuntimeCodingToolName, AssistantRuntimeCodingToolResult, AssistantRuntimeInterrupt, AssistantRuntimeInterruptResolution, AssistantRuntimeInterruptResolutionReceipt, AssistantRuntimeLocalApprovalPolicy, AssistantRuntimeLocalPathResolution, AssistantRuntimeLocalToolAcknowledgement, AssistantRuntimeLocalToolRequest, AssistantRuntimeLocalToolResult, AssistantRuntimeLocalToolResultReceipt, AssistantRuntimeProcessCommand, AssistantRuntimeProcessObservation, AssistantRuntimePublicHttpsUrl, AssistantRuntimeRemoteMcpCatalog, AssistantRuntimeRemoteMcpConfiguration, AssistantRuntimeRemoteMcpConnectionState, AssistantRuntimeRemoteMcpOAuthCommand, AssistantRuntimeRemoteMcpToolRequest, AssistantRuntimeRemoteMcpToolResult, AssistantRuntimeSubAgentAdmission, AssistantRuntimeSubAgentBudget, AssistantRuntimeSubAgentCancellation, AssistantRuntimeSubAgentParentSnapshotReference, AssistantRuntimeSubAgentPermissionSnapshot, AssistantRuntimeSubAgentRunRequest, AssistantRuntimeSubAgentRunResult, AssistantRuntimeToolExecutionIdentity };
export { AssistantRuntimeBindingCapabilitySchema, AssistantRuntimeClientBindingSchema, AssistantRuntimeCodingToolDescriptorSchema, AssistantRuntimeCodingToolInputSchema, AssistantRuntimeCodingToolNameSchema, AssistantRuntimeCodingToolResultSchema, AssistantRuntimeInterruptResolutionReceiptSchema, AssistantRuntimeInterruptResolutionSchema, AssistantRuntimeInterruptSchema, AssistantRuntimeLocalApprovalPolicySchema, AssistantRuntimeLocalPathResolutionSchema, AssistantRuntimeLocalToolAcknowledgementSchema, AssistantRuntimeLocalToolRequestSchema, AssistantRuntimeLocalToolResultReceiptSchema, AssistantRuntimeLocalToolResultSchema, AssistantRuntimeProcessCommandSchema, AssistantRuntimeProcessObservationSchema, AssistantRuntimePublicHttpsUrlSchema, AssistantRuntimeRemoteMcpCatalogSchema, AssistantRuntimeRemoteMcpConfigurationSchema, AssistantRuntimeRemoteMcpConnectionStateSchema, AssistantRuntimeRemoteMcpOAuthCommandSchema, AssistantRuntimeRemoteMcpToolRequestSchema, AssistantRuntimeRemoteMcpToolResultSchema, AssistantRuntimeSubAgentAdmissionSchema, AssistantRuntimeSubAgentBudgetSchema, AssistantRuntimeSubAgentCancellationSchema, AssistantRuntimeSubAgentParentSnapshotReferenceSchema, AssistantRuntimeSubAgentPermissionSnapshotSchema, AssistantRuntimeSubAgentRunRequestSchema, AssistantRuntimeSubAgentRunResultSchema, AssistantRuntimeToolExecutionIdentitySchema };
