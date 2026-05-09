# Lattice — Project Context

## What we're building
A decentralized AI inference marketplace. Two sides:
- **Developers** call an OpenAI-compatible SDK, pay anonymously in USDC via Hinkal on Solana
- **GPU owners** run QVAC provider nodes, stake USDC on Solana, earn per inference

## Tech stack
| Layer | Tool | Purpose |
|---|---|---|
| P2P AI inference | [QVAC by Tether](https://docs.qvac.tether.io) | Peer-to-peer LLM inference via Hyperswarm DHT |
| Blockchain | Solana (devnet → mainnet) | Provider registry, job escrow, payment settlement |
| Anonymous payments | [Hinkal](https://hinkal-team.gitbook.io/hinkal) | Shielded USDC transactions on Solana |
| Smart contracts | Anchor framework (Rust) | Solana program |

## Privacy model
Trust-based for MVP: providers see prompt content. Hinkal hides who paid. No native token — USDC only.

## Monorepo structure
```
lattice/
├── packages/
│   ├── program/     # Anchor/Rust — Solana program (registry, escrow, settlement, slash)
│   ├── provider/    # Node.js — QVAC provider node + Solana auto-registration
│   └── sdk/         # Node.js — consumer npm package (@lattice/sdk)
├── apps/
│   └── web/         # Landing page (already designed)
├── pnpm-workspace.yaml
└── PROJECT.md       # ← this file
```

## Build order (Month 1 MVP)
1. ✅ Project scaffold (pnpm monorepo)
2. 🔲 `packages/provider` — QVAC provider node, start with pure P2P (no Solana yet)
3. 🔲 `packages/program` — Anchor program: provider registry, escrow, settle, slash
4. 🔲 Wire provider to register itself on Solana at startup
5. 🔲 `packages/sdk` — consumer SDK: read registry → lock escrow → QVAC delegate → stream response
6. 🔲 Hinkal integration into SDK payment flow

## Solana program — what it needs to do
- `register_provider(pubkey, models[], price_per_1k, stake_amount)` — add to registry
- `deregister_provider()` — remove and unstake
- `lock_job(provider_pubkey, amount)` — consumer locks USDC for one inference
- `settle_job(result_hash)` — provider commits result hash, releases payment
- `slash_provider(pubkey)` — called if provider goes offline or submits bad result

## QVAC key APIs
```js
// Provider side
import { startQVACProvider } from '@qvac/sdk'
const { publicKey } = await startQVACProvider()

// Consumer side
import { loadModel, completion } from '@qvac/sdk'
const modelId = await loadModel({
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  modelType: 'llm',
  delegate: { providerPublicKey, timeout: 60_000, fallbackToLocal: true }
})
const response = completion({ modelId, history: [{ role: 'user', content: '...' }], stream: true })
```

## Developer environment
- OS: Windows
- Node: v20 (fnm)
- Package manager: pnpm
- Solana: devnet
- Anchor: latest via avm

## Next immediate task
Write `packages/provider/src/index.js`:
- Start a QVAC provider node
- Print the public key
- Accept inference requests
- (Later) register that public key on Solana with stake

## Key docs
- QVAC: https://docs.qvac.tether.io/sdk/examples/p2p/delegated-inference/
- Anchor: https://www.anchor-lang.com/docs
- Hinkal: https://hinkal-team.gitbook.io/hinkal
- Solana devnet faucet: https://faucet.solana.com
