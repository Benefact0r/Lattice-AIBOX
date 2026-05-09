use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{error::LatticeError, state::{JobEscrow, JobState, ProviderRecord}};

#[derive(Accounts)]
#[instruction(job_id: [u8; 32])]
pub struct SlashProvider<'info> {
    #[account(mut)]
    pub consumer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"job", consumer.key().as_ref(), job_id.as_ref()],
        bump = job_escrow.bump,
        constraint = job_escrow.state == JobState::Locked @ LatticeError::JobNotLocked,
        constraint = job_escrow.consumer == consumer.key() @ LatticeError::UnauthorizedConsumer,
    )]
    pub job_escrow: Account<'info, JobEscrow>,

    #[account(
        mut,
        seeds = [b"provider", provider_record.authority.as_ref()],
        bump = provider_record.bump,
        constraint = provider_record.authority == job_escrow.provider @ LatticeError::UnauthorizedProvider,
    )]
    pub provider_record: Account<'info, ProviderRecord>,

    #[account(
        mut,
        seeds = [b"job_vault", consumer.key().as_ref(), job_id.as_ref()],
        bump
    )]
    pub job_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"stake_vault", job_escrow.provider.as_ref()],
        bump
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = consumer_token_account.owner == consumer.key()
    )]
    pub consumer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<SlashProvider>, job_id: [u8; 32]) -> Result<()> {
    let consumer_key = ctx.accounts.consumer.key();
    let provider_key = ctx.accounts.job_escrow.provider;
    let locked_amount = ctx.accounts.job_escrow.amount;
    let job_vault_bump = ctx.bumps.job_vault;
    let stake_vault_bump = ctx.bumps.stake_vault;

    // Refund locked job amount back to consumer.
    let job_seeds: &[&[&[u8]]] = &[&[
        b"job_vault",
        consumer_key.as_ref(),
        job_id.as_ref(),
        &[job_vault_bump],
    ]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.job_vault.to_account_info(),
                to: ctx.accounts.consumer_token_account.to_account_info(),
                authority: ctx.accounts.job_vault.to_account_info(),
            },
            job_seeds,
        ),
        locked_amount,
    )?;

    // Slash an equal amount from the provider's stake (up to what's available).
    let penalty = locked_amount.min(ctx.accounts.provider_record.stake_amount);
    if penalty > 0 {
        let stake_seeds: &[&[&[u8]]] = &[&[
            b"stake_vault",
            provider_key.as_ref(),
            &[stake_vault_bump],
        ]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.stake_vault.to_account_info(),
                    to: ctx.accounts.consumer_token_account.to_account_info(),
                    authority: ctx.accounts.stake_vault.to_account_info(),
                },
                stake_seeds,
            ),
            penalty,
        )?;

        ctx.accounts.provider_record.stake_amount = ctx
            .accounts
            .provider_record
            .stake_amount
            .saturating_sub(penalty);
    }

    if ctx.accounts.provider_record.stake_amount == 0 {
        ctx.accounts.provider_record.active = false;
    }

    ctx.accounts.job_escrow.state = JobState::Slashed;

    msg!(
        "Provider slashed — refund: {}, penalty: {}, remaining stake: {}",
        locked_amount,
        penalty,
        ctx.accounts.provider_record.stake_amount
    );
    Ok(())
}
