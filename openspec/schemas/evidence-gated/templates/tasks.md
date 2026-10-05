# Implementation tasks

## 1. <!-- bounded task slice -->

> Requirements: <!-- REQ/Scenario IDs -->
> Start-contract scope: <!-- allowed paths/surfaces -->

- [ ] 1.1 `path/to/artifact` — <!-- symbol/behavior; owner: Implementer; evidence: receipt/check -->
- [ ] 1.2 `path/to/test-or-check` — <!-- verification work; owner and pass condition -->
- [ ] 1.3 Session end audit — reconcile writes, commands, results, boundary events, and remaining work.

## 2. Independent implementation review

- [ ] 2.1 Freeze the source/test manifests after the end audit; Implementation Reviewer performs semantic review plus a fully redacted secret scan of the working tree and applicable Git range, then writes a terminal receipt.
- [ ] 2.2 Resolve blocking findings through a new implementation start contract, rotate/revoke suspected real credentials when required, freeze a new manifest, and review the new revision.

## 3. Capability and release verification

- [ ] 3.1 Capability Auditor maps every required scenario to independent evidence on the same frozen revision consumed by the current Implementation Review receipt.
- [ ] 3.2 Verification/Release Auditor joins the current Implementation Review and secret-scan claims with all other receipts, then writes separate release/archive verdicts.

<!-- A checkbox records work bookkeeping only. workflow-state promotion still requires valid receipts. -->
