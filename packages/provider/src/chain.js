import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { AnchorProvider, Program, BN, Wallet } from '@coral-xyz/anchor'
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

export async function isRegistered(program, authority) {
  const recordPda = deriveProviderRecord(authority, program.programId)
  const info = await program.provider.connection.getAccountInfo(recordPda)
  return info !== null
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
