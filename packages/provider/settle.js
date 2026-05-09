// Manually settle a job. MVP — to be replaced by auto-settle on inference complete.
//
// Usage:
//   node settle.js <consumer-pubkey> <job-id-hex> [result-hash-hex]
//
// If result-hash is omitted, a placeholder zero hash is used (test only).

import { createHash } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import { config } from './src/config.js'
import { buildChainClient, settleJob } from './src/chain.js'

const [, , consumerArg, jobIdHexArg, resultHashHexArg] = process.argv

if (!consumerArg || !jobIdHexArg) {
  console.error('Usage: node settle.js <consumer-pubkey> <job-id-hex> [result-hash-hex]')
  process.exit(1)
}

const consumer = new PublicKey(consumerArg)
const jobId = Buffer.from(jobIdHexArg, 'hex')
if (jobId.length !== 32) {
  console.error('job-id must be 32 bytes (64 hex chars)')
  process.exit(1)
}

const resultHash = resultHashHexArg
  ? Buffer.from(resultHashHexArg, 'hex')
  : createHash('sha256').update('test-settlement-placeholder').digest()

const { program } = buildChainClient({
  rpcUrl: config.rpcUrl,
  keypair: config.keypair,
  programId: config.programId,
})

const sig = await settleJob({
  program,
  provider: config.keypair.publicKey,
  consumer,
  usdcMint: config.usdcMint,
  jobId,
  resultHash,
})

console.log(`Settled.`)
console.log(`  tx          : ${sig}`)
console.log(`  consumer    : ${consumer.toBase58()}`)
console.log(`  job id      : ${jobId.toString('hex')}`)
console.log(`  result hash : ${resultHash.toString('hex')}`)
