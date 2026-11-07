# Pharos Multi-Protocol Aggregator — Architecture

The adapter layer is not a mock API or a single ERC-4626 vault duplicated twice. It supports **two independent Mainnet protocol types** and intentionally limits itself to Circle USDC to avoid comparing unrelated assets without price or bridge risk.

```mermaid
flowchart TD
 U[Public browser UI] --> API[Cloudflare Worker API]
 API --> V[Validate EVM address, amount and action]
 V --> MCP[Official hosted Pharos Chain MCP session]
 MCP --> CID{Mainnet chain ID 1672?}
 CID -->|No| STOP[Fail closed]
 CID -->|Yes| R[R25 Axil ERC-4626 adapter]
 CID -->|Yes| Z[Zona Aave V3-style adapter]
 R --> RES[Per-venue success or error]
 Z --> RES
 RES --> ROUTE[Explainable rate and liquidity ranking]
 ROUTE --> UI[Present rates, wallet positions and warnings]
 UI --> PLAN[Prepare action for selected venue]
 PLAN --> CHECK[On-chain allowance, position, maxWithdraw / maxDeposit checks]
 CHECK --> TX[Unsigned exact-value approve/supply/withdraw calldata]
 TX --> HUMAN[External user wallet must review & sign]
 ```

## Adapter contracts

**R25** has an ERC-4626 `asset()` gate to verify the vault is backed by the known Pharos USDC. Read-only `totalAssets()`, `previewRedeem()`, `balanceOf()`, `maxDeposit()`, and `maxWithdraw()` expose state and guard action preparation. The backend **does not** claim the queue can be bypassed; it refuses immediate `withdraw` when `maxWithdraw` is smaller than the request. For APY, two real share prices and on-chain timestamp differences are needed; if an archived read fails, the APY is explicitly unknown.

**Zona** uses Aave V3 style `getReserveData(USDC)` to retrieve the current supply liquidity rate, which is an annualized rate represented in RAY precision. The adapter verifies the returned aToken contract and uses its `balanceOf(owner)` to obtain the wallet's supplied USDC. Zone deposits use Pool `supply(asset,amount,owner,0)`, withdrawals Pool `withdraw(asset,amount,owner)`, which are subject to current liquidity and health-factor restrictions.

A venue's independent `try/catch` guarantees one failed contract read does not stop the other adapter. If no real return is available, that protocol's APY is **not** inferred.

## Routing policy

- On **deposit**, among venues with a verifiable on-chain APY, choose the highest rate after subtracting a *fixed, explicitly disclosed 1.5 percentage points* from R25 as a crude queue/illiquidity penalty. This is a task demonstration policy, **not** a calibrated quantitative risk model.
- If one is unavailable, route to the only working venue with a warning that no rate comparison exists.
- If neither APY is supported, refuse to auto-select but permit explicit choice with on-chain safety checks.
- On **withdraw**, route to the **venue where the user's shares or aTokens exist and are immediately withdrawable**. Never pretend a user can withdraw R25 deposits through Zona or vice versa.

## Transaction preparation, custody and limitations

- Contract destinations are pinned in source, never supplied by the client, so no arbitrary external call targets.
- User supplies a public EVM address and a decimal USDC amount, not a key.
- Deposit: ensure wallet USDC balance and R25 maxDeposit (when applicable); inspect USDC allowance, generate exact-value `approve` before `deposit` / `supply` when needed. Run `eth_call` preflight only if the allowance already exists; otherwise report `NEEDS_USER_APPROVAL`.
- Withdraw: verify `maxWithdraw` / aToken balance; preflight `eth_call` using the user's public address as sender. A failed simulation causes a refusal.
- All output is raw unsigned EVM transaction JSON (`chainId`, `from`, `to`, `data`, `value`). No key, signature, gas payer, broadcasting endpoint or mined receipt is present.
- Avoid actual money in review. Live unit / MCP tests require no financed wallet or signed transactions.

## Reviewer evidence

1. Unit tests: valid and invalid input, on-chain ABI decoding, APY math, both protocol adapters, isolated adapter failure, failover, and unsigned calldata.
2. Live MCP proof: the CI job connects to the official hosted MCP, checks both real Mainnet contracts, and archives raw availability and routing observations.
3. Published Worker: a separate CI job confirms the deployed page and both adapters, plus the clearly simulated Zona outage.
4. This architecture file is source-level evidence; it does **not** imply a video or a signed deposit/withdraw happened.

No video asset is created; the owner may record a short walk-through to receive optional bonus points.
