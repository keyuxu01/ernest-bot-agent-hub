# Architecture and Technology Decisions

本文档描述仓库当前架构事实。单项技术选择的背景、备选方案和后果记录在
[`decisions/`](./decisions/) 下的 Architecture Decision Records（ADR）中。

## System Context

```text
+-----------------------+       +-------------------------------+
| Next.js Web           |       | Agent / Chat Host             |
| agentic-rag-client    |       | AI SDK UI / ChatGPT / other   |
+-----------+-----------+       +---------------+---------------+
            |                                   |
            | HTTP or evaluated RPC             | MCP
            v                                   v
+---------------------------+       +---------------------------+
| NestJS Business Service   |       | MCP App Collections       |
| domain and use cases      |<------| protocol adapter + widget |
+-------------+-------------+       +---------------------------+
              |
              v
      +------------------+
      | Knowledge Stores |
      | DB / Vector DB   |
      +------------------+

Shared foundations:
  @repo/contracts  Zod runtime schemas and inferred types
  @repo/ui         reusable React presentation components
```

The database and vector-store technologies are intentionally undecided in the first phase.

## Application Responsibilities

| Application                    | Responsibility                           | Default port |
| ------------------------------ | ---------------------------------------- | -----------: |
| `agentic-rag-client`           | End-user Next.js interface               |       `3000` |
| `docs`                         | Project documentation application        |       `3001` |
| `agentic-rag-business-service` | Knowledge-base domain and business APIs  |       `8080` |
| `mcp-app-collections`          | MCP Tools, Resources and MCP App widgets |       `8081` |

## Protocol Boundaries

| Boundary                           | Protocol                                             | Status        |
| ---------------------------------- | ---------------------------------------------------- | ------------- |
| Interactive agent output to Web UI | Vercel AI SDK UI stream / compatible AG-UI transport | Accepted      |
| Agent to tools and resources       | MCP                                                  | Accepted      |
| Web to business service            | HTTP with Zod contracts; stable oRPC v1 PoC          | Current / PoC |
| Third-party HTTP documentation     | Generated OpenAPI at `/openapi.json` for the PoC     | PoC           |

AI streaming endpoints keep their native stream framing and are not wrapped in ordinary RPC responses.
MCP remains an Agent-facing protocol and does not replace standard business APIs.

## Dependency Direction

```text
apps/* ------------------> packages/contracts
frontend surfaces -------> packages/ui
packages/ui -------------> React only; never apps/*
packages/contracts ------> Zod only; never apps/* or packages/ui
protocol adapters -------> business services / use cases
business services -------> data-access abstractions
```

Runtime data is validated once when it crosses an external trust boundary. Validated values may flow
through internal layers without redundant parsing until they cross another boundary.

## Current Decisions

| ADR                                                            | Decision                                            | Status   |
| -------------------------------------------------------------- | --------------------------------------------------- | -------- |
| [ADR-0001](./decisions/0001-use-zod-contracts.md)              | Zod-based shared runtime contracts                  | Accepted |
| [ADR-0002](./decisions/0002-use-shadcn-tailwind.md)            | shadcn/ui and Tailwind CSS for frontend UI          | Accepted |
| [ADR-0003](./decisions/0003-separate-ai-stream-rpc-and-mcp.md) | Separate AI stream, business API and MCP boundaries | Accepted |
| [ADR-0004](./decisions/0004-evaluate-orpc.md)                  | Evaluate oRPC for Web-to-service APIs               | Proposed |
| [ADR-0005](./decisions/0005-evaluate-mcp-nest.md)              | Evaluate `@rekog/mcp-nest` v2 for the MCP service   | Proposed |

ADR status values are `Proposed`, `Accepted`, `Rejected`, `Superseded` and `Deprecated`. Accepted ADRs
are not edited to reverse a decision; a new ADR supersedes the old one.

## Maintenance

Update this overview and add or supersede an ADR whenever a change introduces or replaces a framework,
protocol, database, deployment model, cross-application dependency or trust boundary. Use OpenSpec for
the concrete proposal and implementation plan, and link the relevant ADR from that change when applicable.
