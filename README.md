# Multi-Protocol Aggregator — Pharos Agent Arena

**Task:** Hard · Cross-tool / Advanced · 200 points (+50 optional video).

**Repository:** https://github.com/trantanlong2411-droid/Multi-Protocol-Aggregator
**Expected linked Cloudflare Worker (verify production before submitting):** https://multi-protocol-aggregator.trantanlong2411.workers.dev/

## Two independent Pharos Mainnet protocols

| Adapter | Address (Pharos chain 1672) | Read | Transaction preparation |
|---|---|---|---|
| **R25 Axil 7-day credit vault** | `0x1c2bc8b553d9a7e61f7531a3a4bf2162f4569268` | ERC-4626 asset, previewRedeem, totalAssets, share balance, maxDeposit, maxWithdraw; historical PPS yield when archived reads work | ERC-4626 `deposit(assets,receiver)` and `withdraw(assets,receiver,owner)` **only if maxWithdraw permits**; withdrawal queues are not impersonated |
| **Zona Lending (Aave V3 style)** | `0xda464e68208A3083Eb65FE5c522a72AeD1C1372a` | Live `getReserveData(USDC)` supplied rate and aToken address, aToken balance and total supply | Aave V3 `supply(USDC,assets,owner,0)` or `withdraw(USDC,assets,owner)`, with wallet-balance check and read-only preflight |

Verified Circle USDC Pharos Mainnet token: `0xC879C018dB60520F4355C26eD1a6D572cdAC1815` (6 decimals).

No hosted MCP sends funds. **Unsigned transaction preparation** produces inert JSON calldata; no private keys are requested, no wallet is connected or signed, and no deposit/withdraw is broadcast. On-chain execution and the eventual receipt can only be completed by the user's own EVM wallet, after independent review. Don't claim any deposits were mined.

## How this meets all five challenge requirements

1. **At least two protocols behind one interface:** two dedicated ABI adapters, both routed through the official hosted [Pharos Chain MCP](https://github.com/PharosNetwork/pharos-mcp) in one page. Only addresses validated by actual Mainnet reads are displayed as available. Not merely two vaults from the same provider.
2. **Queries and actions:** users can view live on-chain protocol state, USDC supply rates, estimated R25 share-price history rate (when available), and wallet positions by pasting a PUBLIC address. They can prepare typed unsigned `approve`, `deposit` and `withdraw` EVM transactions with fixed target addresses and exact amounts.
3. **Best venue routing:** only verified, comparable APYs are ranked, with a clearly disclosed **1.5 percentage-point penalty** applied to R25's illiquidity in deposit heuristics. The recommendation explains the rate, queue limitations and surviving options. Withdrawals can only come from the venue holding the actual wallet position and with enough immediately withdrawable balance; no cross-venue fungibility is invented.
4. **Resilience:** each adapter's failures are caught separately. One failed protocol is marked unavailable while the other still responds and remains eligible. An explicit labeled **Test Zona unavailable** control demonstrates isolation without fabricating a real outage.
5. **Architecture and demo:** [ARCHITECTURE.md](ARCHITECTURE.md), automated ABI/unit tests, live MCP smoke test, production Worker test, and this public website. Optional video is **not generated** here.

## Important failure and safety boundaries

- **R25 may queue redemptions.** A seven-day withdrawal queue does not imply `withdraw()` is callable immediately. The agent checks `maxWithdraw(owner)` and performs an `eth_call` preflight; if the immediate limit is insufficient, it refuses to invent undocumented queue operations. Use the official R25 app for an actual request.
- **Zona's liquidity and collateral constraints** can block withdrawals even with sufficient aToken balance. Read-only `eth_call` preflight from the wallet checks immediate executability. It is not a promise of the final transaction outcome.
- **Approvals are separate user-signed transactions**, and can change between plan generation and broadcast. Approve only the exact amount; if the token requires a reset, the plan explicitly labels that optional reset step.
- **Rates are not guaranteed.** Zona uses the current supply-rate RAY from the Aave-style reserve data. R25 APY is calculated only when a real historical share-price query and timestamp are available. Otherwise the UI shows **APY unavailable** rather than inventing it.
- The router heuristic is a demo prioritization policy, not a full risk-adjusted yield optimizer. It does not verify all protocol audits, liquidation risks or financial suitability.
- If both adapters fail, the agent refuses to select a venue rather than reporting invented metrics. It does not move funds on its own.
- Chain MCP hosted tool endpoints are read-only by default; `send_raw_transaction` is disabled on the official hosted server.
- No user address, API key, or private key is persisted. Only public blockchain reads are used.

## UI walkthrough for the reviewer

1. Open the deployed Worker. Press **Scan live protocols** with the wallet field blank. Inspect both R25 and Zona, the live APYs (or explicit unavailable status), and the best-venue explanation.
2. Optionally paste a **public** Pharos address with real positions and scan again to see `balanceOf` / aToken balances. Zero positions are valid and should not be fabricated.
3. Press **Test Zona unavailable**. The result is clearly labeled simulated outage; R25 remains scanned live and usable.
4. Pick a venue and deposit amount. With an actual public wallet address, press **Prepare unsigned transaction**. The tool verifies balance and limits, returns unsigned `approve` and `deposit` calldata, or explains why no transaction can be prepared. No signing is possible in the app.
5. Test **Withdraw** on the same wallet; if position or instant liquidity is insufficient, verify the refusal. If it passes, inspect the unsigned preflight-checked `withdraw` call.
6. Review [unit/build/live MCP verification](https://github.com/trantanlong2411-droid/Multi-Protocol-Aggregator/actions), plus [architecture](ARCHITECTURE.md). Real money should never be used for the demonstration.

## API

| Method | Route | Explanation |
|---|---|---|
| GET | `/` | Public UI |
| GET | `/api/health` | Version, safety flags and network info |
| GET | `/api/venues` | Exact supported contracts |
| POST | `/api/scan` | `{"wallet":"0x..." ,"simulateUnavailable":"zona"}` with fields optional; returns live venue data and routing |
| POST | `/api/prepare` | `{"wallet":"0x...","action":"deposit","venue":"zona","amount":"1.0"}` → unsigned steps or safe refusal |

## Local / deployed

```bash
npm install
npm test
npm run build             # Wrangler dry run; does NOT publish
npm run smoke             # real hosted Chain MCP, no signing
npx wrangler deploy       # actual Cloudflare publishing
```

Cloudflare Workers & Pages → **multi-protocol-aggregator** → Settings → Builds: connect `trantanlong2411-droid/Multi-Protocol-Aggregator`, branch `main`, project root `/`, deploy command `npx wrangler deploy`. After deployment, `/api/health` should report `pharos-multi-protocol-2026-11-07-v1`.

## Reference material

- [Official Pharos Chain MCP](https://github.com/PharosNetwork/pharos-mcp)
- [EIP-4626 vault spec](https://eips.ethereum.org/EIPS/eip-4626)
- [Aave V3 withdraw mechanism](https://aave.com/docs/aave-v3/markets/withdraw)
- [R25 app / vault terms](https://app.r25.xyz/vaults)
- [Zona app](https://app.zona.finance)
- [Protocol registry / addresses cross-check (community)](https://github.com/hosein-ul/pharos-rwa-yield-router/blob/main/assets/protocols.json)
