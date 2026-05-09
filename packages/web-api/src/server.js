// @lattice/web-api — REST gateway between the browser and the Lattice SDK.
//
// Why this exists: QVAC's P2P client is Node-only (Hyperswarm DHT, native deps),
// so the browser cannot run inference directly. This server holds a "demo wallet"
// that pays for inference on visitors' behalf, and exposes:
//
//   GET  /api/providers   — list active GPU providers from chain
//   POST /api/infer       — { providerAuthority, prompt, private? } → { text, ... }

import express from 'express'
import cors from 'cors'
import { PublicKey } from '@solana/web3.js'
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

app.post('/api/infer', async (req, res) => {
  const { providerAuthority, prompt, private: isPrivate } = req.body ?? {}
  if (!providerAuthority || !prompt) {
    return res.status(400).json({ error: 'providerAuthority and prompt required' })
  }

  try {
    const providers = await client.listProviders()
    const provider = providers.find(
      (p) => p.authority.toBase58() === providerAuthority
    )
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
      // Until Hinkal's Solana SDK ships, this just echoes the request flag —
      // the actual transactions are non-shielded. The UI can show "Private"
      // when this is true; we'll wire a real shielded path when available.
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
