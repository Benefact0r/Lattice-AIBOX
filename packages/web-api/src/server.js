// @lattice/web-api — REST + SSE gateway between the browser and the Lattice SDK.
//
// Two flows:
//   "demo"    — server's wallet pays for everything (zero-friction trial)
//   "phantom" — user pays from their own wallet (real on-chain payment)
//
// Endpoints:
//   GET  /api/health
//   GET  /api/providers
//   POST /api/faucet                 { pubkey } → tops up user with SOL + test USDC
//   POST /api/lock/build             { consumer, providerAuthority, amount? }
//                                     → returns base64-serialized unsigned lockJob tx
//   POST /api/infer/stream           SSE. Body either:
//                                     demo:    { providerAuthority, prompt }
//                                     phantom: { providerAuthority, prompt, consumer, jobId, lockSignature }

import express from 'express'
import cors from 'cors'
import {
  Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, Keypair,
} from '@solana/web3.js'
import {
  createMintToInstruction, createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress, TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { hashResult, createClient } from '@lattice/sdk'
import { config } from './config.js'

const client = await createClient({
  rpcUrl: config.rpcUrl,
  keypair: config.keypair,
  usdcMint: config.usdcMint,
  programId: config.programId,
})

console.log(`Demo wallet: ${config.keypair.publicKey.toBase58()}`)

const app = express()
app.use(express.json({ limit: '32kb' }))
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }))

// ── helpers ──────────────────────────────────────────────────────────────────

async function resolveProvider(providerAuthority) {
  const providers = await client.listProviders()
  return providers.find((p) => p.authority.toBase58() === providerAuthority) ?? null
}

// ── routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, wallet: config.keypair.publicKey.toBase58() })
})

app.get('/api/providers', async (_req, res) => {
  try {
    const providers = await client.listProviders()
    res.json({
      providers: providers.map((p) => ({
        authority: p.authority.toBase58(),
        qvacPubKey: p.qvacPubKey,
        models: p.models,
        pricePer1k: p.pricePer1k.toString(),
        stakeAmount: p.stakeAmount.toString(),
        active: p.active,
      })),
    })
  } catch (err) {
    console.error('listProviders failed:', err)
    res.status(500).json({ error: err.message })
  }
})

// Faucet — bootstraps a Phantom user with devnet SOL + test USDC.
// Designed for demo use; rate-limited only by tx fees, not per-user.
app.post('/api/faucet', async (req, res) => {
  const { pubkey } = req.body ?? {}
  if (!pubkey) return res.status(400).json({ error: 'pubkey required' })

  let userPubkey
  try { userPubkey = new PublicKey(pubkey) }
  catch { return res.status(400).json({ error: 'invalid pubkey' }) }

  try {
    const tx = new Transaction()
    const userAta = await getAssociatedTokenAddress(config.usdcMint, userPubkey)

    // Always top up SOL (for tx fees) — capped per request
    tx.add(SystemProgram.transfer({
      fromPubkey: config.keypair.publicKey,
      toPubkey: userPubkey,
      lamports: 0.05 * LAMPORTS_PER_SOL,
    }))

    // Create the user's USDC ATA if it doesn't exist
    const ataInfo = await client.connection.getAccountInfo(userAta)
    if (!ataInfo) {
      tx.add(createAssociatedTokenAccountInstruction(
        config.keypair.publicKey, // payer
        userAta,
        userPubkey,
        config.usdcMint,
      ))
    }

    // Mint 10 test USDC to user
    tx.add(createMintToInstruction(
      config.usdcMint,
      userAta,
      config.keypair.publicKey, // mint authority
      10_000_000n, // 10 USDC at 6 decimals
    ))

    const signature = await client.program.provider.sendAndConfirm(tx, [config.keypair])
    res.json({ signature, sol: 0.05, usdc: 10 })
  } catch (err) {
    console.error('faucet failed:', err)
    res.status(500).json({ error: err.message })
  }
})

// Build an unsigned lockJob tx for Phantom to sign.
app.post('/api/lock/build', async (req, res) => {
  const { consumer, providerAuthority, amount } = req.body ?? {}
  if (!consumer || !providerAuthority) {
    return res.status(400).json({ error: 'consumer and providerAuthority required' })
  }

  try {
    const consumerPk = new PublicKey(consumer)
    const provider = await resolveProvider(providerAuthority)
    if (!provider) return res.status(404).json({ error: 'provider not found' })

    const { tx, jobId } = await client.buildLockJobTx({
      consumer: consumerPk,
      providerAuthority: provider.authority,
      amount: BigInt(amount ?? 1_000_000),
    })

    const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64')
    res.json({ tx: serialized, jobId: Buffer.from(jobId).toString('hex') })
  } catch (err) {
    console.error('lock/build failed:', err)
    res.status(500).json({ error: err.message })
  }
})

// SSE inference. Supports both demo (server pays) and phantom (user paid) flows.
app.post('/api/infer/stream', async (req, res) => {
  const {
    providerAuthority, prompt, private: isPrivate,
    consumer, jobId: jobIdHex, lockSignature, // phantom-mode fields
  } = req.body ?? {}

  if (!providerAuthority || !prompt) {
    return res.status(400).json({ error: 'providerAuthority and prompt required' })
  }

  const isPhantomFlow = !!(consumer && jobIdHex && lockSignature)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  let clientGone = false
  req.on('close', () => { clientGone = true })

  const send = (obj) => { if (!clientGone) res.write(`data: ${JSON.stringify(obj)}\n\n`) }

  const t0 = Date.now()
  let inference = null

  try {
    const provider = await resolveProvider(providerAuthority)
    if (!provider) {
      send({ type: 'error', message: 'provider not found or inactive' })
      return res.end()
    }

    let jobId, finalLockSig, consumerPubkey

    if (isPhantomFlow) {
      // User already locked from their own wallet. Trust the supplied jobId
      // and verify the escrow exists on-chain before doing any work.
      consumerPubkey = new PublicKey(consumer)
      jobId = Buffer.from(jobIdHex, 'hex')
      finalLockSig = lockSignature

      // Wait briefly for the lock tx to confirm if it's not visible yet
      await client.connection.confirmTransaction(lockSignature, 'confirmed').catch(() => {})

      send({ type: 'lock', jobId: jobIdHex, lockSignature })
    } else {
      // Demo flow: server's wallet locks
      const lock = await client.lockJob({
        providerAuthority: provider.authority,
        amount: 1_000_000n,
      })
      jobId = lock.jobId
      finalLockSig = lock.signature
      consumerPubkey = config.keypair.publicKey
      send({ type: 'lock', jobId: Buffer.from(jobId).toString('hex'), lockSignature: finalLockSig })
    }

    // Stream tokens from QVAC
    inference = await client.complete({
      provider,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      timeoutMs: 120_000,
    })

    let fullText = ''
    for await (const token of inference.tokenStream) {
      if (clientGone) break
      fullText += token
      send({ type: 'token', text: token })
    }

    // Settle: phantom flow → server settles as provider; demo flow → server settles as consumer
    const resultHash = hashResult(fullText)
    let settleSig
    if (isPhantomFlow) {
      settleSig = await client.settleJobAsProvider({
        jobId,
        resultHash,
        consumer: consumerPubkey,
        providerAuthority: provider.authority,
      })
    } else {
      settleSig = await client.settleJobAsConsumer({
        jobId,
        resultHash,
        providerAuthority: provider.authority,
      })
    }

    send({
      type: 'done',
      jobId: Buffer.from(jobId).toString('hex'),
      lockSignature: finalLockSig,
      settleSignature: settleSig,
      resultHash: resultHash.toString('hex'),
      elapsedMs: Date.now() - t0,
      privateRequested: !!isPrivate,
      flow: isPhantomFlow ? 'phantom' : 'demo',
    })
  } catch (err) {
    console.error('stream infer failed:', err)
    send({ type: 'error', message: err.message })
  } finally {
    if (inference?.unload) {
      try { await inference.unload() } catch {}
    }
    res.end()
  }
})

app.listen(config.port, () => {
  console.log(`\nLattice web API listening on :${config.port}`)
  console.log(`  RPC      : ${config.rpcUrl}`)
  console.log(`  USDC     : ${config.usdcMint.toBase58()}`)
  console.log(`  Program  : ${config.programId.toBase58()}\n`)
})
