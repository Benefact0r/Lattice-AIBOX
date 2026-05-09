import { PublicKey } from '@solana/web3.js'
import { createClient, loadConfigFromEnv } from './src/index.js'

const escrowAddr = process.argv[2]
if (!escrowAddr) { console.error('Usage: node inspect-job.js <escrow-pubkey>'); process.exit(1) }

const client = await createClient(loadConfigFromEnv())
const e = await client.readJobEscrow(new PublicKey(escrowAddr))
console.log('state       :', Object.keys(e.state)[0])
console.log('amount      :', Number(e.amount) / 1e6, 'USDC')
console.log('result_hash :', e.resultHash ? Buffer.from(e.resultHash).toString('hex') : 'none')
console.log('consumer    :', e.consumer.toBase58())
console.log('provider    :', e.provider.toBase58())
