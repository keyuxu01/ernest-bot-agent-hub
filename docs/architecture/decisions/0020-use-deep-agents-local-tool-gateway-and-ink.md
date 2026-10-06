# ADR-0020: Use Deep Agents, a Local Tool Gateway, and Ink

- Status: Accepted
- Date: 2026-10-05
- Related: [ADR-0018](./0018-separate-user-platform-assistant-runtime-and-cli.md), [ADR-0019](./0019-use-postgresql-runtime-truth-redis-coordination-and-mem0-facts.md)

## Context

The Node rewrite must preserve agent-loop, coding-tool, interrupt, subagent, recovery, and terminal-product capabilities without copying Kodex's Kotlin harness, local JSON timelines, or Mosaic UI. Hosted Runtime replicas cannot safely execute against a user's workstation filesystem.

## Decision

- Deep Agents supplies the Agent harness and LangGraph.js supplies durable execution primitives behind a product-owned `AssistantHarness` adapter. Product services own authorization, Run state, events, commands, tool records, interrupts, compaction, and cancellation.
- Remote business tools use user-configured public HTTPS MCP connections only; server-side and workstation stdio MCP are unsupported. Runtime revalidates DNS and blocks loopback, private, link-local, and metadata destinations on the initial request, every redirect, and the actual connection.
- Local workspace tools use a durable product-owned Local Tool Gateway, not MCP, targeting an exact authenticated CLI instance and canonical workspace binding. A binding-specific authenticated SSE carries requests down; HTTPS carries acknowledgements and results up. Session SSE never broadcasts tool arguments or file contents.
- Local requests and results carry stable ToolExecution identity, attempt, request hash, client binding, and fencing token. The CLI rechecks path confinement, capability, and approval before execution. Read/search inside the workspace is automatic; patch shows a diff and then applies; shell requires confirmation by default; a Session may enable automatic in-workspace execution; access outside the workspace is always denied.
- Long-running processes are owned by the CLI through scoped unguessable handles and support later stdin, output retrieval, resize, and process-tree termination.
- Deep Agents child Runs are the only SubAgent mechanism. Kodex Suggested Sessions are an approved exclusion and are not implemented as a second collaboration model.
- Ink replaces the readline scaffold as the product console. A replayable event reducer/projection drives complete History and Terminal sidebars plus Session, tool, HITL, child Run, settings, artifact, patch, and terminal views. Layout and input-behavior preferences remain local-only.
- HTTP carries idempotent commands and versioned resource responses; replayable SSE carries committed server events. Provider events are normalized before crossing this boundary.
- The CLI captures user-owned model `apiKey`, public HTTPS `baseURL`, free-form `model`, and optional `reasoning effort`/`service tier`. Runtime applies the same initial/redirect/actual-connect public-network DNS and SSRF checks before sending the key, then encrypts it; these values configure the model client rather than `createDeepAgent` itself.

## Consequences

- Framework types do not leak into public contracts or core product state.
- A workstation needs no inbound endpoint, but the CLI must maintain an authenticated outbound binding stream.
- Tool execution remains possible only while an authorized binding is available; ambiguous non-idempotent results require explicit resolution.
- The Ink client requires reducer replay, TTY, Unicode, focus, resize, and real interactive acceptance tests.

## Alternatives

- A second handwritten agent loop or an AI SDK loop around Deep Agents: rejected because it would duplicate tool and interrupt ownership.
- Execute local tools in the hosted Runtime: rejected because the files are not there and the security boundary is unacceptable.
- Expose an inbound MCP server from each workstation: rejected because routing, NAT, identity, and revocation are unreliable.
- Integrate LangGraph Studio: rejected for this product scope because the CLI plus durable diagnostic surfaces already provide the required development and operational behavior.
- Extend the readline scaffold: rejected because it cannot host the required concurrent terminal interaction model.
