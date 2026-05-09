import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Connection, PublicKey } from '@solana/web3.js'
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const idlPath = path.resolve(__dirname, '../../program/target/idl/lattice.json')
const idl = JSON.parse(readFileSync(idlPath, 'utf8'))

export function buildChainClient({ rpcUrl, keypair, programId }) {
  const connection = new Connection(rpcUrl, 'confirmed')
  const wallet = new Wallet(keypair)
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' })
  const program = new Program(idl, provider)

  if (program.programId.toBase58() !== programId.toBase58()) {
    throw new Error(
      `Program ID mismatch: IDL says ${program.programId.toBase58()}, config says ${programId.toBase58()}`
    )
  }

  return { connection, provider, program, wallet }
}

export function deriveProviderRecord(authority, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('provider'), authority.toBuffer()],
    programId
  )[0]
}

export function deriveJobEscrow(consumer, jobId, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('job'), consumer.toBuffer(), Buffer.from(jobId)],
    programId
  )[0]
}

export function deriveJobVault(consumer, jobId, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('job_vault'), consumer.toBuffer(), Buffer.from(jobId)],
    programId
  )[0]
}

export function deriveStakeVault(authority, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stake_vault'), authority.toBuffer()],
    programId
  )[0]
}
