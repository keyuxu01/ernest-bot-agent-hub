# ADR-0003: Separate AI Stream, Business API and MCP Boundaries

- Status: Accepted
- Date: 2026-09-27

## Context

The product needs interactive agent output, ordinary knowledge-base operations and tools that external
Agents can discover. These interactions have different consumers and transport semantics.

## Decision

Keep three explicit protocol boundaries:

- Vercel AI SDK UI stream or a compatible AG-UI transport for incremental messages, tool-call state and UI data.
- HTTP or an evaluated typed RPC layer for ordinary Web-to-business-service operations.
- MCP for Agent-facing Tools, Resources and MCP App UI metadata.

All boundaries may reuse Zod schemas from `@repo/contracts`, but their transport envelopes remain separate.
Do not wrap AI UI streams in ordinary RPC responses, and do not use MCP as the Web application's general API.

## Consequences

- Each protocol remains compatible with its intended clients and streaming semantics.
- Shared business use cases can serve multiple adapters without containing protocol metadata.
- Authentication, errors and observability must be mapped deliberately at each boundary.
- Some adapter code is duplicated by design, while domain rules and data schemas remain shared.

## Alternatives

- Route every interaction through MCP: rejected because MCP is an Agent protocol, not the general Web API.
- Route AI UI streams through ordinary RPC: rejected because it complicates stream framing and cancellation.
- Expose protocol-specific objects directly from business services: rejected because it couples the domain layer.
