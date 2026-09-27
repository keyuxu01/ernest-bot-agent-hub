# ADR-0002: Use shadcn/ui and Tailwind CSS

- Status: Accepted
- Date: 2026-09-27

## Context

The Web application and MCP widgets need reusable, accessible UI that remains owned by the repository.
MCP widgets have independent build entries but should share presentation primitives with the main Web app.

## Decision

Use shadcn/ui components with Tailwind CSS as the frontend UI foundation. Store reusable presentation
components in `packages/ui`; application-specific pages, data access and host integrations remain in their
own applications.

Adopt components incrementally. Generated shadcn code is repository-owned code and must follow the local
frontend rules after generation.

## Consequences

- The project can customize component source rather than depending on an opaque runtime component library.
- Web and MCP widget surfaces can share visual primitives while retaining separate application boundaries.
- The repository must maintain its own design tokens, accessibility and component consistency.
- Shared UI components must not depend on application-specific services or routing.

## Alternatives

- Shopify Polaris: not selected because its product and visual assumptions are more specialized.
- A custom component system from scratch: rejected for the first phase because it adds avoidable cost.
