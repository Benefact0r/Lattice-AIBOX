// @lattice/web-api — REST + SSE gateway between the browser and the Lattice SDK.
//
// Why this exists: QVAC's P2P client is Node-only (Hyperswarm DHT, native deps),
// so the browser cannot run inference directly. This server holds a "demo wallet"
// that pays for inference on visitors' behalf, and exposes:
//
//   GET  /api/health
//   GET  /api/providers             — list active GPU providers from chain
//   POST /api/infer/stream          — SSE: token-by-token stream, then done/error event
//   POST /api/infer                 — non-streaming fallback (full response at once)

import express from 'express'
import cors from 'cors'
import { hashResult } from '@lattice/sdk'
import { createClient } from '@lattice/sdk'
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
app.use(
  cors({
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
  })
)

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

// Streaming endpoint — Server-Sent Events.
// Events:
//   data: {"type":"lock",   "jobId":"...", "lockSignature":"..."}
//   data: {"type":"token",  "text":"..."}
//   data: {"type":"done",   "jobId":"...", "lockSignature":"...", "settleSignature":"...",
//                           "resultHash":"...", "elapsedMs":1234}
//   data: {"type":"error",  "message":"..."}
app.post('/api/infer/stream', async (req, res) => {
  const { providerAuthority, prompt, private: isPrivate } = req.body ?? {}
  if (!providerAuthority || !prompt) {
    return res.status(400).json({ error: 'providerAuthority and prompt required' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  const t0 = Date.now()
  let inference = null

  try {
    const provider = await resolveProvider(providerAuthority)
    if (!provider) {
      send({ type: 'error', message: 'provider not found or inactive' })
      return res.end()
    }

    // 1. Lock escrow on-chain
    const lock = await client.lockJob({
      providerAuthority: provider.authority,
      amount: 1_000_000n,
    })
    send({ type: 'lock', jobId: Buffer.from(lock.jobId).toString('hex'), lockSignature: lock.signature })

    // 2. Stream tokens from QVAC
    inference = await client.complete({
      provider,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      timeoutMs: 120_000,
    })

    let fullText = ''
    for await (const token of inference.tokenStream) {
      fullText += token
      send({ type: 'token', text: token })
    }

    // 3. Settle on-chain
    const resultHash = hashResult(fullText)
    const settleSig = await client.settleJobAsConsumer({
      jobId: lock.jobId,
      resultHash,
      providerAuthority: provider.authority,
    })

    send({
      type: 'done',
      jobId: Buffer.from(lock.jobId).toString('hex'),
      lockSignature: lock.signature,
      settleSignature: settleSig,
      resultHash: resultHash.toString('hex'),
      elapsedMs: Date.now() - t0,
      privateRequested: !!isPrivate,
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

// Non-streaming fallback (keeps backward compat)
app.post('/api/infer', async (req, res) => {
  const { providerAuthority, prompt, private: isPrivate } = req.body ?? {}
  if (!providerAuthority || !prompt) {
    return res.status(400).json({ error: 'providerAuthority and prompt required' })
  }

  try {
    const provider = await resolveProvider(providerAuthority)
    if (!provider) return res.status(404).json({ error: 'provider not found or inactive' })

    const t0 = Date.now()
    const result = await client.inferAndSettle({
      provider,
      messages: [{ role: 'user', content: prompt }],
      timeoutMs: 120_000,
    })

    res.json({
      text: result.text,
      jobId: Buffer.from(result.jobId).toString('hex'),
      lockSignature: result.lockSignature,
      settleSignature: result.settleSignature,
      resultHash: result.resultHash.toString('hex'),
      elapsedMs: Date.now() - t0,
      privateRequested: !!isPrivate,
    })
  } catch (err) {
    console.error('infer failed:', err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(config.port, () => {
  console.log(`\nLattice web API listening on :${config.port}`)
  console.log(`  RPC      : ${config.rpcUrl}`)
  console.log(`  USDC     : ${config.usdcMint.toBase58()}`)
  console.log(`  Program  : ${config.programId.toBase58()}\n`)
})
