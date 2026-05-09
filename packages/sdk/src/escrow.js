import { randomBytes } from 'node:crypto'
import { SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'

import {
  deriveJobEscrow,
  deriveJobVault,
  deriveProviderRecord,
} from './chain.js'

export function newJobId() {
  return randomBytes(32)
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
