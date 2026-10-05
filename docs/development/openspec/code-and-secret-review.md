# Post-Apply code and secret review

Every completed Apply task slice is followed by an independent Implementation
Reviewer on frozen source/test manifests. The reviewer is a read-only subagent:
it may write only its receipt and redacted evidence, and it may not repair then
approve the same revision.

## Required review

1. Reconcile the end audit, changed paths, untracked/generated files, tests, and
   boundary records with the audited plan.
2. Review correctness, failure paths, authorization, validation, data loss,
   concurrency, observability, maintainability, and test quality.
3. Inspect secret handling semantically: hardcoded keys/tokens/passwords/private
   keys, credential-bearing URLs, default/fallback credentials, `.env*`, fixtures,
   snapshots, docs, build output/source maps, and values sent to logs, exceptions,
   telemetry, or client bundles.
4. Run Gitleaks against the frozen working tree and the relevant Git range when
   one exists. Scanning only `git diff` is insufficient because it can omit
   untracked and generated files.

Example commands, adjusted to the frozen candidate and a stable receipt path:

```bash
gitleaks dir . --redact=100 --report-format json --report-path <redacted-worktree-report>
gitleaks git . --redact=100 --log-opts="<base>..<candidate>" --report-format json --report-path <redacted-git-report>
```

Record the exact Gitleaks version and either the project configuration hash or
the embedded configuration identity supplied by that version. Never persist or
repeat a detected secret value. Findings contain only the rule ID/fingerprint,
file anchor, impact, and remediation state.

## Verdict and remediation

- A missing scanner, incomplete scope, non-redacted output, or untriaged finding
  blocks the Implementation Review gate.
- A suspected real credential requires immediate revoke/rotate plus removal from
  the candidate. Deleting the source text alone is not remediation.
- Repair uses a new Apply start contract and frozen manifest. It invalidates the
  prior Implementation Review and all downstream receipts.
- Rewriting Git history or cleaning a remote is destructive and requires separate
  authorization.

## Defense in depth

- [Gitleaks](https://github.com/gitleaks/gitleaks) is the default deterministic
  local/CI scanner and supports directory, Git-range, JSON/SARIF, baseline,
  pre-commit, and GitHub Action workflows.
- [TruffleHog](https://github.com/trufflesecurity/trufflehog) may be used for an
  authorized historical deep scan or credential verification. Provider-backed
  verification can make network calls and is not a default reviewer action.
- [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)
  should be enabled when repository policy and plan support it. It is a second
  boundary, not a replacement for revision-bound review, because availability
  and bypass behavior depend on repository settings.
- Codex Security may provide an additional scan or investigation receipt when
  connected, but the workflow must remain reproducible without that plugin.
