import { randomBytes, createHash } from 'node:crypto'
import { SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import anchor from '@coral-xyz/anchor'
const { BN } = anchor
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'

import {
  deriveJobEscrow,
  deriveJobVault,
  deriveProviderRecord,
} from './chain.js'

export function newJobId() {
  return randomBytes(32)
}

/** Sha-256 hash of the inference response, used as the on-chain receipt. */
export function hashResult(text) {
  return createHash('sha256').update(text, 'utf8').digest()
}

export async function lockJob({
  program,
  consumer,
  providerAuthority,
  usdcMint,
  amount,
  jobId = newJobId(),
}) {
  const programId = program.programId
  const consumerTokenAccount = await getAssociatedTokenAddress(usdcMint, consumer)
  const providerRecord = deriveProviderRecord(providerAuthority, programId)
  const jobEscrow = deriveJobEscrow(consumer, jobId, programId)
  const jobVault = deriveJobVault(consumer, jobId, programId)

  const sig = await program.methods
    .lockJob(Array.from(jobId), new BN(amount.toString()))
    .accounts({
      consumer,
      providerRecord,
      jobEscrow,
      usdcMint,
      consumerTokenAccount,
      jobVault,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc()

  return { signature: sig, jobId, jobEscrow, jobVault }
}

export async function readJobEscrow(program, jobEscrow) {
  return program.account.jobEscrow.fetch(jobEscrow)
}

/**
 * Consumer-initiated settle. Releases escrowed USDC to the provider's
 * associated token account. The consumer's wallet (the program's anchor
 * provider) is the signer — no provider keypair required.
 *
 * `providerAuthority` defaults to whatever is stored on-chain in the
 * JobEscrow, so callers normally don't need to pass it.
 */
export async function settleJobAsConsumer({
  program,
  consumer,
  usdcMint,
  jobId,
  resultHash,
  providerAuthority = null,
}) {
  const programId = program.programId
  const jobEscrow = deriveJobEscrow(consumer, jobId, programId)
  const jobVault = deriveJobVault(consumer, jobId, programId)

  if (!providerAuthority) {
    const escrow = await program.account.jobEscrow.fetch(jobEscrow)
    providerAuthority = escrow.provider
  }

  const providerTokenAccount = await getAssociatedTokenAddress(usdcMint, providerAuthority)

  return program.methods
    .settleJob(Array.from(jobId), Array.from(resultHash))
    .accounts({
      settler: consumer,
      consumer,
      jobEscrow,
      jobVault,
      providerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc()
}
