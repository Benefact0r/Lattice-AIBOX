// @lattice/provider — QVAC provider node + Solana auto-registration
//
// Usage:
//   node src/index.js                          # random QVAC identity
//   node src/index.js <64-char-hex-seed>       # deterministic QVAC identity
//   node src/index.js <seed> <consumerPubKey>  # restrict to one consumer
//
// Solana config is read from packages/provider/.env.local (see .env.example).

import { startQVACProvider } from '@qvac/sdk'
import { config } from './config.js'
import {
  buildChainClient,
  isRegistered,
  registerProvider,
  deregisterProvider,
} from './chain.js'

const seed = process.argv[2] || null
const allowedConsumerKey = process.argv[3] || null

if (seed) {
  if (!/^[0-9a-f]{64}$/i.test(seed)) {
    console.error('ERROR: seed must be a 64-character hex string')
    process.exit(1)
  }
  process.env['QVAC_HYPERSWARM_SEED'] = seed
  console.log('Using deterministic QVAC seed (identity stable across restarts)')
}

console.log('\nLattice Provider starting...')
console.log(`  Solana RPC : ${config.rpcUrl}`)
console.log(`  Authority  : ${config.keypair.publicKey.toBase58()}`)

const qvac = await startQVACProvider({
  firewall: allowedConsumerKey
    ? { mode: 'allow', publicKeys: [allowedConsumerKey] }
    : undefined,
})

const { program } = buildChainClient({
  rpcUrl: config.rpcUrl,
  keypair: config.keypair,
  programId: config.programId,
})

const authority = config.keypair.publicKey
const alreadyRegistered = await isRegistered(program, authority)

let registrationSig = null
if (!alreadyRegistered) {
  console.log('\nNot yet registered on-chain — staking and registering...')
  registrationSig = await registerProvider({
    program,
    authority,
    qvacPubKeyHex: qvac.publicKey,
    usdcMint: config.usdcMint,
    models: ['llama-3.2-1b'],
    pricePer1k: config.pricePer1k,
    stakeAmount: config.stakeAmount,
  })
  console.log(`Registration tx: ${registrationSig}`)
} else {
  console.log('\nProvider already registered on-chain — skipping stake.')
}

console.log('\n=====================================================')
console.log('  LATTICE PROVIDER ONLINE')
console.log('=====================================================')
console.log(`  QVAC Pubkey  : ${qvac.publicKey}`)
console.log(`  Solana Auth  : ${authority.toBase58()}`)
console.log(`  Stake        : ${Number(config.stakeAmount) / 1e6} USDC`)
console.log(`  Price / 1k   : ${Number(config.pricePer1k) / 1e6} USDC`)
console.log(`  Firewall     : ${allowedConsumerKey ? `restricted to ${allowedConsumerKey.slice(0, 16)}...` : 'open (any consumer)'}`)
console.log(`  Registration : ${registrationSig ?? 'pre-existing'}`)
console.log('=====================================================')
console.log('\nWaiting for inference requests...\n')

process.on('SIGINT', async () => {
  console.log('\nShutting down provider...')
  if (process.env.DEREGISTER_ON_EXIT === 'true') {
    try {
      const sig = await deregisterProvider({ program, authority, usdcMint: config.usdcMint })
      console.log(`Deregistered (tx: ${sig})`)
    } catch (err) {
      console.error('Deregister failed:', err.message)
    }
  }
  process.exit(0)
})
