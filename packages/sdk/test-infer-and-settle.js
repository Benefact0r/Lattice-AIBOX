// End-to-end auto-settle test (Phase C).
// Locks USDC → runs delegated inference → consumer-side auto-settles.
// Asserts: the escrow's vault drains and the on-chain state flips to Settled.
//
// We measure on the *vault* (not the provider's ATA) because in dev the
// consumer and provider often share a wallet, making ATA-delta measurement
// noisy. The vault is per-job and unambiguous.
//
// Usage:
//   node test-infer-and-settle.js [prompt]

import { getAccount } from '@solana/spl-token'
import { createClient, loadConfigFromEnv } from './src/index.js'
import { deriveJobVault } from './src/chain.js'

const prompt = process.argv[2] ?? 'Reply with exactly: 4'

const config = loadConfigFromEnv()
const client = await createClient(config)
const consumer = config.keypair.publicKey

console.log('1. Listing providers...')
const providers = await client.listProviders()
if (providers.length === 0) {
  console.error('   No active providers. Start the provider node first.')
  process.exit(1)
}
const provider = client.pickCheapest(providers)
console.log(`   Authority    : ${provider.authority.toBase58()}`)
console.log(`   QVAC pubkey  : ${provider.qvacPubKey}`)
console.log(`   Price/1k     : ${Number(provider.pricePer1k) / 1e6} USDC\n`)

const amount = 1_000_000n // 1.0 USDC

console.log(`2. inferAndSettle (lock ${Number(amount) / 1e6} USDC → infer → auto-settle)`)
console.log(`   Prompt: "${prompt}"`)
console.log('   Cold-start may take 30–60s on first run...\n')

const t0 = Date.now()
const result = await client.inferAndSettle({
  provider,
  messages: [{ role: 'user', content: prompt }],
  amount,
  timeoutMs: 120_000,
  fallbackToLocal: false,
})
const elapsed = Date.now() - t0

console.log('--- Response ---')
console.log(result.text)
console.log('--- End ---\n')

console.log(`   Elapsed       : ${elapsed}ms`)
console.log(`   Job ID        : ${Buffer.from(result.jobId).toString('hex')}`)
console.log(`   Lock tx       : ${result.lockSignature}`)
console.log(`   Settle tx     : ${result.settleSignature}`)
console.log(`   Result hash   : ${result.resultHash.toString('hex')}\n`)

console.log('3. Verifying on-chain state...')
const escrow = await client.readJobEscrow(
  result.jobEscrow ?? client.program.programId
)
const vaultPda = deriveJobVault(consumer, result.jobId, config.programId)
const vault = await getAccount(client.connection, vaultPda)

console.log(`   Escrow state  : ${JSON.stringify(escrow.state)}`)
console.log(`   Vault balance : ${vault.amount} (should be 0)`)

const onChainHash = escrow.resultHash ? Buffer.from(escrow.resultHash).toString('hex') : null
console.log(`   On-chain hash : ${onChainHash}`)
console.log(`   Local hash    : ${result.resultHash.toString('hex')}`)

const settled = 'settled' in escrow.state
const drained = vault.amount === 0n
const hashMatches = onChainHash === result.resultHash.toString('hex')

if (settled && drained && hashMatches) {
  console.log('\nAUTO-SETTLE WORKING — escrow settled, vault drained, hash recorded.')
  process.exit(0)
} else {
  console.error(`\nFAIL — settled=${settled} drained=${drained} hashMatches=${hashMatches}`)
  process.exit(1)
}
