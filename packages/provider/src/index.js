// @lattice/provider — QVAC provider node
// Phase 1: pure P2P, no Solana yet
//
// Usage:
//   node src/index.js                          # random identity
//   node src/index.js <64-char-hex-seed>       # deterministic identity
//   node src/index.js <seed> <consumerPubKey>  # restrict to one consumer

import { startQVACProvider } from '@qvac/sdk'

// --- Config from args ---
const seed = process.argv[2] || null
const allowedConsumerKey = process.argv[3] || null

if (seed) {
  if (!/^[0-9a-f]{64}$/i.test(seed)) {
    console.error('ERROR: seed must be a 64-character hex string')
    process.exit(1)
  }
  process.env['QVAC_HYPERSWARM_SEED'] = seed
  console.log('Using deterministic seed (identity will be stable across restarts)')
}

// --- Start provider ---
console.log('\nLattice Provider starting...')
console.log('Connecting to Hyperswarm DHT...\n')

const provider = await startQVACProvider({
  firewall: allowedConsumerKey
    ? {
        mode: 'allow',
        publicKeys: [allowedConsumerKey],
      }
    : undefined,
})

console.log('=====================================================')
console.log('  LATTICE PROVIDER ONLINE')
console.log('=====================================================')
console.log(`  Public Key : ${provider.publicKey}`)
console.log(`  Firewall   : ${allowedConsumerKey ? `restricted to ${allowedConsumerKey.slice(0, 16)}...` : 'open (any consumer)'}`)
console.log('=====================================================')
console.log('\nWaiting for inference requests...\n')

// --- Graceful shutdown ---
process.on('SIGINT', async () => {
  console.log('\nShutting down provider...')
  process.exit(0)
})
