import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { Keypair, PublicKey } from '@solana/web3.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
loadEnv({ path: path.resolve(__dirname, '../.env.local') })
loadEnv({ path: path.resolve(__dirname, '../.env') })

function expandHome(p) {
  return p?.startsWith('~') ? path.join(homedir(), p.slice(1)) : p
}

function loadKeypair() {
  // Production (Railway): JSON byte array as env var string
  if (process.env.SOLANA_KEYPAIR_JSON) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.SOLANA_KEYPAIR_JSON))
    )
  }
  // Local dev: read from file path
  const filepath = expandHome(
    process.env.SOLANA_KEYPAIR_PATH ?? '~/.config/solana/id.json'
  )
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(filepath, 'utf8')))
  )
}

export const config = {
  rpcUrl: process.env.SOLANA_RPC_URL ?? 'http://127.0.0.1:8899',
  keypair: loadKeypair(),
  usdcMint: new PublicKey(process.env.USDC_MINT),
  programId: new PublicKey(process.env.LATTICE_PROGRAM_ID),
  stakeAmount: BigInt(process.env.STAKE_AMOUNT ?? '100000000'),
  pricePer1k: BigInt(process.env.PRICE_PER_1K ?? '1000'),
}
