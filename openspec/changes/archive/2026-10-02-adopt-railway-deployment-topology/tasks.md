## 1. Architecture Decision Records

- [x] 1.1 Add ADR-0011 selecting Vercel Web plus Railway API/Consumer/Cron, the product-scoped domains, managed state boundaries and Turborepo deployment model; verify the ADR names its superseded decisions and alternatives.
- [x] 1.2 Mark the replaced Cloudflare runtime decision and affected Kubernetes-deferral statements as superseded where appropriate, then verify active ADR text no longer leaves the Consumer provider unresolved or requires Cloudflare Containers/Cron.

## 2. Architecture and Deployment Documentation

- [x] 2.1 Update `docs/architecture/README.md` with the Know Research domains and Vercel/Railway topology, process/state ownership and ADR index; verify its diagram and prose contain no active `api.ernestbot.com` or Cloudflare Container path.
- [x] 2.2 Rewrite `docs/guides/deployment-and-infrastructure.md` for Railway API, always-on Consumer and one-shot Cron publisher services, managed state, DNS/CORS, health/recovery and rollout order; verify the guide distinguishes selected architecture from unprovisioned resources.
- [x] 2.3 Update `docs/guides/orpc.md` production origin and CORS examples to `know-research.ernestbot.com` and `know-research-api.ernestbot.com`; verify all production examples use the product-scoped origins.

## 3. Project Rules and Turborepo Guidance

- [x] 3.1 Update the RuleSync backend source so Railway Cron is the default production scheduler owner and regenerate derived agent rules with `pnpm agent:sync`; verify generated rules preserve the API/Consumer scheduling prohibition.
- [x] 3.2 Document repository-root Railway builds, filtered Turbo commands, dependency-aware Watch Paths, optional Vercel Remote Cache, future `turbo prune --docker`, and build-time environment hashing; verify examples cover both application and shared-package changes.

## 4. Verification

- [x] 4.1 Search maintained documentation and generated rules for stale active references to the generic production domains or selected Cloudflare runtime, retaining them only in explicitly superseded historical context.
- [x] 4.2 Run `openspec validate adopt-railway-deployment-topology --strict`, `pnpm agent:check`, and the repository Markdown formatting/check available for changed files; verify all commands pass or record any pre-existing tool limitation precisely.

## 5. Runtime Alignment

- [x] 5.1 Replace retired Cloudflare identity environment variables in `/health/whoami` with Railway replica, deployment and commit metadata; verify the behavior with focused unit tests plus backend lint, type-check and build.
