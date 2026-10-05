# Generic receipt-chain example

This example demonstrates references and invalidation only. It is not evidence for a real change and contains no product-specific behavior.

## Planning chain

```text
baseline@b1
  -> research@r1
  -> proposal/specs/design/tasks@p1
  -> spec-audit receipt SA-002 (passed for p1)
  -> workflow state: spec-audited
```

`SA-002` is valid because its Spec Auditor did not author `p1`, it hashes every planning input, and it has no blocking findings. The coordinator—not the auditor—records the promotion.

## Apply chain

```text
start-contract S-01 (planning p1, tasks 1.1-1.3, allowed paths A/B)
  -> implementation writes A/B
  -> boundary event BC-01: design assumption contradicted
  -> stop affected work; end-audit E-01 records blocked handoff
  -> revise design/tasks to p2
  -> spec-audit SA-003 passes p2
  -> start-contract S-02 implements the revised slice
  -> end-audit E-02 reconciles all writes and checks
  -> freeze source/test manifests
  -> Implementation Reviewer IR-2 runs redacted secret scans and semantic review
```

`SA-002` cannot authorize `p2`. `S-01` cannot be silently widened to cover the revised task or new paths. The second session needs a new contract.

## Final chain

```text
source manifest -> src-7
test manifest   -> test-4
artifact join   -> art-3

Implementation Reviewer IR-2 passed on src-7/test-4 with SECRET-WORKTREE,
                             SECRET-GIT-RANGE, and SEMANTIC-SECRET-HANDLING
Capability Auditor CA-01     passed on src-7/test-4
Release Auditor RA-1         joined SA-003, E-01, E-02, CA-01, IR-2
```

If any file in `src-7` or `test-4` changes after `IR-2`, `IR-2` and all downstream Capability, Verification, and Release receipts are stale. Recompute the manifests, complete remediation through a new Apply contract, and rerun the invalidated gates. A task checkbox or an edited receipt revision field cannot repair freshness.

Release and archive outcomes remain separate:

- `releaseVerdict: ready` means repository release policy passed for the frozen candidate.
- `archiveVerdict: ready` means durable specs and audit history may be archived.
- `archiveVerdict: force-ready` preserves an authorized exception but does not imply release readiness.
