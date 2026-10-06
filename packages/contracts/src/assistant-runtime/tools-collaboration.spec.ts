import { describe, expect, it } from 'vitest';
import * as contracts from './tools-collaboration';

const hash = 'a'.repeat(64);
const timestamp = '2026-10-05T18:00:00+08:00';
const identity = { executionId: 'execution-1', attempt: 1, bindingId: 'binding-1', requestHash: hash, fencingToken: 7 };
const submission = { schemaVersion: 1, ...identity, commandId: 'command-1', idempotencyKey: 'idempotency-1', expectedExecutionVersion: 2 };
const path = { workspaceId: 'workspace-1', workspaceFingerprint: hash, requestedRelativePath: 'src/index.ts', canonicalRelativePath: 'src/index.ts', containment: 'inside_workspace', symbolicLinkEscape: false };
const defaultPolicy = { version: 1, readAndSearch: 'automatic_inside_workspace', patch: 'render_diff_then_apply_inside_workspace', shell: 'confirm_each', outsideWorkspace: 'deny' };
const artifactReference = { schemaVersion: 1, artifactId: 'artifact-1', referenceId: 'reference-1', resourceVersion: 1, contentSha256: hash, mimeType: 'text/plain', byteSize: 10 };
const permission = { ownerId: 'owner-1', workspaceId: 'workspace-1', toolNames: ['read_file', 'search_files'], memoryScopes: ['owner', 'session-1'] };
const budget = { maxTokens: 10000, maxToolExecutions: 20, deadlineAt: timestamp };

describe('assistant tool and collaboration contracts', () => {
  it('allows only public HTTPS MCP endpoints and opaque secret references', () => {
    const valid = { schemaVersion: 1, connectionId: 'mcp-1', resourceVersion: 1, ownerId: 'owner-1', displayName: 'Collections', transport: 'https', endpoint: 'https://mcp.example.test/api', enabled: true, authReference: 'secret://mcp/mcp-1' };
    expect(contracts.AssistantRuntimeRemoteMcpConfigurationSchema.parse(valid)).toEqual(valid);
    for (const endpoint of ['http://mcp.example.test', 'https://localhost/mcp', 'https://127.0.0.1/mcp', 'https://10.0.0.1/mcp', 'https://100.64.0.1/mcp', 'https://172.16.0.1/mcp', 'https://192.168.1.1/mcp', 'https://169.254.169.254/latest', 'https://[::1]/mcp']) expect(() => contracts.AssistantRuntimeRemoteMcpConfigurationSchema.parse({ ...valid, endpoint })).toThrow();
    expect(() => contracts.AssistantRuntimeRemoteMcpConfigurationSchema.parse({ ...valid, authReference: 'plain-token-value' })).toThrow();
    expect(() => contracts.AssistantRuntimeRemoteMcpConfigurationSchema.parse({ ...valid, transport: 'local_process' })).toThrow();
  });

  it('covers MCP OAuth lifecycle, health, catalog discovery and generation-pinned calls', () => {
    const command = { schemaVersion: 1, commandId: 'command-1', idempotencyKey: 'idem-1', connectionId: 'mcp-1', ownerId: 'owner-1' };
    expect(contracts.AssistantRuntimeRemoteMcpOAuthCommandSchema.parse({ ...command, action: 'begin_login', redirectUri: 'https://runtime.example.test/callback', stateReference: 'secret://oauth/state-1' })).toMatchObject({ action: 'begin_login' });
    expect(contracts.AssistantRuntimeRemoteMcpOAuthCommandSchema.parse({ ...command, action: 'complete_callback', stateReference: 'secret://oauth/state-1', authorizationCodeReference: 'secret://oauth/code-1' })).toMatchObject({ action: 'complete_callback' });
    expect(contracts.AssistantRuntimeRemoteMcpOAuthCommandSchema.parse({ ...command, action: 'refresh', credentialReference: 'secret://oauth/credential-1' })).toMatchObject({ action: 'refresh' });
    expect(contracts.AssistantRuntimeRemoteMcpOAuthCommandSchema.parse({ ...command, action: 'logout', credentialReference: 'secret://oauth/credential-1' })).toMatchObject({ action: 'logout' });
    expect(contracts.AssistantRuntimeRemoteMcpConnectionStateSchema.parse({ schemaVersion: 1, connectionId: 'mcp-1', resourceVersion: 2, status: 'ready', catalogGeneration: 3, checkedAt: timestamp, retryAt: null })).toMatchObject({ status: 'ready' });
    const catalog = { schemaVersion: 1, connectionId: 'mcp-1', generation: 3, capturedAt: timestamp, tools: [{ name: 'search', description: 'Search', schemaHash: hash, inputSchema: { type: 'object' }, outputSchema: null }] };
    expect(contracts.AssistantRuntimeRemoteMcpCatalogSchema.parse(catalog)).toMatchObject({ generation: 3 });
    const request = { schemaVersion: 1, executionId: 'remote-1', attempt: 1, requestHash: hash, ownerId: 'owner-1', runId: 'run-1', connectionId: 'mcp-1', catalogGeneration: 3, toolName: 'search', inputSchemaHash: hash, input: { query: 'x' }, idempotency: 'safe_retry' };
    expect(contracts.AssistantRuntimeRemoteMcpToolRequestSchema.parse(request)).toMatchObject({ catalogGeneration: 3 });
    expect(contracts.AssistantRuntimeRemoteMcpToolResultSchema.parse({ schemaVersion: 1, executionId: 'remote-1', attempt: 1, requestHash: hash, connectionId: 'mcp-1', catalogGeneration: 3, completedAt: timestamp, status: 'completed', output: { ok: true } })).toMatchObject({ status: 'completed' });
    expect(() => contracts.AssistantRuntimeRemoteMcpToolRequestSchema.parse({ ...request, catalogGeneration: 0 })).toThrow();
  });

  it('binds one authenticated CLI lease and scopes automatic shell policy to a Session', () => {
    const binding = { schemaVersion: 1, bindingId: 'binding-1', ownerId: 'owner-1', cliInstanceId: 'cli-1', workspaceId: 'workspace-1', workspaceFingerprint: hash, streamCredentialReference: 'secret://binding/stream-1', capabilities: ['file_read', 'shell'], approvalPolicy: defaultPolicy, leaseVersion: 2, fencingToken: 7, leaseExpiresAt: timestamp };
    expect(contracts.AssistantRuntimeClientBindingSchema.parse(binding)).toMatchObject({ bindingId: 'binding-1' });
    const automatic = { ...defaultPolicy, shell: 'automatic_inside_workspace_for_session', sessionId: 'session-1', expiresAt: timestamp };
    expect(contracts.AssistantRuntimeLocalApprovalPolicySchema.parse(automatic)).toMatchObject({ sessionId: 'session-1' });
    expect(() => contracts.AssistantRuntimeLocalApprovalPolicySchema.parse({ ...automatic, sessionId: undefined })).toThrow();
    expect(() => contracts.AssistantRuntimeClientBindingSchema.parse({ ...binding, streamCredentialReference: 'token' })).toThrow();
  });

  it('validates both requested and canonical local paths', () => {
    expect(contracts.AssistantRuntimeLocalPathResolutionSchema.parse(path)).toEqual(path);
    for (const field of ['requestedRelativePath', 'canonicalRelativePath'] as const) for (const escaped of ['../secret', '..\\secret', '/etc/passwd', 'C:\\secret']) expect(() => contracts.AssistantRuntimeLocalPathResolutionSchema.parse({ ...path, [field]: escaped })).toThrow();
    expect(() => contracts.AssistantRuntimeLocalPathResolutionSchema.parse({ ...path, symbolicLinkEscape: true })).toThrow();
  });

  it('provides actual versioned schemas for every baseline coding tool', () => {
    const inputs = [
      { toolName: 'apply_patch', patch: '*** patch', expectedFiles: [{ relativePath: 'a.ts', sha256: hash }] },
      { toolName: 'exec_command', executable: 'pnpm', arguments: ['test'], workingDirectory: path, terminal: true },
      { toolName: 'write_stdin', processHandle: 'p'.repeat(32), operationId: 'write-1', data: 'y\n' },
      { toolName: 'read_file', relativePath: 'a.ts', offset: 0, limit: 100 },
      { toolName: 'search_files', query: 'needle', roots: ['src'], maxResults: 20 },
      { toolName: 'view_image', relativePath: 'image.png', detail: 'high' },
      { toolName: 'web', operation: 'search', request: 'official docs' },
      { toolName: 'image_generation', prompt: 'diagram', referencedArtifacts: [] },
      { toolName: 'update_plan', planVersion: 1, steps: [] },
      { toolName: 'context_budget', operation: 'inspect' },
    ];
    for (const input of inputs) expect(() => contracts.AssistantRuntimeCodingToolInputSchema.parse({ schemaVersion: 1, toolVersion: 1, ...input })).not.toThrow();
    expect(() => contracts.AssistantRuntimeCodingToolInputSchema.parse({ schemaVersion: 1, toolVersion: 1, toolName: 'read_file', query: 'wrong-shape' })).toThrow();
    expect(contracts.AssistantRuntimeCodingToolResultSchema.parse({ schemaVersion: 1, toolVersion: 1, toolName: 'apply_patch', status: 'completed', changedPaths: [path], conflictPaths: [] })).toMatchObject({ toolName: 'apply_patch' });
    expect(contracts.AssistantRuntimeCodingToolResultSchema.parse({ schemaVersion: 1, toolVersion: 1, toolName: 'image_generation', status: 'failed', errorCode: 'provider_error', message: 'failed', retryable: true })).toMatchObject({ status: 'failed' });
    expect(() => contracts.AssistantRuntimeCodingToolResultSchema.parse({ schemaVersion: 1, toolVersion: 1, toolName: 'read_file', status: 'failed', sha256: hash })).toThrow();
  });

  it('requires execution identity, policy version and CAS fields on local submissions', () => {
    const request = { schemaVersion: 1, ...identity, runId: 'run-1', sessionId: 'session-1', workspaceId: 'workspace-1', approvalPolicyVersion: 1, idempotency: 'safe_retry', tool: { schemaVersion: 1, toolVersion: 1, toolName: 'read_file', relativePath: 'README.md', offset: 0, limit: 100 }, createdAt: timestamp };
    expect(contracts.AssistantRuntimeLocalToolRequestSchema.parse(request)).toMatchObject(identity);
    const ack = { ...submission, acknowledgedAt: timestamp, disposition: 'accepted' };
    expect(contracts.AssistantRuntimeLocalToolAcknowledgementSchema.parse(ack)).toMatchObject({ expectedExecutionVersion: 2 });
    const result = { ...submission, completedAt: timestamp, status: 'completed', result: { schemaVersion: 1, toolVersion: 1, toolName: 'read_file', status: 'completed', content: 'ok', sha256: hash } };
    expect(contracts.AssistantRuntimeLocalToolResultSchema.parse(result)).toMatchObject({ status: 'completed' });
    expect(() => contracts.AssistantRuntimeLocalToolResultSchema.parse({ ...result, result: { ...result.result, status: 'failed' } })).toThrow();
    for (const [schema, fixture] of [[contracts.AssistantRuntimeLocalToolAcknowledgementSchema, ack], [contracts.AssistantRuntimeLocalToolResultSchema, result]] as const) {
      expect(() => schema.parse(Object.fromEntries(Object.entries(fixture).filter(([key]) => key !== 'idempotencyKey')))).toThrow();
      expect(() => schema.parse({ ...fixture, expectedExecutionVersion: -1 })).toThrow();
    }
    expect(() => contracts.AssistantRuntimeLocalToolRequestSchema.parse({ ...request, tool: { schemaVersion: 1, toolVersion: 1, toolName: 'web', operation: 'search', request: 'x' } })).toThrow('Local gateway');
  });

  it('distinguishes accepted, replayed and conflicting terminal submissions', () => {
    const base = { schemaVersion: 1, commandId: 'command-1', executionId: 'execution-1', attempt: 1 };
    expect(contracts.AssistantRuntimeLocalToolResultReceiptSchema.parse({ ...base, disposition: 'accepted', terminalExecutionVersion: 3 })).toMatchObject({ disposition: 'accepted' });
    expect(contracts.AssistantRuntimeLocalToolResultReceiptSchema.parse({ ...base, disposition: 'replayed', terminalExecutionVersion: 3 })).toMatchObject({ disposition: 'replayed' });
    expect(contracts.AssistantRuntimeLocalToolResultReceiptSchema.parse({ ...base, disposition: 'conflict', currentExecutionVersion: 3, terminalStatus: 'completed' })).toMatchObject({ disposition: 'conflict' });
    expect(contracts.AssistantRuntimeLocalToolResultSchema.parse({ ...submission, completedAt: timestamp, status: 'result_unknown', reason: 'lost after side effect', mayHaveSideEffects: true })).toMatchObject({ status: 'result_unknown' });
  });

  it('makes process operations idempotent, CLI-owned and artifact-backed on truncation', () => {
    const start = { schemaVersion: 1, ...identity, operationId: 'start-1', idempotencyKey: 'start-idem', command: 'start', executable: 'pnpm', arguments: ['test'], workingDirectory: path, terminal: true };
    expect(contracts.AssistantRuntimeProcessCommandSchema.parse(start)).not.toHaveProperty('processHandle');
    expect(contracts.AssistantRuntimeProcessCommandSchema.parse({ schemaVersion: 1, ...identity, operationId: 'write-1', idempotencyKey: 'write-idem', command: 'write_input', processHandle: 'p'.repeat(32), data: 'y\n' })).toMatchObject({ operationId: 'write-1' });
    const observation = { schemaVersion: 1, ...identity, processHandle: 'p'.repeat(32), chunks: [], truncated: true, overflowArtifactReference: artifactReference, state: 'running', exitCode: null, exitSignal: null, nextSequence: 0 };
    expect(contracts.AssistantRuntimeProcessObservationSchema.parse(observation)).toMatchObject({ truncated: true });
    expect(() => contracts.AssistantRuntimeProcessObservationSchema.parse({ ...observation, overflowArtifactReference: null })).toThrow('requires an artifact');
    expect(() => contracts.AssistantRuntimeProcessObservationSchema.parse({ ...observation, exitCode: 0 })).toThrow('Only exited');
  });

  it('binds HITL kinds, responders, secret display and idempotent receipts', () => {
    const common = { schemaVersion: 1, interruptId: 'interrupt-1', runId: 'run-1', checkpointId: 'checkpoint-1', resourceVersion: 1, allowedResponders: { ownerId: 'owner-1', bindingIds: ['binding-1'] } };
    expect(contracts.AssistantRuntimeInterruptSchema.parse({ ...common, kind: 'question', prompt: 'Secret?', answerFormat: 'secret', displayPolicy: 'masked' })).toMatchObject({ kind: 'question' });
    expect(() => contracts.AssistantRuntimeInterruptSchema.parse({ ...common, kind: 'question', prompt: 'Secret?', answerFormat: 'secret', displayPolicy: 'plain' })).toThrow();
    const resolution = { schemaVersion: 1, interruptId: 'interrupt-1', runId: 'run-1', checkpointId: 'checkpoint-1', resourceVersion: 1, responderOwnerId: 'owner-1', responderBindingId: 'binding-1', commandId: 'command-1', idempotencyKey: 'answer-1' };
    expect(contracts.AssistantRuntimeInterruptResolutionSchema.parse({ ...resolution, interruptKind: 'approval', resolution: 'rejected', reason: 'no' })).toMatchObject({ resolution: 'rejected' });
    expect(() => contracts.AssistantRuntimeInterruptResolutionSchema.parse({ ...resolution, interruptKind: 'question', resolution: 'approved' })).toThrow();
    expect(() => contracts.AssistantRuntimeInterruptResolutionSchema.parse({ ...resolution, interruptKind: 'question', answerFormat: 'text', resolution: 'answered', answer: ['wrong'] })).toThrow();
    expect(contracts.AssistantRuntimeInterruptResolutionReceiptSchema.parse({ schemaVersion: 1, interruptId: 'interrupt-1', commandId: 'command-1', disposition: 'replayed', terminalResourceVersion: 2 })).toMatchObject({ disposition: 'replayed' });
  });

  it('enforces true child Run lineage, authority narrowing, budget and parent cancellation', () => {
    const parentSnapshotReference = { parentRunId: 'run-parent', snapshotId: 'parent-capabilities-1', resourceVersion: 4, snapshotHash: hash, budgetLedgerVersion: 7 };
    const request = { schemaVersion: 1, parentRunId: 'run-parent', childRunId: 'run-child', lineage: ['run-root', 'run-parent'], objective: 'Review contracts', isolatedContextSnapshotId: 'snapshot-child', parentSnapshotReference, childPermissions: { ...permission, toolNames: ['read_file'], memoryScopes: ['owner'] }, childBudget: { ...budget, maxTokens: 5000, maxToolExecutions: 10 }, budgetReservationId: 'reservation-1', returnMode: 'automatic_to_parent' };
    expect(contracts.AssistantRuntimeSubAgentRunRequestSchema.parse(request)).not.toHaveProperty('sessionId');
    expect(() => contracts.AssistantRuntimeSubAgentRunRequestSchema.parse({ ...request, parentSnapshotReference: { ...parentSnapshotReference, parentRunId: 'other-parent' } })).toThrow('must belong');
    const admission = { schemaVersion: 1, request, resolvedParentPermissions: permission, resolvedParentBudget: budget, committedBudgetLedgerVersion: 8, disposition: 'accepted' };
    expect(contracts.AssistantRuntimeSubAgentAdmissionSchema.parse(admission)).toMatchObject({ disposition: 'accepted' });
    expect(() => contracts.AssistantRuntimeSubAgentAdmissionSchema.parse({ ...admission, request: { ...request, childPermissions: { ...permission, toolNames: [...permission.toolNames, 'shell'] } } })).toThrow('subset');
    expect(() => contracts.AssistantRuntimeSubAgentAdmissionSchema.parse({ ...admission, request: { ...request, childBudget: { ...budget, maxTokens: 20000 } } })).toThrow('must not exceed');
    expect(() => contracts.AssistantRuntimeSubAgentAdmissionSchema.parse({ ...admission, committedBudgetLedgerVersion: 7 })).toThrow('next budget ledger');
    expect(contracts.AssistantRuntimeSubAgentCancellationSchema.parse({ schemaVersion: 1, commandId: 'command-1', idempotencyKey: 'cancel-1', parentRunId: 'run-parent', childRunId: 'run-child', source: 'parent', action: 'cancel_unfinished_child' })).toMatchObject({ source: 'parent' });
    expect(contracts.AssistantRuntimeSubAgentRunResultSchema.parse({ schemaVersion: 1, parentRunId: 'run-parent', childRunId: 'run-child', status: 'completed', returnedAt: timestamp, returnMode: 'automatic_to_parent', boundedResult: 'passed' })).toMatchObject({ status: 'completed' });
  });

  it('validates exported leaf and descriptor schemas with negative fixtures', () => {
    const descriptor = { schemaVersion: 1, toolName: 'apply_patch', toolVersion: 1, executionLocation: 'bound_cli', ownerScope: 'session_owner', workspacePolicy: 'required_and_confined', maxInlineResultBytes: 65536, overflow: 'artifact', cancellation: 'cooperative', failureSemantics: 'explicit_failure_or_result_unknown' };
    const cases: Array<[schema: { parse: (value: unknown) => unknown }, valid: unknown, invalid: unknown]> = [
      [contracts.AssistantRuntimePublicHttpsUrlSchema, 'https://mcp.example.test', 'https://localhost'],
      [contracts.AssistantRuntimeBindingCapabilitySchema, 'file_read', 'host_admin'],
      [contracts.AssistantRuntimeLocalApprovalPolicySchema, defaultPolicy, { ...defaultPolicy, outsideWorkspace: 'allow' }],
      [contracts.AssistantRuntimeToolExecutionIdentitySchema, identity, { ...identity, fencingToken: -1 }],
      [contracts.AssistantRuntimeCodingToolNameSchema, 'context_budget', 'unknown_tool'],
      [contracts.AssistantRuntimeCodingToolDescriptorSchema, descriptor, { ...descriptor, executionLocation: 'runtime' }],
      [contracts.AssistantRuntimeSubAgentBudgetSchema, budget, { ...budget, maxTokens: 0 }],
      [contracts.AssistantRuntimeSubAgentPermissionSnapshotSchema, permission, { ...permission, ownerId: '' }],
      [contracts.AssistantRuntimeSubAgentParentSnapshotReferenceSchema, { parentRunId: 'run-parent', snapshotId: 'snapshot-1', resourceVersion: 1, snapshotHash: hash, budgetLedgerVersion: 1 }, { parentRunId: 'run-parent', snapshotId: '', resourceVersion: 1, snapshotHash: hash, budgetLedgerVersion: 1 }],
    ];
    for (const [schema, valid, invalid] of cases) { expect(() => schema.parse(valid)).not.toThrow(); expect(() => schema.parse(invalid)).toThrow(); }
  });
});
