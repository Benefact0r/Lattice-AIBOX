// Optional env-based config loader for tests and quick dev scripts.
// Real applications should pass config explicitly to createClient().

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { Keypair, PublicKey } from '@solana/web3.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function expandHome(p) {
  return p?.startsWith('~') ? path.join(homedir(), p.slice(1)) : p
}

function loadKeypair(filepath) {
  const raw = JSON.parse(readFileSync(filepath, 'utf8'))
  return Keypair.fromSecretKey(Uint8Array.from(raw))
}

export function loadConfigFromEnv() {
  loadEnv({ path: path.resolve(__dirname, '../.env.local') })
  loadEnv({ path: path.resolve(__dirname, '../.env') })

  const keypairPath = expandHome(
    process.env.SOLANA_KEYPAIR_PATH ?? '~/.config/solana/id.json'
  )

  return {
    rpcUrl: process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899',
    keypair: loadKeypair(keypairPath),
    usdcMint: new PublicKey(process.env.USDC_MINT),
    programId: new PublicKey(process.env.LATTICE_PROGRAM_ID),
  }
}
