// @lattice/sdk — public API for consumers.
//
// Quick start:
//   import { createClient } from '@lattice/sdk'
//   const client = await createClient({ keypair, rpcUrl, usdcMint, programId })
//   const providers = await client.listProviders({ model: 'llama-3.2-1b' })

import { buildChainClient } from './chain.js'
import { listProviders, pickCheapest } from './registry.js'
import { lockJob, readJobEscrow, newJobId } from './escrow.js'
import { complete, MODELS } from './inference.js'

export { listProviders, pickCheapest } from './registry.js'
export { lockJob, readJobEscrow, newJobId } from './escrow.js'
export { complete, MODELS } from './inference.js'
export { loadConfigFromEnv } from './config.js'

export async function createClient(config) {
  const { rpcUrl, keypair, usdcMint, programId } = config
  if (!rpcUrl || !keypair || !usdcMint || !programId) {
    throw new Error('createClient requires { rpcUrl, keypair, usdcMint, programId }')
  }

  const { connection, program, wallet } = buildChainClient({ rpcUrl, keypair, programId })
  const consumer = keypair.publicKey

  return {
    connection,
    program,
    wallet,
    config,
    listProviders: (opts) => listProviders(program, opts),
    pickCheapest,
    lockJob: ({ providerAuthority, amount, jobId }) =>
      lockJob({ program, consumer, providerAuthority, usdcMint, amount, jobId }),
    readJobEscrow: (jobEscrow) => readJobEscrow(program, jobEscrow),
    complete: ({ provider, model, messages, stream, timeoutMs, fallbackToLocal }) =>
      complete({
        providerQvacPubKey: provider.qvacPubKey,
        model: model ?? provider.models[0],
        messages,
        stream,
        timeoutMs,
        fallbackToLocal,
      }),
  }
}
