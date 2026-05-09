use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{error::LatticeError, state::{JobEscrow, JobState, ProviderRecord}};

#[derive(Accounts)]
#[instruction(job_id: [u8; 32])]
pub struct LockJob<'info> {
    #[account(mut)]
    pub consumer: Signer<'info>,

    #[account(
        seeds = [b"provider", provider_record.authority.as_ref()],
        bump = provider_record.bump,
        constraint = provider_record.active @ LatticeError::ProviderInactive
    )]
    pub provider_record: Account<'info, ProviderRecord>,

    #[account(
        init,
        payer = consumer,
        space = JobEscrow::space(),
        seeds = [b"job", consumer.key().as_ref(), job_id.as_ref()],
        bump
    )]
    pub job_escrow: Account<'info, JobEscrow>,

    #[account(
        mut,
        constraint = consumer_token_account.owner == consumer.key()
    )]
    pub consumer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"job_vault", consumer.key().as_ref(), job_id.as_ref()],
        bump
    )]
    pub job_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<LockJob>, _job_id: [u8; 32], amount: u64) -> Result<()> {
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.consumer_token_account.to_account_info(),
                to: ctx.accounts.job_vault.to_account_info(),
                authority: ctx.accounts.consumer.to_account_info(),
            },
        ),
        amount,
    )?;

    let escrow = &mut ctx.accounts.job_escrow;
    escrow.consumer = ctx.accounts.consumer.key();
    escrow.provider = ctx.accounts.provider_record.authority;
    escrow.amount = amount;
    escrow.result_hash = None;
    escrow.state = JobState::Locked;
    escrow.bump = ctx.bumps.job_escrow;

    msg!("Job locked — consumer: {:?}, amount: {}", ctx.accounts.consumer.key(), amount);
    Ok(())
}
