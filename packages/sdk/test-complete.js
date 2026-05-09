// Phase 5c runtime test — drive a delegated inference end-to-end.
//
// Usage:
//   node test-complete.js <provider-qvac-pubkey> [prompt]

import { complete, MODELS } from './src/inference.js'

const providerQvacPubKey = process.argv[2]
const prompt = process.argv[3] ?? 'What is 2 + 2?'

if (!providerQvacPubKey) {
  console.error('Usage: node test-complete.js <provider-qvac-pubkey> [prompt]')
  process.exit(1)
}

console.log(`Provider QVAC pubkey: ${providerQvacPubKey}`)
console.log(`Model               : llama-3.2-1b`)
console.log(`Prompt              : ${prompt}`)
console.log(`\nLoading delegated model (cold DHT bootstrap can take 15–45s)...`)

const t0 = Date.now()
const session = await complete({
  providerQvacPubKey,
  model: 'llama-3.2-1b',
  messages: [{ role: 'user', content: prompt }],
  stream: true,
  timeoutMs: 120_000,
  fallbackToLocal: false,
})
console.log(`Model handle ready in ${Date.now() - t0}ms (id: ${session.modelId})\n`)

console.log('--- Tokens ---')
let tokens = 0
for await (const token of session.tokenStream) {
  process.stdout.write(token)
  tokens++
}
console.log('\n--- End ---\n')

const stats = await session.stats
console.log(`Tokens streamed : ${tokens}`)
console.log(`Stats           :`, stats)

await session.unload()
process.exit(0)
