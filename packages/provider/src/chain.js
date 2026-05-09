import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import anchor from '@coral-xyz/anchor'
const { AnchorProvider, Program, BN, Wallet } = anchor
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'

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
      `Program ID mismatch: IDL says ${program.programId.toBase58()}, env says ${programId.toBase58()}`
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

export function deriveStakeVault(authority, programId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('stake_vault'), authority.toBuffer()],
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

/**
 * Provider-side manual settle (e.g. claim after consumer no-show).
 * Caller's wallet (the provider authority) is the signer.
 */
export async function settleJob({
  program,
  provider,
  consumer,
  usdcMint,
  jobId,
  resultHash,
}) {
  const programId = program.programId
  const providerTokenAccount = await getAssociatedTokenAddress(usdcMint, provider)
  const jobEscrow = deriveJobEscrow(consumer, jobId, programId)
  const jobVault = deriveJobVault(consumer, jobId, programId)

  return program.methods
    .settleJob(Array.from(jobId), Array.from(resultHash))
    .accounts({
      settler: provider,
      consumer,
      jobEscrow,
      jobVault,
      providerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()
}

export async function isRegistered(program, authority) {
  const recordPda = deriveProviderRecord(authority, program.programId)
  const info = await program.provider.connection.getAccountInfo(recordPda)
  return info !== null
}

/**
 * Returns the on-chain QVAC pubkey (hex) for this provider, or null if
 * not registered. Used at boot to detect a drifted identity (e.g. provider
 * restarted on a new machine with a new keypair).
 */
export async function readOnChainQvacPubKey(program, authority) {
  const recordPda = deriveProviderRecord(authority, program.programId)
  try {
    const acct = await program.account.providerRecord.fetch(recordPda)
    return Buffer.from(acct.qvacPubkey).toString('hex')
  } catch {
    return null
  }
}

export async function registerProvider({
  program,
  authority,
  qvacPubKeyHex,
  usdcMint,
  models,
  pricePer1k,
  stakeAmount,
}) {
  const qvacBytes = Buffer.from(qvacPubKeyHex, 'hex')
  if (qvacBytes.length !== 32) throw new Error('QVAC pubkey must be 32 bytes (64 hex chars)')

  const providerTokenAccount = await getAssociatedTokenAddress(usdcMint, authority)
  const stakeVault = deriveStakeVault(authority, program.programId)
  const providerRecord = deriveProviderRecord(authority, program.programId)

  return program.methods
    .registerProvider(
      Array.from(qvacBytes),
      models.map((m) => Array.from(Buffer.from(m.padEnd(32, '\0'), 'utf8').subarray(0, 32))),
      new BN(pricePer1k.toString()),
      new BN(stakeAmount.toString())
    )
    .accounts({
      authority,
      providerRecord,
      usdcMint,
      providerTokenAccount,
      stakeVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc()
}

export async function updateProvider({
  program,
  authority,
  qvacPubKeyHex,
  models,
  pricePer1k,
}) {
  const qvacBytes = Buffer.from(qvacPubKeyHex, 'hex')
  if (qvacBytes.length !== 32) throw new Error('QVAC pubkey must be 32 bytes (64 hex chars)')

  const providerRecord = deriveProviderRecord(authority, program.programId)

  return program.methods
    .updateProvider(
      Array.from(qvacBytes),
      models.map((m) => Array.from(Buffer.from(m.padEnd(32, '\0'), 'utf8').subarray(0, 32))),
      new BN(pricePer1k.toString())
    )
    .accounts({
      authority,
      providerRecord,
    })
    .rpc()
}

export async function deregisterProvider({ program, authority, usdcMint }) {
  const providerTokenAccount = await getAssociatedTokenAddress(usdcMint, authority)
  const stakeVault = deriveStakeVault(authority, program.programId)
  const providerRecord = deriveProviderRecord(authority, program.programId)

  return program.methods
    .deregisterProvider()
    .accounts({
      authority,
      providerRecord,
      providerTokenAccount,
      stakeVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc()
}
