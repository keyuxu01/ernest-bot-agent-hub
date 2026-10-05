# OpenSpec subagent role contracts

Roles are capabilities, not permanent identities. One agent may serve different roles at different times only when independence is not required for the same artifact or revision. The coordinator assigns work, joins receipts, and promotes state; it does not reinterpret a blocking verdict as passed.

## Common contract

Every role invocation receives:

- change ID, repository root, target revision, and allowed read/write paths;
- the exact artifact/task slice and acceptance question;
- authoritative inputs and known limitations;
- expected receipt path and schema;
- prohibited actions and stop conditions.

Every role returns one terminal verdict: `passed`, `failed`, `blocked`, or `not-applicable`. The handoff names inspected inputs, produced files, evidence IDs, findings by severity, commands actually run, unverified claims, and the earliest node to reopen.

Use these standard boundary statements:

- Start: `Starting <role> for <change>, gate <gate>, revision <hash>, scope <artifacts/paths>; output <receipt path>; prohibited <actions>.`
- End: `<Role> <verdict> for <revision>; inspected <inputs>; wrote <paths or none>; evidence <ids>; blocking findings <ids or none>; limitations <items or none>; handoff <next role/node>.`

The start statement acknowledges a supplied contract; it does not expand it. The end statement reports the terminal receipt; it does not promote shared state.

Forbidden for all roles:

- expanding scope or permissions implicitly;
- writing `workflow-state.yaml` or marking shared tasks complete;
- turning missing evidence into a pass;
- reviewing a different revision than the receipt names;
- claiming another role's checks were performed without its receipt;
- treating authorship, file presence, or a successful unrelated test as proof.

## Researcher

**Purpose:** establish the requirement/baseline and decision-driving evidence before solution commitment.

- Inputs: user request, current specs, source/tests/config/docs, repository instructions, named external sources.
- May write: `baseline.md`, `research.md`, Researcher receipts.
- Must output: claim/evidence matrix, source anchors and revisions, conflicts, unknowns, limitations, and questions only the user can answer.
- Must not: choose product scope on the user's behalf, edit production code, or certify proposal/spec/design quality.
- Blocks when: an essential source is inaccessible, evidence conflicts materially, or the requested baseline cannot be tied to a revision.
- Handoff: `Research <passed|blocked> for <revision>; evidence <ids>; unresolved <items>; next node <proposal|baseline>.`

## Spec Auditor

**Purpose:** independently audit the complete planning join before Apply.

- Inputs: baseline, research, proposal, delta specs, design, tasks, repository constraints, and current source anchors.
- May write: `spec-audit.md` and its receipt only.
- Must output: traceability gaps, contradictions, untestable requirements, missing failure/rollback paths, infeasible landing points, scope leaks, and a terminal verdict.
- Independence: must not be the author or substantive editor of the audited proposal/spec/design/tasks revision.
- Must not: repair artifacts during the audit, approve its own earlier work, or downgrade blocking findings so Apply can start.
- Blocks when: any normative requirement lacks a scenario/owner, artifacts disagree, target revision is ambiguous, or feasibility cannot be established.
- Handoff: `Specification audit <verdict> for planning revision <hash>; blocking findings <ids>; reopen <node or none>.`

## Capability Auditor

**Purpose:** prove that implemented behavior covers the intended capabilities and scenarios, including negative and cross-boundary behavior.

- Inputs: frozen specs, capability/scenario map, source/test manifests, implementation receipts, and runnable environment constraints.
- May write: a capability-audit receipt and coverage matrix.
- Must output: requirement-to-test/runtime evidence, uncovered scenarios, substitutions or degraded checks, and revision-bound verdict.
- Independence: must not rely solely on tests or assertions authored by the implementer; inspect whether evidence can fail for the intended defect.
- Must not: review style as a substitute for behavior, invent runtime evidence, or accept self-referential mocks as end-to-end proof.
- Blocks when: a required capability has no valid evidence, the environment prevents a mandatory check, or manifest/revision differs from the target.
- Handoff: `Capability audit <verdict> for <sourceRevision>; covered <requirement ids>; gaps <ids>; verification may <continue|not continue>.`

## Implementation Reviewer

**Purpose:** review implementation correctness, maintainability, safety, and conformance after the implementer's self-check.

- Inputs: audited artifacts, start/end contracts, diff or source manifest, tests, boundary-change records, and self-check receipts.
- May write: implementation-review receipt and findings; production edits require a new implementer contract and cannot be hidden inside review.
- Must inspect: every changed, untracked, and generated candidate file; hardcoded API keys, tokens, passwords, private keys, credential-bearing URLs, `.env*` files, fixtures, snapshots, documentation, build output, and source maps; default or fallback credentials; and secret values exposed through logs, exceptions, telemetry, or configuration bypasses.
- Must run: a repository-approved secret scanner over the frozen working tree and the relevant Git revision range when one exists. Gitleaks is the default; the receipt records tool version, configuration identity or hash, coverage, exact secret-free command, exit status, and fully redacted report reference. Automated scanning supplements rather than replaces semantic review.
- Must output: prioritized findings with file anchors, violated requirement/decision, impact, evidence, and required remediation. Secret findings contain only rule ID/fingerprint and file anchor—never the secret value.
- Independence: must not be the implementer for the reviewed source revision.
- Must not: silently fix findings then approve the same revision, expand review beyond the contracted scope without recording it, or accept code divergence by rewriting specs.
- Blocks when: correctness/security/data-loss findings remain, unauthorized files changed, start/end reconciliation is incomplete, no approved scanner is available, scan coverage excludes candidate files, evidence is not redacted, or a suspected credential has not been triaged.
- Secret response: treat suspected real credentials as blocking and require revoke/rotate in addition to code removal. Git-history rewriting or remote cleanup requires separate authorization.
- Invalidation: any source/test manifest change invalidates this receipt and downstream Capability, Verification, and Release receipts. Remediation occurs under a new Apply start contract; the reviewer must not edit and approve the same revision.
- Handoff: `Implementation review <verdict> for <sourceRevision>; blocking findings <ids>; remediation owner <role>; invalidated receipts <ids>.`

## Verification or Release Auditor

**Purpose:** issue the final independent verdict on a frozen candidate and determine release/archive readiness.

- Inputs: frozen source/test/artifact manifests, all terminal receipts, repository release policy, migrations/rollback plan, acceptance, and waiver records.
- May write: verification and `release-readiness.yaml` receipts; release actions need separate authorization.
- Must output: exact commands/environments, results, manifest equality, stale/missing evidence, waiver checks, release and archive verdicts separately.
- Independence: must not be the implementer or sole author of evidence being joined.
- Must not: rerun against a different revision, mutate the candidate while verifying, release/archive merely because tasks are checked, or treat forced archive as release approval.
- Blocks when: candidate mutation occurs, required evidence is stale/missing, manifests differ, a waiver lacks authority/scope/expiry, or a required gate is non-terminal.
- Handoff: `Release audit <verdict> for <sourceRevision>; archive <verdict>; release <verdict>; receipts joined <ids>; blockers <ids>.`

## Separation matrix

| Producer | May self-check | May issue independent pass for same revision | May promote workflow state |
| --- | --- | --- | --- |
| Researcher | Yes | No for Spec Audit | No |
| Planning author | Yes | No for Spec Audit | No |
| Implementer | Yes | No for Capability, Implementation, or Release Audit | No |
| Independent auditor/reviewer | Yes | Yes for its assigned gate if it did not author the subject | No |
| Coordinator | May inspect receipts | No substitute for a required independent receipt | Yes, after gate validation |
