// Quick smoke test: list providers via the SDK against localnet.
import { createClient, loadConfigFromEnv } from './src/index.js'

const config = loadConfigFromEnv()
const client = await createClient(config)

const providers = await client.listProviders()
console.log(`Found ${providers.length} active provider(s):\n`)
for (const p of providers) {
  console.log(`  authority   : ${p.authority.toBase58()}`)
  console.log(`  qvac key    : ${p.qvacPubKey}`)
  console.log(`  models      : ${p.models.join(', ')}`)
  console.log(`  price/1k    : ${Number(p.pricePer1k) / 1e6} USDC`)
  console.log(`  stake       : ${Number(p.stakeAmount) / 1e6} USDC`)
  console.log(`  active      : ${p.active}`)
  console.log()
}

const cheapest = client.pickCheapest(providers)
if (cheapest) {
  console.log(`Cheapest: ${cheapest.authority.toBase58()} @ ${Number(cheapest.pricePer1k) / 1e6} USDC/1k`)
}
