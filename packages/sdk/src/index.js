// @lattice/sdk — public API for consumers.
//
// Quick start:
//   import { createClient } from '@lattice/sdk'
//   const client = await createClient({ keypair, rpcUrl, usdcMint, programId })
//   const providers = await client.listProviders({ model: 'llama-3.2-1b' })
//   const { text } = await client.inferAndSettle({
//     provider: providers[0], messages: [{ role: 'user', content: 'Hi' }]
//   })

import { buildChainClient } from './chain.js'
import { listProviders, pickCheapest } from './registry.js'
import { lockJob, readJobEscrow, newJobId, settleJobAsConsumer, settleJobAsProvider, buildLockJobTx, hashResult } from './escrow.js'
import { complete, MODELS } from './inference.js'

export { listProviders, pickCheapest } from './registry.js'
export { lockJob, readJobEscrow, newJobId, settleJobAsConsumer, settleJobAsProvider, buildLockJobTx, hashResult } from './escrow.js'
export { complete, MODELS } from './inference.js'
export { loadConfigFromEnv } from './config.js'

/** Default escrow amount per job, in USDC micro-units (1.0 USDC). */
const DEFAULT_LOCK_AMOUNT = 1_000_000n

export async function createClient(config) {
  const { rpcUrl, keypair, usdcMint, programId } = config
  if (!rpcUrl || !keypair || !usdcMint || !programId) {
    throw new Error('createClient requires { rpcUrl, keypair, usdcMint, programId }')
  }

  const { connection, program, wallet } = buildChainClient({ rpcUrl, keypair, programId })
  const consumer = keypair.publicKey

  /**
   * One-shot: lock USDC, run delegated inference, settle escrow.
   * Returns the assembled response text plus on-chain receipts.
   *
   * @param {object} args
   * @param {object} args.provider          ProviderRecord from listProviders()
   * @param {Array}  args.messages          Chat history
   * @param {string} [args.model]           Defaults to provider's first model
   * @param {bigint} [args.amount]          Escrow amount (default 1.0 USDC)
   * @param {number} [args.timeoutMs]       Inference timeout
   * @param {boolean}[args.fallbackToLocal] Run locally if delegate fails
   */
  async function inferAndSettle({
    provider,
    messages,
    model,
    amount = DEFAULT_LOCK_AMOUNT,
    timeoutMs = 60_000,
    fallbackToLocal = false,
  }) {
    // 1. Lock escrow on-chain
    const lock = await lockJob({
      program,
      consumer,
      providerAuthority: provider.authority,
      usdcMint,
      amount,
    })

    let inference, fullText = ''
    try {
      // 2. Delegated inference over QVAC
      inference = await complete({
        providerQvacPubKey: provider.qvacPubKey,
        model: model ?? provider.models[0],
        messages,
        stream: true,
        timeoutMs,
        fallbackToLocal,
      })

      for await (const token of inference.tokenStream) {
        fullText += token
      }
    } catch (err) {
      // Inference failed — leave escrow locked so the consumer can decide
      // (re-attempt, slash, or claw back via timeout). Don't auto-settle a failure.
      throw new Error(`Inference failed (escrow ${lock.jobEscrow.toBase58()} still locked): ${err.message}`)
    } finally {
      if (inference?.unload) {
        try { await inference.unload() } catch {}
      }
    }

    // 3. Auto-settle to provider
    const resultHash = hashResult(fullText)
    const settleSig = await settleJobAsConsumer({
      program,
      consumer,
      usdcMint,
      jobId: lock.jobId,
      resultHash,
      providerAuthority: provider.authority,
    })

    return {
      text: fullText,
      stats: inference?.stats ? await inference.stats : null,
      jobId: lock.jobId,
      jobEscrow: lock.jobEscrow,
      lockSignature: lock.signature,
      settleSignature: settleSig,
      resultHash,
    }
  }

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
    settleJobAsConsumer: ({ jobId, resultHash, providerAuthority }) =>
      settleJobAsConsumer({ program, consumer, usdcMint, jobId, resultHash, providerAuthority }),
    settleJobAsProvider: ({ jobId, resultHash, consumer: c, providerAuthority }) =>
      settleJobAsProvider({ program, providerAuthority: providerAuthority ?? consumer, consumer: c, usdcMint, jobId, resultHash }),
    buildLockJobTx: ({ consumer: c, providerAuthority, amount, jobId }) =>
      buildLockJobTx({ program, consumer: c, providerAuthority, usdcMint, amount, jobId }),
    complete: ({ provider, model, messages, stream, timeoutMs, fallbackToLocal }) =>
      complete({
        providerQvacPubKey: provider.qvacPubKey,
        model: model ?? provider.models[0],
        messages,
        stream,
        timeoutMs,
        fallbackToLocal,
      }),
    inferAndSettle,
  }
}
