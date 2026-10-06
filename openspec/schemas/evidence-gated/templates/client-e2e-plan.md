# Real-client acceptance plan

## Frozen inputs

- Planning revision/manifest:
- Product baseline and classification source:
- Real client entrypoint:
- Supported environments:

## Test-type classification

| Type | Purpose | Can satisfy a real-client requirement? |
| --- | --- | --- |
| Product E2E | Exercise the shipped client through normal external boundaries | yes |
| Integration/contract | Verify internal or protocol boundaries | supplementary only |
| Live smoke | Verify compatibility with a real external provider | only for the named live boundary |
| Operational acceptance | Verify deployment, readiness, recovery, or observability | joins product evidence; not a fake client feature |
| Manual acceptance | Verify interaction that cannot yet be automated | only when explicitly required and receipted |
| Release gate | Verify provenance, review, migration, packaging, or promotion policy | no; governance evidence only |

## Driver and fixture contracts

- Product driver actions:
- Browser/native/terminal actions:
- Fault driver actions:
- Read-only evidence oracle:
- Fixture seed/version/health conditions:
- Reset and cleanup:
- External network policy:
- Secret and protected-data policy:

## Bidirectional trace manifest

| Requirement/scenario ID | Baseline classification | Case/subcase IDs | Fixture | Driver | Assertion/oracle | Evidence type | Receipt path |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Executable cases

| Case ID | Type | Preconditions | Deterministic actions | User-visible expected result | Durable/security oracle | Cleanup | Shared evidence owner |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Coverage checks

- Missing/unknown requirement IDs:
- Orphan cases:
- Intentional shared evidence and aliases:
- Not-applicable cases and reasons:
- Required live credentials and blocked/not-run policy:
