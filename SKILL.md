---
name: multi-protocol-aggregator
description: Query R25 Axil and Zona Lending independently on Pharos Mainnet, compare verifiable USDC rates, route safely, and prepare unsigned EVM deposit/withdraw actions only after on-chain checks.
---
# Operational rules
1. Only use official Pharos hosted read-only Chain MCP (`https://mcp.pharos.xyz/mcp`) with chain ID 1672.
2. Treat R25 as ERC-4626 and Zona as Aave V3-style separate protocols; verify their on-chain code, USDC asset, reserve state and wallet position where applicable.
3. Isolate protocol failures: one failing contract must never fabricate data or prevent the other from replying.
4. Route deposits by available verified APY with visible heuristic liquidity penalty. Never call unknown rate “0%” or guarantee returns.
5. Withdraw only from the protocol that actually holds the position and when limits and preflight permit it. Do not bypass redemption queues.
6. Never request or store keys; return unsigned calldata only. User signing and transaction broadcast always happen outside the public demo.
7. Cite protocol docs and disclose lockups, variable yield, borrower risk, stale data, and endpoint limitations.
