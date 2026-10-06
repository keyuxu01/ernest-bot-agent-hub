# Independent test-case review

## Identity, independence, and scope

- Reviewer role/identity: Test Case Reviewer `/root/test_case_review`
- Review date: `2026-10-05` (`Asia/Shanghai`)
- Independence statement: the reviewer did not author the frozen planning or test artifacts, did not inspect or modify production code, and did not modify any reviewed proposal, spec, design, task, acceptance, architecture, or capability-ledger input.
- Writes performed: this review receipt only, replacing the earlier receipt for the superseded test revision.
- Final countersign delta: after the prior PASS, only the capability ledger changed, correcting the CAP-016 trace label to the existing `Subagent isolation` requirement; all specs, E2E/trace inputs, and every other frozen input remained byte-identical. The correction does not change any test ID, case mapping, type, driver, fixture, oracle, cleanup, or receipt contract.
- Combined planning/test manifest SHA-256: `7bc1415f6595165ef3ff355f8efeca5a6788e01bd5c07542ba24b84a657d6d2a` (SHA-256 of the ordered 19-line `shasum -a 256` manifest below).

## Frozen input hash manifest

All supplied frozen hash prefixes matched before substantive review. The full manifest is:

| Input | SHA-256 | Check |
| --- | --- | --- |
| `proposal.md` | `fc70fb49c9cd001379263274bb8d93ba72fceb2afa4fc8067fad2b21b833d714` | matched `fc70fb49` |
| `design.md` | `4f19d4e2a6b7b6b7e91a39d308e103fd8c4d915c877b95e920a23420f455addf` | matched `4f19d4e2` |
| `tasks.md` | `0c5686e5ac2564656275fe4d4437c9695131105831b9d69a2193e23f403f14ee` | matched `0c5686e5` |
| `specs/assistant-access-control/spec.md` | `87adafcad0a4ec035290c46b78a8f430d0d3f47a4db1d23a11627e6ee340ef9f` | matched `87adafca` |
| `specs/assistant-cli/spec.md` | `3ca2dc19c114680c109a4689ce0624c42f743d955e9baf87eed7fe190c7a4ec5` | matched `3ca2dc19` |
| `specs/assistant-event-stream/spec.md` | `244c5b85e1dbecc1203af7c598ee1b3605acc5e62a6c23b6aa67bf375cfc4b2f` | matched `244c5b85` |
| `specs/assistant-model-context-memory/spec.md` | `dd50b55c24dd1275048619a7158733efbae2924e18816c86f99489b8a5190f6a` | matched `dd50b55c` |
| `specs/assistant-observability-delivery/spec.md` | `66030380b51e9da5d15e21d322fd688f2508f550c9eaaf501a81c8cc92534eef` | matched `66030380` |
| `specs/assistant-session-runtime/spec.md` | `d74978d9d0d5d62ee3d9e349d84c5da6033443423abbceb93e1e963a31dbc8c3` | matched `d74978d9` |
| `specs/assistant-tools-and-collaboration/spec.md` | `9899293854f4ae783d897353e150f6997127ff596bf62443c0f4e4e659aaf690` | matched `98992938` |
| `acceptance/real-client-e2e.md` | `28c50660017d87cb8d18db0e9245c1e39cabb64a066a09b0ddd5f9237be2381f` | matched `28c50660` |
| `acceptance/scenario-trace.yaml` | `31fd86c6a684a4373437bdcaab9fa5350698528dc2f8ec424ca42deb76a9c131` | matched `31fd86c6` |
| `docs/architecture/proposals/2026-10-05-node-agent-runtime-plan.md` | `dddb7876b408e2fea37c68f49ca8b22a2a4e84ca60c5a09d9ed7b29e6ca134c1` | matched `dddb7876` |
| `docs/architecture/proposals/2026-10-05-node-agent-runtime-capability-ledger.md` | `b00e0c0b6acae1f4735802f52033a862bab83175140e13e794a0237cb0bae5a8` | matched final countersign hash `b00e0c0b` |
| `docs/architecture/proposals/2026-10-05-node-agent-runtime-knowledge-sharing.md` | `31370bd9c409520922daa1a535e7251629b815dbf9e7abafd72c4c4cef7dc1a7` | matched `31370bd9` |
| `docs/architecture/decisions/0018-separate-user-platform-assistant-runtime-and-cli.md` | `563a2525929b4060425958a3ae5ee21495a60d172d261044751509b822297aaf` | matched `563a2525` |
| `docs/architecture/decisions/0019-use-postgresql-runtime-truth-redis-coordination-and-mem0-facts.md` | `6e62a37525ffa5bdc77d001bc54fb8f4156a63ad3b625a6d511f06d78c9a7d37` | matched `6e62a375` |
| `docs/architecture/decisions/0020-use-deep-agents-local-tool-gateway-and-ink.md` | `631ce1c74fc7916aa7c97d49f3831d7c02651492445466b66fd67e909d678aed` | matched `631ce1c7` |
| `docs/architecture/README.md` | `dc1e7b9c4fa571c1e1020873adc2ae11517eb93e73b1485f1adbb34c1fc760ff` | matched `dc1e7b9c` |

Any change to one of these inputs invalidates this receipt.

## Verdict

- Verdict: **PASS**
- Test-case gate: **open for this frozen planning/test revision**
- Blocking findings: **none**
- Non-blocking findings: **none requiring revision before the next gate**
- Scope boundary: this receipt approves test-case design executability and classification only. It does not authorize Apply, prove production implementation, or claim that any case has run.

## Mechanical review results

| Check | Result | Evidence/anchor |
| --- | --- | --- |
| Normative atomic bijection | **PASS — 92/92** | Seven specs contain 92 `#### Scenario` entries, each with exactly one `WHEN` and `THEN`. Trace contains 92 entries, 92 unique stable IDs, and 92 unique `(spec, CAP, requirement, scenario)` keys; set difference in both directions is empty. Trace entries are `scenario-trace.yaml:89-181`; the exact-WHEN/exact-THEN rule is `scenario-trace.yaml:12-20`. |
| Supplemental inventory | **PASS — 19** | 19 unique supplemental IDs at `scenario-trace.yaml:183-202`: 3 `live-smoke` plus 16 required product-risk/tool cases. Every item has suite, type, fixture, driver, action, assertion, oracle, cleanup, and canonical receipt fields. |
| Live smoke boundary | **PASS — 3** | Exactly `LIVE-GOOGLE-001`, `LIVE-MODEL-001`, and `LIVE-MEM0-001`; all use `F7`, `product-pty-live-v1`, live cleanup, distinct receipts, and `required_for_public_release: true`. Missing credentials are Blocked/Not-run and cannot be replaced by hermetic evidence (`real-client-e2e.md:25-41`; `tasks.md:168`). |
| Stable identity and canonical receipt | **PASS — 111/111 unique IDs** | 92 normative plus 19 supplemental IDs are globally unique. Normative receipt resolution is `receipts/{baseline}/{case_id}.json`; every supplemental receipt exactly follows the same pattern (`scenario-trace.yaml:13-20`, `183-202`). |
| Suite and fixture closure | **PASS** | All entries reference one of 32 declared suite contracts; every referenced fixture resolves to one of `F0`-`F8`. Fixture overlay order and conflict behavior are explicit (`scenario-trace.yaml:21-53`; `real-client-e2e.md:95-109`). |
| Driver, cleanup, and oracle closure | **PASS** | All four types resolve through closed driver and cleanup registries. All used oracle tokens resolve through the 24-member oracle registry; no unknown token, driver, cleanup, or suite remains (`scenario-trace.yaml:54-88`). Supplemental explicit driver/cleanup values exactly match their type registries. |
| Real packaged CLI/PTY product boundary | **PASS — 95/95 product cases** | 79 normative and 16 supplemental `product-e2e` cases all include `cli`; `product-e2e` resolves to `product-pty-v1` with `packaged-assistant-cli`. The plan explicitly rejects direct HTTP/SSE/controller/service/database operations as E2E substitutes (`real-client-e2e.md:7-23`; `scenario-trace.yaml:12`, `18`, `54-58`, `65`). |
| Type separation | **PASS** | Normative distribution is 79 product E2E, 7 operational acceptance, and 6 release governance. Supplemental distribution is 16 product E2E and 3 live smoke. Live IDs are only live-smoke; supplemental risk/tool IDs are only product-e2e; non-product types do not inflate product-E2E counts (`real-client-e2e.md:91-95`). |
| Per-tool stable coverage | **PASS — 11/11** | `E2E-014-R01` through `E2E-014-R11` independently cover `apply_patch`, `clock.curr_time`, `get_context_remaining`, `update_plan`, `exec_command`, `write_stdin`, `web.run`, `view_image`, `image_gen.imagegen`, `tool_search` plus an HTTPS MCP deferred tool, and `request_user_input` (`scenario-trace.yaml:192-202`; target list at `real-client-e2e.md:60`). |
| Critical negative/race coverage | **PASS** | Stable IDs cover forged OAuth state, replay, incorrect PKCE, wrong authority across all wait types, and stop/completion plus terminal-transition race (`E2E-001-R01`-`R03`, `E2E-004-R01`-`R02`; `scenario-trace.yaml:186-190`). Normative entries separately cover denial, expiry, cleartext, ownership, disconnect/replay, concurrency, recovery, SSRF/rebinding, secret/deletion, and release denial. |
| Capability-ledger/task join | **PASS** | Ledger states CAP-001 through CAP-032 are `Specified` and uses the trace as machine truth; task 16.0 requires exact Scenario uniqueness, registry closure, packaged CLI/PTY observation, and sanitized risk/exclusion receipts (`capability-ledger.md:366-397`, `403-432`; `tasks.md:159`). No reviewed artifact claims implementation or verification. |
| Final CAP-016 label countersign | **PASS** | Ledger CAP-016 now names the same `Subagent isolation` requirement and the same three scenarios as trace IDs `E2E-016-S01` through `E2E-016-S03` (`capability-ledger.md:381`; `scenario-trace.yaml:130-132`). This is a trace-label correction only and leaves the test gate unchanged. |
| Source-manifest freshness | **PASS** | The E2E and seven spec hashes embedded at `scenario-trace.yaml:3-11` equal the reviewed files byte-for-byte. The broader 19-input frozen revision is bound by this receipt's manifest above. |
| OpenSpec structural validation | **PASS** | `pnpm exec openspec validate implement-node-assistant-runtime --type change --strict --json` returned `valid: true`, 1 passed, 0 failed, and no issues. |

## Prior blocker closure

| Prior finding | Status | Closure evidence |
| --- | --- | --- |
| `TCR-001` / B1: trace records were not executable atomic cases | **Closed** | Each normative ID is explicitly atomic; exact action/assertion come from the referenced Scenario; suite fixture, type driver, type cleanup, closed oracle, and canonical receipt resolve mechanically (`scenario-trace.yaml:12-20`). |
| `TCR-002` / B3: risk variants and individual fixed tools lacked stable IDs | **Closed** | 16 required supplemental product cases assign independent IDs to OAuth abuse, authority/terminal races, and all 11 approved fixed-tool paths (`scenario-trace.yaml:186-202`). |
| `TCR-003` / B5: live, product, operational, and release cases were mixed | **Closed** | Four exclusive type contracts now exist; three live cases have distinct IDs/fixtures/receipts and explicit public-release blocking semantics (`scenario-trace.yaml:54-63`, `183-185`; `real-client-e2e.md:25-41`, `91-95`). |
| `TCR-004` / B2: product CLI evidence and oracle vocabulary were not closed | **Closed** | All 95 product cases include `cli`; the CLI/PTY driver entrypoint and 24 oracle meanings are registered (`scenario-trace.yaml:54-88`). |
| B4: review revision was stale or incompletely bound | **Closed** | All 19 supplied frozen inputs matched their requested hash prefixes and are recorded at full SHA-256 above. |
| Earlier `TCR-N01`: composite fixtures were ambiguous | **Closed** | Overlay composition is ordered left-to-right, conflicts fail at seed time, and the machine manifest uses arrays (`real-client-e2e.md:97`; `scenario-trace.yaml:17`, `21-53`). |
| Earlier `TCR-N02`: `F7` could hide independent live availability | **Closed** | `F7` activates only the credentials/quota/cleanup for each independent live ID, and each smoke has its own receipt (`real-client-e2e.md:108`; `scenario-trace.yaml:183-185`). |
| Earlier `TCR-N03`: free oracle labels could escape validation | **Closed** | The `+`-joined syntax is now mechanically tokenized against a closed 24-entry registry; every referenced token exists (`scenario-trace.yaml:64-88`). |

## Gate statement

The second frozen revision satisfies the Test Case Reviewer gate. It may proceed only to the remaining independent planning-review/spec-audit gates required by the repository workflow; this receipt is not Apply authorization and becomes stale if any manifest input changes.
