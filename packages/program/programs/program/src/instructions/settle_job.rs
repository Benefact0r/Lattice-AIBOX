use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{error::LatticeError, state::{JobEscrow, JobState}};

#[derive(Accounts)]
#[instruction(job_id: [u8; 32])]
pub struct SettleJob<'info> {
    #[account(mut)]
    pub provider: Signer<'info>,

    /// CHECK: used only as a seed for PDA derivation, not signed.
    pub consumer: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"job", consumer.key().as_ref(), job_id.as_ref()],
        bump = job_escrow.bump,
        constraint = job_escrow.state == JobState::Locked @ LatticeError::JobNotLocked,
        constraint = job_escrow.provider == provider.key() @ LatticeError::UnauthorizedProvider,
    )]
    pub job_escrow: Account<'info, JobEscrow>,

    #[account(
        mut,
        seeds = [b"job_vault", consumer.key().as_ref(), job_id.as_ref()],
        bump
    )]
    pub job_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = provider_token_account.owner == provider.key()
    )]
    pub provider_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SettleJob>, job_id: [u8; 32], result_hash: [u8; 32]) -> Result<()> {
    let consumer_key = ctx.accounts.consumer.key();
    let amount = ctx.accounts.job_escrow.amount;
    let bump = ctx.bumps.job_vault;

    let seeds: &[&[&[u8]]] = &[&[b"job_vault", consumer_key.as_ref(), job_id.as_ref(), &[bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.job_vault.to_account_info(),
                to: ctx.accounts.provider_token_account.to_account_info(),
                authority: ctx.accounts.job_vault.to_account_info(),
            },
            seeds,
        ),
        amount,
    )?;

    let escrow = &mut ctx.accounts.job_escrow;
    escrow.result_hash = Some(result_hash);
    escrow.state = JobState::Settled;

    msg!("Job settled — provider paid: {}", amount);
    Ok(())
}
