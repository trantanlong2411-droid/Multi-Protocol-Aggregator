# Reviewer evidence — Multi-Protocol Aggregator

**Hard / Cross-tool / Advanced: 200 points (+50 optional video)**

## Evidence map
| Task rubric | Inspect |
|---|---|
| At least two independent protocols | `src/protocols.mjs` adapters for ERC-4626 R25 and Aave-style Zona; live Worker `POST /api/scan` verifies contracts |
| Queries positions, rates, and actions prepared for signature | `scanR25`, `scanZona`, `prepare`; preflight and typed unsigned JSON, no signing |
| Best-venue router + explanation | `rankVenues`, current on-chain APYs, explicit queue penalty / availability explanations |
| One protocol unavailable does not break others | Fail-isolated scan + explicit `simulateUnavailable:'zona'` test case |
| Architecture / demo | `ARCHITECTURE.md`, `README.md`, public UI and CI run logs; optional user-created video not currently available |

Use [GitHub Actions](https://github.com/trantanlong2411-droid/Multi-Protocol-Aggregator/actions) for current live verification. A passing bundle test is not a real contract test; a live MCP run (with both `status:'available'`) is needed before claiming complete multi-protocol function.

**Important:** Producing unsigned transactions is not a mined deposit or withdrawal. The official hosted Pharos Chain MCP disables broadcast. R25 withdrawals can require a seven-day queue; the backend must not invent a queue method. Reviewers should see explicit refusal rather than a false success report.
