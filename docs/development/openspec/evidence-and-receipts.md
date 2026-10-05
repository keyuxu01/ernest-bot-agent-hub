# Evidence and receipt contract

Evidence supports one claim for one scope and revision. Receipts summarize checks; they do not replace the underlying command output, source anchor, approval, or artifact.

## Required fields

Use [`evidence-receipt.yaml`](../../../openspec/schemas/evidence-gated/templates/evidence-receipt.yaml) for every audit/check receipt. A receipt records:

- stable `receiptId`, check type, producer role/identity, creation time, and terminal verdict;
- change, node/gate, repository, branch/worktree when relevant, and inspected revision/manifests;
- input artifact paths and content hashes;
- claims checked and evidence references (command, file anchor, runtime observation, external primary source, or explicit human decision);
- findings with severity and reopening target;
- limitations, degraded substitutions, waivers, and superseded receipt IDs;
- explicit `writes` so a read-only auditor cannot conceal mutations.

Keep raw output in a stable path when it is material. Redact secrets; record that redaction occurred without copying the secret.

## Secret-scan evidence

An Implementation Review receipt must combine automated scanning with semantic inspection. Use Gitleaks as the default repository scanner unless policy names an equivalent. Scan the frozen working tree—including untracked and generated candidate files—and scan the relevant Git revision range when one exists. Record scanner version, configuration identity or hash, coverage, exact command with no credentials, exit status, and a stable fully redacted report reference.

The minimum claims are `SECRET-WORKTREE`, `SECRET-GIT-RANGE` when a commit range exists, and `SEMANTIC-SECRET-HANDLING`. A scanner that is missing, fails to run, omits candidate files, or produces unredacted evidence yields `blocked`, not `passed`. Never copy a detected value into a receipt, finding, chat message, task, or log; use only rule ID/fingerprint and file anchor. A suspected real credential requires revoke/rotate as well as source removal. Rewriting Git history or cleaning a remote is a separately authorized destructive action.

## Verdict semantics

- `passed`: all required checks for the named scope/revision succeeded and no blocking finding remains.
- `failed`: a required check ran and contradicted the acceptance condition.
- `blocked`: the check could not produce a valid answer because prerequisites, access, environment, or evidence were missing/ambiguous.
- `not-applicable`: the gate condition demonstrably does not apply; include the rule and evidence.

`degraded` is a limitation, not a verdict. A repository may allow a degraded check only when its policy names an acceptable substitute or an authorized waiver exists.

## Freshness and invalidation

A receipt is current only when all consumed artifact hashes and relevant source/test manifests match. Invalidate downstream receipts when:

- a normative artifact changes;
- a file in the frozen manifest changes, appears, disappears, or is reclassified;
- an Implementation Review source/test manifest changes, which also invalidates downstream Capability, Verification, and Release receipts;
- the validation environment or dependency state changes in a way relevant to the claim;
- a boundary-change record reopens an upstream node;
- an approval or waiver expires or is withdrawn;
- later evidence contradicts the receipt.

Do not “refresh” a receipt by editing its revision fields. Issue a new receipt and list the superseded ID.

## Promotion check

Before promotion, the coordinator verifies:

1. the receipt issuer was eligible and independent for that gate;
2. verdict is terminal and allowed by policy;
3. scope, artifacts, manifests, and revision exactly match the candidate;
4. required raw evidence is resolvable;
5. limitations and findings are classified correctly;
6. referenced waivers are authorized, bounded, and unexpired;
7. no newer boundary event or conflicting receipt exists.

If any check fails, keep the current state and write a blocking finding; never rewrite the producer's receipt to force promotion.
