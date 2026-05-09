// Smoke test: pick the cheapest provider, lock 5 USDC into a job escrow,
// then read it back from on-chain.
import { createClient, loadConfigFromEnv } from './src/index.js'

const client = await createClient(loadConfigFromEnv())

const providers = await client.listProviders({ model: 'llama-3.2-1b' })
const provider = client.pickCheapest(providers)
if (!provider) throw new Error('No providers found — run the provider node first')

console.log(`Picked provider: ${provider.authority.toBase58()}`)

const lockAmount = 5_000_000n  // 5 USDC (6 decimals)
console.log(`Locking ${Number(lockAmount) / 1e6} USDC...`)

const { signature, jobId, jobEscrow, jobVault } = await client.lockJob({
  providerAuthority: provider.authority,
  amount: lockAmount,
})

console.log(`  tx          : ${signature}`)
console.log(`  job id      : ${Buffer.from(jobId).toString('hex')}`)
console.log(`  job escrow  : ${jobEscrow.toBase58()}`)
console.log(`  job vault   : ${jobVault.toBase58()}`)

const escrow = await client.readJobEscrow(jobEscrow)
console.log('\nOn-chain JobEscrow state:')
console.log(`  consumer    : ${escrow.consumer.toBase58()}`)
console.log(`  provider    : ${escrow.provider.toBase58()}`)
console.log(`  amount      : ${Number(escrow.amount) / 1e6} USDC`)
console.log(`  state       : ${Object.keys(escrow.state)[0]}`)
console.log(`  result_hash : ${escrow.resultHash ?? 'none'}`)
