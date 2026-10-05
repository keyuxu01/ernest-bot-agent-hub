# Agent project OpenSpec workflow

The canonical lifecycle is [`OpenSpec evidence-gated workflow`](../openspec-workflow.md).
This directory contains the supporting evidence rules, role contracts, and a
domain-neutral receipt-chain example. The executable schema and templates live
under [`openspec/schemas/evidence-gated/`](../../../openspec/schemas/evidence-gated/).

## Repository adoption

- `openspec/config.yaml` selects `evidence-gated` for newly created changes.
- Existing changes remain pinned to the schema recorded in their own
  `.openspec.yaml`; adopting this workflow does not rewrite active history.
- Keep generated `.workflow/` records inside each change directory.
- Only the coordinator writes `workflow-state.yaml`; auditors write their own
  receipts and may not promote shared state.
- Before using the workflow after an OpenSpec CLI upgrade, run
  `openspec schema validate evidence-gated --json`.

The YAML templates contain placeholders. They define record shape and must not
be copied as fake `passed` evidence.

## References

- [`evidence-and-receipts.md`](evidence-and-receipts.md)
- [`code-and-secret-review.md`](code-and-secret-review.md)
- [`subagent-roles.md`](subagent-roles.md)
- [`examples/generic-change.md`](examples/generic-change.md)
