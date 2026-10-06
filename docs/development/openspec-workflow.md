# OpenSpec evidence-gated workflow

Use this SOP when a change is planned and implemented through OpenSpec. It defines lifecycle gates; a product repository may add domain artifacts, but must not weaken these gates. Reusable schema and receipt templates live in [`openspec/`](openspec/README.md).

## Authority and invariants

- The user request defines authorization. An artifact, task, kanban item, or prior approval does not authorize a later phase by itself.
- `proposal.md`, delta specs, `design.md`, and `tasks.md` are planning truth. Source code is not allowed to silently redefine them.
- A gate is satisfied only by evidence that names its scope and revision. File existence, an unchecked/checked box, a successful command from an older revision, or an agent's own confidence is not evidence of the current gate.
- The implementer may self-check, but may not issue the independent audit receipt that promotes its own work.
- Missing, stale, conflicting, inaccessible, or self-certified evidence blocks only the gate that consumes it. Record the limitation; do not infer `passed`.
- A boundary change returns to the earliest invalidated node. It is never repaired by rewriting downstream artifacts to match unapproved code.

## Fixed lifecycle

| Node | Required output | Entry condition | Promotion gate |
| --- | --- | --- | --- |
| 1. Requirement and baseline | `baseline.md` | Change scope is known well enough to inspect | Goals, non-goals, current behavior, target surface, authorization, and unknowns are explicit; source anchors identify the inspected revision. |
| 2. Research and evidence | `research.md` plus receipts | Baseline questions exist | Claims are separated into observed facts, external facts, judgments, and unknowns; sources and limitations are traceable. |
| 3. Proposal | `proposal.md` | Baseline and decision-driving research are available | Why, scope, capabilities, compatibility, rollout impact, and exclusions are reviewable. |
| 4. Specifications | `specs/**/spec.md` | Proposal capabilities are named | Each normative requirement has testable scenarios; affected existing requirements are fully restated. |
| 5. Design | `design.md` | Specs define behavior | Decisions, boundaries, failure paths, migration/rollback, observability, security, and verification approach map back to requirements. |
| 6. Real-client acceptance design | `client-e2e-plan.md` | Specs and design identify observable behavior and product boundaries | Every normative scenario maps to stable executable cases, fixtures, drivers, assertions, evidence types, cleanup, and receipts; test types are not conflated. |
| 7. Tasks | `tasks.md` | Design and acceptance plan have concrete landing points | Every planned production/test/doc change and verification action is owned, ordered, and traceable; no vague “implement feature” tasks. |
| 8. Three parallel independent reviews | `requirements-e2e-review.md`, `solution-architecture-review.md`, `test-case-review.md` | All planning artifacts are frozen | Three different read-only subagents independently check trace completeness, solution/architecture quality, and test-case executability. All three must pass the same revision. |
| 9. Independent specification audit | `spec-audit.md` and a passed receipt | The three parallel reviews passed | A fourth independent Spec Auditor joins planning and review evidence, validates independence/hash freshness, and confirms no unresolved blocking findings. |
| 10. Apply session start | `.workflow/sessions/<id>/start-contract.yaml` | Apply is authorized and every pre-Apply receipt is current | Exact revision, allowed paths, prohibited actions, task slice, validation plan, roles, and stop conditions are acknowledged before the first production edit. |
| 11. Implementation and change control | Source changes plus `.workflow/boundary-changes/*.yaml` | Start contract is accepted | Work stays inside the contract. Any discovered scope/requirement/design change is recorded and routed upstream before continuing affected work. |
| 12. End audit | `.workflow/sessions/<id>/end-audit.yaml` | The session stops, hands off, or claims completion | Actual changes, untouched scope, commands, results, residual risks, boundary events, and working-tree state are reconciled against the start contract. |
| 13. Independent implementation review | Implementation Review receipt plus redacted secret-scan evidence | A completed end audit and frozen source/test manifests exist | A reviewer who did not implement the candidate checks correctness, maintainability, security, and spec conformance. Automated secret scanning covers the frozen working tree, including untracked/generated files, and the relevant Git range when available. |
| 14. Status promotion | `workflow-state.yaml` | Required receipts exist | The coordinator verifies issuer independence, scope/revision match, freshness, and verdict before changing state. Subagents do not promote shared state. |
| 15. Archive/release | `.workflow/final/release-readiness.yaml` | All implementation tasks and required acceptance are complete | Independent verification passes on the frozen manifest; spec sync, migration/rollback, security, docs, release approvals, and repository-specific checks are joined or explicitly waived by an authorized actor. |

### Parallel pre-Apply reviewer contracts

The three reviewers are general workflow roles, not product-specific agents. Give each the same frozen planning manifest and run them in parallel after tasks are complete:

- **Requirements-to-E2E Reviewer** checks every normative requirement/scenario against concrete cases and assertions, including baseline/enhancement classification and orphan detection.
- **Solution & Architecture Reviewer** checks functional preservation, boundaries, feasibility, distributed correctness, security/privacy, operability, migration/rollback, and unnecessary complexity.
- **Test Case Reviewer** checks atomic executable cases, deterministic fixtures/drivers/oracles, risk coverage, test-type classification, live/hermetic policy, cleanup, and canonical evidence reuse.

Each reviewer is read-only, emits its own revision-bound artifact/receipt, and may not fix what it reviews. One failure keeps Apply closed. Any material change to specs, design, tasks, acceptance plan, fixture/driver/oracle contract, or baseline classification invalidates the affected reviews and the downstream specification audit.

## Apply control loop

1. Freeze the planning revision, obtain three passed parallel review receipts and the downstream specification audit, then write the start contract.
2. Implement only the named task slice. Keep self-check evidence separate from independent review evidence.
3. When reality contradicts the baseline, spec, design, task scope, or allowed paths, stop the affected work and write a boundary-change record.
4. Classify the event:
   - clarification with no normative change: append evidence and resume after the coordinator acknowledges it;
   - requirement/spec change: revise proposal/specs and rerun the Spec Auditor;
   - design or landing change: revise design/tasks and rerun the affected audit checks;
   - authorization expansion: wait for explicit user authorization and create a new start contract;
   - implementation defect: keep artifacts unchanged, repair inside the existing contract, and rerun invalidated checks.
5. At every stop or handoff, write the end audit. A later session starts from a new contract; it does not inherit unstated authority.
6. After a completed end audit, freeze source/test manifests and assign an independent Implementation Reviewer. Follow the [code and secret review policy](openspec/code-and-secret-review.md). Any repair starts a new Apply contract; the reviewer does not patch and approve the same revision.

Use explicit boundary statements so the audit trail is readable without chat history:

- Start: `Apply session <id> started for planning revision <hash>, tasks <ids>, allowed paths <paths>; stop on <conditions>; expected evidence <ids/paths>.`
- End: `Apply session <id> ended <completed|blocked|interrupted|handoff> on source revision <hash or none>; changed <paths>; checks <receipt IDs/results>; boundary events <ids>; next <action>.`

Say the start statement only after the contract is acknowledged. Say the end statement only after the end audit is written; neither statement substitutes for its record.

## Promotion rules

The coordinator is the only writer of `workflow-state.yaml`. A promotion must reference terminal receipts and record:

- from/to state and promoted revision;
- receipt IDs and producing roles;
- independent reviewer identity where required;
- checked freshness and manifest match;
- explicit waivers, their authority, scope, and expiry;
- remaining non-blocking limitations.

Use these minimum transitions:

```text
draft -> researched -> proposed -> specified -> designed -> tasked
       -> spec-audited -> applying -> implemented -> implementation-reviewed
       -> verified
       -> release-ready -> archived
```

`blocked` and `reopened` are conditions, not proof of failure. A reopened change returns to the earliest invalidated state and invalidates downstream receipts.

## Archive and release gate

Normal archive/release requires all of the following on one frozen revision:

- the requirement/spec/design/task join is current;
- every start contract has a corresponding end audit;
- no unresolved blocking boundary-change record exists;
- Capability Auditor coverage and Implementation Reviewer findings are terminal for the same frozen revision;
- the Implementation Review receipt contains current, redacted working-tree secret-scan evidence and Git-range evidence when a revision range exists;
- Verification or Release Auditor checks the exact frozen source/test/artifact manifests;
- required tests, static checks, migrations, rollback checks, security checks, documentation, and human acceptance are passed, not-applicable with a reason, or explicitly waived by an authorized actor;
- durable specs are synchronized before archival;
- release and archive remain separate decisions when the repository ships independently of spec archival.

Force archive never means “passed.” Record it as `force-ready`, preserve unresolved findings and waivers, and do not reuse it as release evidence.

## Tailoring

A repository may add UI review, performance, data migration, deployment, compliance, or platform-specific nodes. Add them as stronger gates or conditional artifacts. Do not embed a particular runtime, database, vendor, application, or test command in this generic workflow.
